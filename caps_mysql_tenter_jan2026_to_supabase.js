/**
 * tenter.E_GROUP = '08' 중 2026년 1월 데이터만 Supabase sa_attendance로 업서트
 * - MySQL은 조회만 수행
 * - 기본은 dry-run
 * - 실제 반영은 --apply 옵션 필요
 *
 * 실행 예시:
 *   node caps_mysql_tenter_jan2026_to_supabase.js
 *   node caps_mysql_tenter_jan2026_to_supabase.js --apply
 */

const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');
const fs = require('node:fs');
const path = require('node:path');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 10000,
};

const COMPANY_CODE = '1600';
const APPLY = process.argv.includes('--apply');
const START_DATE = '20260101';
const END_DATE = '20260131';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) return;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, '.env.local'));
  loadEnvFile(path.join(cwd, '.env'));
}

function requireSupabaseConfig() {
  loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }

  return { supabaseUrl, supabaseServiceRoleKey };
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeEmpNoFromIdno(idno) {
  const digits = normalizeDigits(idno);
  if (!digits) return '';
  if (digits.startsWith(COMPANY_CODE) && digits.length >= 12) {
    return digits.slice(COMPANY_CODE.length).slice(-8).padStart(8, '0');
  }
  if (digits.length <= 8) return digits.padStart(8, '0');
  return digits.slice(-8);
}

function normalizeSabun(idno, empNo) {
  const digits = normalizeDigits(idno);
  if (digits.startsWith(COMPANY_CODE) && digits.length >= 12) {
    return `${COMPANY_CODE}${digits.slice(COMPANY_CODE.length).slice(-8).padStart(8, '0')}`;
  }
  if (empNo) {
    return `${COMPANY_CODE}${String(empNo).replace(/\D/g, '').padStart(8, '0')}`;
  }
  return '';
}

function formatTimePart(value) {
  const digits = normalizeDigits(value);
  if (digits.length >= 6) return digits.slice(0, 6);
  if (digits.length === 4) return `${digits.slice(0, 2)}${digits.slice(2, 4)}00`;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(value || ''))) {
    const [hh, mm, ss = '00'] = String(value).split(':');
    return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}`;
  }
  return '';
}

function toIsoLike(aTime) {
  if (!/^\d{14}$/.test(aTime)) return null;
  return `${aTime.slice(0, 4)}-${aTime.slice(4, 6)}-${aTime.slice(6, 8)}T${aTime.slice(8, 10)}:${aTime.slice(10, 12)}:${aTime.slice(12, 14)}+09:00`;
}

function buildAttendanceRow(row) {
  const empNo = normalizeEmpNoFromIdno(row.E_IDNO);
  const sabun = normalizeSabun(row.E_IDNO, empNo);
  const eDate = String(row.E_DATE || '').replace(/\D/g, '').slice(0, 8);
  const eTime = formatTimePart(row.E_TIME);
  const aTime = `${eDate}${eTime}`;

  if (!sabun || !empNo || !/^\d{14}$/.test(aTime)) {
    return null;
  }

  return {
    sabun,
    emp_no: empNo,
    card_no: row.E_CARD ? String(row.E_CARD) : null,
    a_time: aTime,
    log_time: toIsoLike(aTime),
    eq_code: row.G_ID ? String(row.G_ID) : null,
    gate_name: [row.E_GROUP, row.E_MODE, row.E_TYPE, row.E_RESULT].filter(Boolean).join(' / ') || '출입',
    flag1: null,
    event_type: '출입',
    source: 'caps',
    synced_at: new Date().toISOString(),
  };
}

async function main() {
  const { supabaseUrl, supabaseServiceRoleKey } = requireSupabaseConfig();
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    console.log('==================================================');
    console.log(" tenter.E_GROUP = '08' / 2026-01 전체 -> Supabase");
    console.log('==================================================');
    console.log(`[모드] ${APPLY ? '실제 업서트' : '미리보기(dry-run)'}`);
    console.log(`[범위] ${START_DATE} ~ ${END_DATE}`);

    const [countRows] = await mysqlConn.query(`
      SELECT COUNT(*) AS cnt
      FROM tenter
      WHERE E_GROUP = '08'
        AND E_DATE BETWEEN ? AND ?
    `, [START_DATE, END_DATE]);
    const total = countRows?.[0]?.cnt ?? 0;
    console.log(`\n[조회 건수] ${total}건`);

    const [rows] = await mysqlConn.query(`
      SELECT
        E_DATE, E_TIME, G_ID, E_ID, E_NAME, E_IDNO,
        E_GROUP, E_USER, E_MODE, E_TYPE, E_RESULT, E_ETC, E_CARD, E_EXYN
      FROM tenter
      WHERE E_GROUP = '08'
        AND E_DATE BETWEEN ? AND ?
      ORDER BY E_DATE ASC, E_TIME ASC
    `, [START_DATE, END_DATE]);

    if (!rows || rows.length === 0) {
      console.log('[안내] 지정한 기간에 E_GROUP = 08 데이터가 없습니다.');
      return;
    }

    const payloads = [];
    const skipped = [];
    for (const row of rows) {
      const payload = buildAttendanceRow(row);
      if (!payload) {
        skipped.push({
          E_DATE: row.E_DATE,
          E_TIME: row.E_TIME,
          E_IDNO: row.E_IDNO,
          E_NAME: row.E_NAME,
        });
        continue;
      }
      payloads.push(payload);
    }

    console.log(`\n[변환 가능] ${payloads.length}건`);
    console.log(`[스킵] ${skipped.length}건`);

    if (skipped.length > 0) {
      console.log('\n[스킵 샘플]');
      skipped.slice(0, 5).forEach((row, idx) => {
        console.log(`  (${idx + 1}) ${row.E_DATE} ${row.E_TIME} | ${row.E_IDNO || '-'} | ${row.E_NAME || '-'}`);
      });
    }

    if (!APPLY) {
      console.log('\n[안내] 실제 저장은 --apply 옵션을 붙였을 때만 수행됩니다.');
      return;
    }

    const BATCH = 500;
    let imported = 0;
    for (let i = 0; i < payloads.length; i += BATCH) {
      const batch = payloads.slice(i, i + BATCH);
      const { error } = await supabase
        .from('sa_attendance')
        .upsert(batch, { onConflict: 'sabun,a_time' });

      if (error) {
        throw new Error(`sa_attendance 업서트 실패: ${error.message}`);
      }

      imported += batch.length;
      console.log(`  - ${imported}/${payloads.length}건 반영 완료`);
    }

    console.log('\n[업서트 완료]');
    console.log(`반영 건수: ${imported}건`);
  } finally {
    await mysqlConn.end();
  }
}

main().catch((err) => {
  console.error('[오류]', err.message);
  process.exit(1);
});
