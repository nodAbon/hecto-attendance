/**
 * MySQL 원본 hr_yuncha_use와 Supabase sa_leaves 비교 도구
 *
 * 기본값: 2026-01-01 ~ 2026-02-28 / 서비스관리 2팀
 * 조회 전용이며 두 DB 어디에도 쓰기 작업을 하지 않습니다.
 *
 * 실행 예:
 *   node scripts/diagnostics/compare_mysql_supabase_leaves.mjs
 *   node scripts/diagnostics/compare_mysql_supabase_leaves.mjs --start 2026-01-01 --end 2026-02-28 --dept "서비스관리 2팀"
 */
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

createRequire(import.meta.url)('../../sync/loadEnv').loadSyncEnv();

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function compactDate(value) {
  return String(value).replace(/-/g, '').slice(0, 8);
}

function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function key(row) {
  return [row.emp_no, row.start_date, row.end_date, row.leave_code].map(String).join('|');
}

function countBy(rows, field) {
  return Object.entries(rows.reduce((result, row) => {
    const value = row[field] ?? '(없음)';
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}

loadLocalEnv();

const start = compactDate(arg('start', '2026-01-01'));
const end = compactDate(arg('end', '2026-02-28'));
const dept = arg('dept', '서비스관리 2팀');
const company = process.env.MY_COMPANY_CODE || '1600';

const mysqlConnection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 15000,
});

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

try {
  const [mysqlRows] = await mysqlConnection.execute(`
    SELECT
      y.I_EMPLOY_NO AS emp_no,
      e.N_EMPLOY_NAME AS emp_name,
      d.N_DEPT AS dept,
      y.D_START_DATE AS start_date,
      y.D_END_DATE AS end_date,
      y.I_CODE AS leave_code,
      CAST(y.I_CODE AS CHAR) AS leave_name,
      CAST(y.O_ANNLEV_CNT AS CHAR) AS leave_days,
      y.I_STATUS AS status
    FROM hr_yuncha_use y
    INNER JOIN hr_employee e
      ON e.I_COMPANY = y.I_COMPANY AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
    INNER JOIN hr_department d
      ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
    WHERE y.I_COMPANY = ?
      AND y.I_STATUS = '40'
      AND d.N_DEPT = ?
      AND y.D_END_DATE >= ?
      AND y.D_START_DATE <= ?
    ORDER BY y.D_START_DATE, y.I_EMPLOY_NO, y.I_CODE
  `, [company, dept, start, end]);

  const empNos = [...new Set(mysqlRows.map((row) => String(row.emp_no)))];
  let supabaseRows = [];
  if (empNos.length > 0) {
    const { data, error } = await supabase
      .from('sa_leaves')
      .select('emp_no,emp_name,start_date,end_date,leave_code,leave_name,leave_days,status')
      .gte('start_date', start)
      .lte('start_date', end)
      .in('emp_no', empNos);
    if (error) throw new Error(`Supabase 조회 실패: ${error.message}`);
    supabaseRows = data || [];
  }

  const mysqlMap = new Map(mysqlRows.map((row) => [key(row), row]));
  const supabaseMap = new Map(supabaseRows.map((row) => [key(row), row]));
  const missing = [...mysqlMap.keys()].filter((item) => !supabaseMap.has(item)).map((item) => mysqlMap.get(item));
  const extra = [...supabaseMap.keys()].filter((item) => !mysqlMap.has(item)).map((item) => supabaseMap.get(item));

  const result = {
    range: `${start} ~ ${end}`,
    department: dept,
    mysqlCount: mysqlRows.length,
    supabaseCount: supabaseRows.length,
    missingInSupabase: missing.length,
    extraInSupabase: extra.length,
    matched: mysqlRows.length - missing.length,
    mysqlCodes: countBy(mysqlRows, 'leave_code'),
    supabaseCodes: countBy(supabaseRows, 'leave_code'),
    missing,
    extra,
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await mysqlConnection.end();
}
