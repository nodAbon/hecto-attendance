/**
 * ================================================================
 * 헥토 근태 시스템 - 세콤 MySQL → Supabase 동기화 데몬
 * ================================================================
 * 서버PC에서만 실행 (AWS VPN 연결 필요)
 * pm2 start index.js --name hecto-sync
 * ================================================================
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');

loadSyncEnv();

// ── 설정 ──────────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS) || 180_000; // 3분
const MY_COMPANY_CODE  = process.env.MY_COMPANY_CODE || '1600';

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

// 대상 부서 (스타팅빌딩 근무)
// Gate code mapping
const GATE_MAPPING = {
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

// ── 유틸 ──────────────────────────────────────────────────────────
function parseATime(aTime) {
  if (!aTime || aTime.length < 14) return null;
  const y  = aTime.substring(0, 4);
  const mo = aTime.substring(4, 6);
  const d  = aTime.substring(6, 8);
  const h  = aTime.substring(8, 10);
  const mi = aTime.substring(10, 12);
  const s  = aTime.substring(12, 14);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
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

function log(level, msg, detail = '') {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const prefix = { INFO: '✅', WARN: '⚠️', ERROR: '❌' }[level] || 'ℹ️';
  console.log(`[${now}] ${prefix} ${msg}${detail ? ' | ' + detail : ''}`);
}

// MySQL은 읽기전용 — SELECT만 허용
async function queryMysql(conn, sql, params = []) {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW')) {
    throw new Error('읽기전용 DB - SELECT만 허용');
  }
  const [rows] = await conn.execute(sql, params);
  return rows;
}

// ── 동기화 함수 ───────────────────────────────────────────────────

async function syncEmployees(conn) {
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

async function syncAttendance(conn) {
  const now = new Date();
  // 3개월 전 1일부터 당월 말까지 동기화
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10);
  const fromStr  = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}${String(fromDate.getDate()).padStart(2, '0')}000000`;

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
      gate_name:  GATE_MAPPING[r.eq_code] || `게이트(${r.eq_code})`,
      flag1:      r.flag1,
      event_type: flag1ToEventType(r.flag1),
      synced_at:  new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('sa_attendance')
      .upsert(batch, { onConflict: 'sabun,a_time' });

    if (error) throw new Error(`출입로그 upsert 실패: ${error.message}`);
    total += batch.length;
  }
  return total;
}

async function syncLeaves(conn) {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10);
  const fromStr   = `${fromDate.getFullYear()}${String(fromDate.getMonth() + 1).padStart(2, '0')}${String(fromDate.getDate()).padStart(2, '0')}`;

  const rows = await queryMysql(conn, `
    SELECT
      y.I_EMPLOY_NO                  AS emp_no,
      e.N_EMPLOY_NAME                AS emp_name,
      y.D_START_DATE                 AS start_date,
      y.D_END_DATE                   AS end_date,
      y.I_CODE                       AS leave_code,
      COALESCE(c.N_NAME, tc.NAME)    AS leave_name,
      CAST(y.O_ANNLEV_CNT AS CHAR)   AS leave_days,
      y.I_STATUS                     AS status
    FROM hr_yuncha_use y
    INNER JOIN hr_employee e ON e.I_COMPANY = y.I_COMPANY AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
    INNER JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
    LEFT JOIN hr_diligence_code c ON c.I_CODE = y.I_CODE
    LEFT JOIN tong_code tc ON tc.GUBUN_CODE = 'H0281' AND tc.CODE = y.I_CODE
    WHERE y.I_COMPANY = ?
      AND y.I_STATUS = '40'
      AND y.D_END_DATE >= ?
  `, [MY_COMPANY_CODE, fromStr]);

  if (rows.length === 0) return 0;

  const records = rows.map(r => ({
    emp_no:     r.emp_no,
    emp_name:   r.emp_name,
    start_date: r.start_date,
    end_date:   r.end_date,
    leave_code: r.leave_code,
    leave_name: r.leave_name,
    leave_days: parseFloat(r.leave_days) || 0,
    status:     r.status,
    synced_at:  new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('sa_leaves')
    .upsert(records, { onConflict: 'emp_no,start_date,leave_code' });

  if (error) throw new Error(`연차 upsert 실패: ${error.message}`);
  return rows.length;
}

// ── 메인 루프 ─────────────────────────────────────────────────────
async function runSync() {
  const startedAt = Date.now();
  log('INFO', '동기화 시작');

  let conn = null;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    // 단일 커넥션이므로 순차 실행
    const empCount   = await syncEmployees(conn);
    const attCount   = await syncAttendance(conn);
    const leaveCount = await syncLeaves(conn);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    log('INFO', `동기화 완료 (${elapsed}s)`,
      `직원 ${empCount}명 | 출입로그 ${attCount}건 | 연차 ${leaveCount}건`);

  } catch (err) {
    log('ERROR', '동기화 실패', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

// ── 시작 ──────────────────────────────────────────────────────────
log('INFO', `헥토 근태 동기화 데몬 시작 (${SYNC_INTERVAL_MS / 1000}초 주기)`);
runSync();
setInterval(runSync, SYNC_INTERVAL_MS);
