/**
 * tenter.E_GROUP = '08' 최신 샘플 1건을 Supabase sa_attendance에 업서트
 * - 기본은 dry-run
 * - 실제 반영은 --apply 옵션 필요
 *
 * 실행 예시:
 *   node caps_mysql_tenter_group08_to_supabase.js
 *   node caps_mysql_tenter_group08_to_supabase.js --apply
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

function formatDatePart(value) {
  const digits = normalizeDigits(value);
  if (digits.length >= 8) return digits.slice(0, 8);
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
  const eDate = formatDatePart(row.E_DATE);
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
    console.log(" tenter.E_GROUP = '08' 샘플 1건 -> Supabase");
    console.log('==================================================');
    console.log(`[모드] ${APPLY ? '실제 업서트' : '미리보기(dry-run)'}`);

    const [rows] = await mysqlConn.query(`
      SELECT
        E_DATE, E_TIME, G_ID, E_ID, E_NAME, E_IDNO,
        E_GROUP, E_USER, E_MODE, E_TYPE, E_RESULT, E_ETC, E_CARD, E_EXYN
      FROM tenter
      WHERE E_GROUP = '08'
      ORDER BY E_DATE DESC, E_TIME DESC
      LIMIT 1
    `);

    if (!rows || rows.length === 0) {
      console.log('[안내] E_GROUP = 08 데이터가 없습니다.');
      return;
    }

    const row = rows[0];
    const payload = buildAttendanceRow(row);
    if (!payload) {
      console.log('[안내] Supabase로 바꿀 수 있는 형식이 아닙니다.');
      console.log(row);
      return;
    }

    console.log('\n[원본]');
    console.log(row);
    console.log('\n[변환 payload]');
    console.log(payload);

    if (!APPLY) {
      console.log('\n[안내] 실제 저장은 --apply 옵션을 붙였을 때만 수행됩니다.');
      return;
    }

    const { data, error } = await supabase
      .from('sa_attendance')
      .upsert(payload, { onConflict: 'sabun,a_time' })
      .select('id, sabun, emp_no, a_time, source')
      .single();

    if (error) {
      throw new Error(`sa_attendance 업서트 실패: ${error.message}`);
    }

    console.log('\n[업서트 완료]');
    console.log(data);
  } finally {
    await mysqlConn.end();
  }
}

main().catch((err) => {
  console.error('[오류]', err.message);
  process.exit(1);
});
