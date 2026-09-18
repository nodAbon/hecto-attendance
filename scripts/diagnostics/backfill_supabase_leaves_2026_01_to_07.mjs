/**
 * 2026년 1월~7월 승인 연차/휴가를 MySQL 원본에서 Supabase로 보강합니다.
 * 기본은 dry-run이며, 실제 반영은 --apply가 필요합니다.
 *
 *   node scripts/diagnostics/backfill_supabase_leaves_2026_01_to_07.mjs
 *   node scripts/diagnostics/backfill_supabase_leaves_2026_01_to_07.mjs --apply
 */
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../sync/loadEnv').loadSyncEnv();

const company = process.env.MY_COMPANY_CODE || '1600';
const start = '20260101';
const end = '20260731';
const apply = process.argv.includes('--apply');
const mysqlDb = await mysql.createConnection({
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

function key(row) {
  return `${row.emp_no}|${row.start_date}|${row.leave_code}`;
}

try {
  const [rows] = await mysqlDb.execute(`
    SELECT
      y.I_EMPLOY_NO AS emp_no,
      e.N_EMPLOY_NAME AS emp_name,
      y.D_START_DATE AS start_date,
      y.D_END_DATE AS end_date,
      y.I_CODE AS leave_code,
      CAST(y.I_CODE AS CHAR) AS leave_name,
      CAST(y.O_ANNLEV_CNT AS CHAR) AS leave_days,
      y.I_STATUS AS status
    FROM hr_yuncha_use y
    INNER JOIN hr_employee e
      ON e.I_COMPANY = y.I_COMPANY AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
    WHERE y.I_COMPANY = ?
      AND y.I_STATUS = '40'
      AND y.D_END_DATE >= ?
      AND y.D_START_DATE <= ?
    ORDER BY y.D_START_DATE, y.I_EMPLOY_NO, y.I_CODE
  `, [company, start, end]);

  const unique = [...new Map(rows.map((row) => [key(row), {
    emp_no: row.emp_no,
    emp_name: row.emp_name,
    start_date: row.start_date,
    end_date: row.end_date,
    leave_code: row.leave_code,
    leave_name: row.leave_name,
    leave_days: row.leave_days == null ? 0 : Number(row.leave_days),
    status: row.status,
    synced_at: new Date().toISOString(),
  }])).values()];

  const empNos = [...new Set(unique.map((row) => row.emp_no))];
  let existing = [];
  if (empNos.length > 0) {
    const { data, error } = await supabase
      .from('sa_leaves')
      .select('emp_no,start_date,end_date,leave_code')
      .gte('start_date', start)
      .lte('start_date', end)
      .in('emp_no', empNos);
    if (error) throw new Error(`기존 Supabase 연차 조회 실패: ${error.message}`);
    existing = data || [];
  }

  const existingKeys = new Set(existing.map(key));
  const newRows = unique.filter((row) => !existingKeys.has(key(row)));
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    range: `${start} ~ ${end}`,
    mysqlRows: rows.length,
    uniqueRows: unique.length,
    existingRows: existing.length,
    rowsToInsertOrUpdate: newRows.length,
    employees: empNos.length,
  }, null, 2));

  if (!apply) {
    console.log('dry-run: Supabase에 아무것도 반영하지 않았습니다. 실제 반영은 --apply를 사용하세요.');
  } else if (unique.length > 0) {
    for (let index = 0; index < unique.length; index += 500) {
      const batch = unique.slice(index, index + 500);
      const { error } = await supabase
        .from('sa_leaves')
        .upsert(batch, { onConflict: 'emp_no,start_date,leave_code' });
      if (error) throw new Error(`Supabase 연차 upsert 실패: ${error.message}`);
      console.log(`반영 완료: ${Math.min(index + batch.length, unique.length)}/${unique.length}`);
    }
    console.log('Supabase 연차 보강 완료');
  }
} finally {
  await mysqlDb.end();
}
