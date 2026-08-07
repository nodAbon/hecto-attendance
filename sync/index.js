/**
 * ================================================================
 * 헥토 근태 시스템 - 통합 동기화 데몬 (세콤/캡스/연차/임직원)
 * ================================================================
 * 실행: pm2 start index.js --name hecto-sync
 * ================================================================
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');
const { syncLeavesToNaverWorks } = require('./naverWorks');

loadSyncEnv();

// ── 설정 ──────────────────────────────────────────────────────────
// 실행 주기: 30분 (1,800,000 ms)
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS) || 1_800_000;
const MY_COMPANY_CODE  = process.env.MY_COMPANY_CODE || '1600';
const CAPS_E_GROUP     = process.env.CAPS_E_GROUP || '08';

const MYSQL_CONFIG = {
  host:           process.env.MYSQL_HOST,
  user:           process.env.MYSQL_USER,
  password:       process.env.MYSQL_PASSWORD,
  database:       process.env.MYSQL_DATABASE,
  port:           parseInt(process.env.MYSQL_PORT) || 3306,
  connectTimeout: 15_000,
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 세콤 게이트 매핑
const SECOM_GATE_MAPPING = {
  '0001': '태광_11층정문',  '0002': '태광_11층비상문', '0003': '태광_10층정문',
  '0007': '태광_12층정문',  '0008': '태광_12층비상문', '0009': '태광_13층정문',
  '0010': '태광_13층비상문','0011': '태광_10층비상문', '0013': '태광_9층정문',
  '0014': '태광_9층비상문', '0015': '태광_14층',
  '1001': '큰길_1101호',   '1002': '큰길_3층 자동문', '1003': '큰길_3층 후문',
  '1004': '큰길_1102호',   '1005': '큰길_20층 이노(IN)', '1006': '큰길_20층 이노(OUT)',
  '1007': '큰길_20층 파이(IN)', '1008': '큰길_20층 파이(OUT)', '1009': '큰길_3층 헥토',
  '2001': '큰길_10층 우측', '2002': '큰길_10층 좌측', '2003': '큰길_5층 연구소',
  '3001': '큰길_5층',
  '4000': '헥토큐앤엠',
  '5001': '채움_외부문',   '5002': '채움_후문',       '5003': '채움_화장실',
  '5004': '채움_내부문',   '5005': '채움_식수1',      '5006': '채움_식수2',
  '6000': '드림베이',
  '9000': '큰길_10층 이노',
  '1000': '큰길_10층',
};

// 캡스 게이트 매핑
const CAPS_GATE_MAPPING = {
  '4000': 'CAPS',
  '4004': 'CAPS',
};

// 직원 목록 최종 동기화 날짜 관리 (1일 1회 실행 제어용)
let lastEmployeeSyncDate = '';

// ── 유틸 ──────────────────────────────────────────────────────────
function parseATime(aTime) {
  if (!aTime || String(aTime).length < 14) return null;
  const s = String(aTime);
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}T${s.substring(8, 10)}:${s.substring(10, 12)}:${s.substring(12, 14)}+09:00`;
}

function flag1ToEventType(flag1) {
  if (flag1 === '1') return '출근';
  if (flag1 === '4') return '퇴근';
  return '출입';
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function pickFirstValue(row, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key]);
    if (value) return value;
  }
  return '';
}

function extractEmployeeEmail(row) {
  const value = pickFirstValue(row, ['email', 'EMAIL', 'I_EMAIL', 'N_EMAIL', 'EMAIL_ADDRESS', 'email_address']);
  return value.includes('@') ? value : '';
}

function extractEmployeeLoginId(row) {
  return pickFirstValue(row, ['login_id', 'LOGIN_ID', 'user_id', 'USER_ID', 'userid', 'USERID', 'loginid'])
    || (extractEmployeeEmail(row).split('@')[0] || '');
}

function normalizeEmpNo(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(MY_COMPANY_CODE) && digits.length >= 12) {
    return digits.slice(MY_COMPANY_CODE.length).slice(-8).replace(/^0+/, '') || digits.slice(-8);
  }
  return digits.slice(-8).replace(/^0+/, '') || digits.slice(-8);
}

function buildCapsGateName(row) {
  const parts = [row.e_group, row.e_mode, row.e_type, row.e_result]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '출입';
}

function stripAttendanceSource(rows = []) {
  return rows.map(({ source, ...rest }) => rest);
}

function isMissingAttendanceSourceColumn(error) {
  return String(error?.code || '') === 'PGRST204'
    || String(error?.message || '').toLowerCase().includes('source');
}

function log(level, msg, detail = '') {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const prefix = { INFO: '✅', WARN: '⚠️', ERROR: '❌' }[level] || 'ℹ️';
  console.log(`[${now}] ${prefix} ${msg}${detail ? ' | ' + detail : ''}`);
}

async function queryMysql(conn, sql, params = []) {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW')) {
    throw new Error('읽기전용 DB - SELECT만 허용');
  }
  const [rows] = await conn.execute(sql, params);
  return rows;
}

// ── 동기화 함수들 ─────────────────────────────────────────────────

// 1. 임직원 마스터 동기화 (1일 1회만 수행됨)
async function syncEmployees(conn) {
  log('INFO', '임직원 정보 동기화 시작');
  const rows = await queryMysql(conn, `
    SELECT
      e.*,
      e.I_EMPLOY_NO   AS emp_no,
      e.N_EMPLOY_NAME AS name,
      d.N_DEPT        AS dept
    FROM hr_employee e
    INNER JOIN hr_department d ON d.I_COMPANY = ? AND d.I_DEPT = e.I_DEPT
    WHERE e.I_COMPANY = ?
      AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
    ORDER BY d.N_DEPT, e.N_EMPLOY_NAME
  `, [MY_COMPANY_CODE, MY_COMPANY_CODE]);

  if (rows.length === 0) return 0;

  const { data: existingEmps, error: fetchErr } = await supabase
    .from('sa_employees')
    .select('emp_no, is_active, status');
  if (fetchErr) throw new Error(`기존 직원 조회 실패: ${fetchErr.message}`);
  const existingMap = new Map((existingEmps || []).map(e => [e.emp_no, e]));

  const records = rows.map(r => {
    const existing = existingMap.get(r.emp_no);
    return {
      emp_no:       r.emp_no,
      name:         r.name,
      dept:         r.dept,
      email:        extractEmployeeEmail(r) || null,
      login_id:     extractEmployeeLoginId(r) || null,
      company_code: MY_COMPANY_CODE,
      is_active:    existing ? existing.is_active : true,
      status:       existing ? (existing.status || 'active') : 'active',
      synced_at:    new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('sa_employees')
    .upsert(records, { onConflict: 'emp_no' });

  if (error) throw new Error(`직원 upsert 실패: ${error.message}`);
  return rows.length;
}

// 2. 세콤 출입기록 동기화 (최근 1일치)
async function syncSecomAttendance(conn) {
  const now = new Date();
  // 최근 2시간 전부터 동기화 (네트워크 데이터 소모량 최소화)
  const fromDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const fromStr  = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}${String(fromDate.getDate()).padStart(2, '0')}${String(fromDate.getHours()).padStart(2, '0')}${String(fromDate.getMinutes()).padStart(2, '0')}00`;

  const rows = await queryMysql(conn, `
    SELECT
      e.I_EMPLOY_NO       AS emp_no,
      t.Sabun             AS sabun,
      t.CardNo            AS card_no,
      t.ATime             AS a_time,
      CAST(t.EqCode AS CHAR) AS eq_code,
      t.Flag1             AS flag1
    FROM t_secom_alarm t
    INNER JOIN hr_employee e ON
      e.I_COMPANY = ?
      AND t.Sabun IS NOT NULL AND t.Sabun <> ''
      AND e.I_COMPANY = LEFT(t.Sabun, 4)
      AND e.I_EMPLOY_NO = RIGHT(t.Sabun, 8)
    INNER JOIN hr_department d ON d.I_COMPANY = ? AND d.I_DEPT = e.I_DEPT
    WHERE COALESCE(e.I_RETIRE_YN, '0') <> '1'
      AND t.ATime >= '${fromStr}'
    ORDER BY t.ATime DESC
  `, [MY_COMPANY_CODE, MY_COMPANY_CODE]);

  if (rows.length === 0) return 0;

  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => ({
      sabun:      r.sabun,
      emp_no:     r.emp_no,
      card_no:    r.card_no,
      a_time:     r.a_time,
      log_time:   parseATime(r.a_time),
      eq_code:    r.eq_code,
      gate_name:  SECOM_GATE_MAPPING[r.eq_code] || `게이트(${r.eq_code})`,
      flag1:      r.flag1,
      event_type: flag1ToEventType(r.flag1),
      source:     'secom',
      synced_at:  new Date().toISOString(),
    }));

    let { error } = await supabase
      .from('sa_attendance')
      .upsert(batch, { onConflict: 'sabun,a_time' });

    if (error && isMissingAttendanceSourceColumn(error)) {
      ({ error } = await supabase
        .from('sa_attendance')
        .upsert(stripAttendanceSource(batch), { onConflict: 'sabun,a_time' }));
    }

    if (error) throw new Error(`세콤 출입로그 upsert 실패: ${error.message}`);
    total += batch.length;
  }
  return total;
}

// 3. 캡스 출입기록 동기화 (최근 1일치)
async function syncCapsAttendance(conn) {
  const now = new Date();
  // 최근 2시간 전부터 동기화 (네트워크 데이터 소모량 최소화)
  const fromDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const fromDateStr = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}${String(fromDate.getDate()).padStart(2, '0')}`;
  const fromTimeStr = `${String(fromDate.getHours()).padStart(2, '0')}${String(fromDate.getMinutes()).padStart(2, '0')}00`;

  const rows = await queryMysql(conn, `
    SELECT
      e.I_EMPLOY_NO AS emp_no,
      t.E_IDNO      AS idno,
      t.E_CARD      AS card_no,
      t.E_DATE      AS e_date,
      t.E_TIME      AS e_time,
      t.G_ID        AS gate_code,
      t.E_GROUP     AS e_group,
      t.E_MODE      AS e_mode,
      t.E_TYPE      AS e_type,
      t.E_RESULT    AS e_result
    FROM tenter t
    INNER JOIN hr_employee e ON
      e.I_COMPANY = ?
      AND t.E_IDNO IS NOT NULL
      AND t.E_IDNO <> ''
      AND e.I_COMPANY = LEFT(t.E_IDNO, 4)
      AND e.I_EMPLOY_NO = RIGHT(t.E_IDNO, 8)
    INNER JOIN hr_department d ON
      d.I_COMPANY = ?
      AND d.I_DEPT = e.I_DEPT
    WHERE COALESCE(e.I_RETIRE_YN, '0') <> '1'
      AND t.E_GROUP = ?
      AND (
        t.E_DATE > ?
        OR (t.E_DATE = ? AND t.E_TIME >= ?)
      )
    ORDER BY t.E_DATE DESC, t.E_TIME DESC
  `, [MY_COMPANY_CODE, MY_COMPANY_CODE, CAPS_E_GROUP, fromDateStr, fromDateStr, fromTimeStr]);

  if (rows.length === 0) return 0;

  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(row => {
      const empNo = normalizeEmpNo(row.emp_no || row.idno);
      const sabun = String(row.idno || '').trim() || `${MY_COMPANY_CODE}${String(empNo).padStart(8, '0')}`;
      const aTime = `${String(row.e_date || '').replace(/\D/g, '').slice(0, 8)}${String(row.e_time || '').replace(/\D/g, '').slice(0, 6).padStart(6, '0')}`;

      return {
        sabun,
        emp_no:     empNo || null,
        card_no:    row.card_no ? String(row.card_no) : null,
        a_time:     aTime,
        log_time:   parseATime(aTime),
        eq_code:    row.gate_code ? String(row.gate_code) : null,
        gate_name:  buildCapsGateName(row) || CAPS_GATE_MAPPING[String(row.gate_code || '')] || '출입',
        flag1:      null,
        event_type: '출입',
        source:     'caps',
        synced_at:  new Date().toISOString(),
      };
    });

    let { error } = await supabase
      .from('sa_attendance')
      .upsert(batch, { onConflict: 'sabun,a_time' });

    if (error && isMissingAttendanceSourceColumn(error)) {
      ({ error } = await supabase
        .from('sa_attendance')
        .upsert(stripAttendanceSource(batch), { onConflict: 'sabun,a_time' }));
    }

    if (error) throw new Error(`캡스 출입로그 upsert 실패: ${error.message}`);
    total += batch.length;
  }
  return total;
}

// 4. 연차/휴가 내역 동기화 (최근 1일치)
async function syncLeaves(conn) {
  const now = new Date();
  // 최근 1일치 (어제부터 오늘까지)
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const toDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  const fromStr  = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}${String(fromDate.getDate()).padStart(2, '0')}`;
  const toStr    = `${toDate.getFullYear()}${String(toDate.getMonth() + 1).padStart(2, '0')}${String(toDate.getDate()).padStart(2, '0')}`;

  const rows = await queryMysql(conn, `
    SELECT
      y.I_EMPLOY_NO                  AS emp_no,
      e.N_EMPLOY_NAME                AS emp_name,
      d.N_DEPT                       AS dept,
      y.D_START_DATE                 AS start_date,
      y.D_END_DATE                   AS end_date,
      y.I_CODE                       AS leave_code,
      CAST(y.I_CODE AS CHAR)         AS leave_name,
      CAST(y.O_ANNLEV_CNT AS CHAR)   AS leave_days,
      y.I_STATUS                     AS status
    FROM hr_yuncha_use y
    INNER JOIN hr_employee e ON e.I_COMPANY = y.I_COMPANY AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
    INNER JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
    WHERE y.I_COMPANY = ?
      AND y.I_STATUS = '40'
      AND y.D_END_DATE >= ?
      AND y.D_START_DATE <= ?
  `, [MY_COMPANY_CODE, fromStr, toStr]);

  if (rows.length === 0) return 0;

  const records = rows.map(r => ({
    emp_no:     r.emp_no,
    emp_name:   r.emp_name,
    dept:       r.dept,
    start_date: r.start_date,
    end_date:   r.end_date,
    leave_code: r.leave_code,
    leave_name: r.leave_name,
    leave_days: parseFloat(r.leave_days) || 0,
    status:     r.status,
    synced_at:  new Date().toISOString(),
  }));

  const uniqueRecords = [];
  const seen = new Set();
  for (const r of records) {
    const key = `${r.emp_no}_${r.start_date}_${r.leave_code}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRecords.push(r);
    }
  }

  const { error } = await supabase
    .from('sa_leaves')
    .upsert(uniqueRecords, { onConflict: 'emp_no,start_date,leave_code' });

  if (error) throw new Error(`연차 upsert 실패: ${error.message}`);

  // 네이버웍스 프로필 상태 동기화
  try {
    const empNos = [...new Set(uniqueRecords.map(r => r.emp_no))];
    const { data: emps } = await supabase
      .from('sa_employees')
      .select('emp_no, email, dept')
      .in('emp_no', empNos);

    const empMap = new Map((emps || []).map(e => [e.emp_no, e]));
    const leavesWithEmails = uniqueRecords.map(r => {
      const emp = empMap.get(r.emp_no);
      return {
        ...r,
        dept: r.dept || emp?.dept || null,
        email: emp?.email || null,
      };
    });

    await syncLeavesToNaverWorks(leavesWithEmails);
  } catch (nwErr) {
    console.error('[NaverWorks Sync Error]', nwErr.message);
  }

  return uniqueRecords.length;
}

// ── 메인 루프 ─────────────────────────────────────────────────────
async function runSync() {
  const startedAt = Date.now();
  log('INFO', '동기화 시작');

  let conn = null;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    // KST 기준 오늘 날짜 문자열 획득 (예: 2026-07-03)
    const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

    let empCount = 0;
    // 날짜가 바뀌었을 때만 임직원 마스터 동기화 실행 (1일 1회)
    if (todayKst !== lastEmployeeSyncDate) {
      empCount = await syncEmployees(conn);
      lastEmployeeSyncDate = todayKst;
      log('INFO', `임직원 정보 동기화 완료: ${empCount}명`);
    } else {
      log('INFO', '임직원 정보 동기화 건너뜀 (오늘 이미 동기화됨)');
    }

    // 출입기록 동기화 (30분 주기 실행, 최근 2시간 범위)
    const secomCount  = await syncSecomAttendance(conn);
    const capsCount   = await syncCapsAttendance(conn);
    const leaveCount  = await syncLeaves(conn);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    log('INFO', `동기화 완료 (${elapsed}s)`,
      `세콤 ${secomCount}건 | 캡스 ${capsCount}건 | 연차 ${leaveCount}건`);

  } catch (err) {
    log('ERROR', '동기화 실패', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

// ── 시작 ──────────────────────────────────────────────────────────
log('INFO', `통합 근태 동기화 데몬 시작 (${SYNC_INTERVAL_MS / 1000 / 60}분 주기)`);
runSync();
setInterval(runSync, SYNC_INTERVAL_MS);
