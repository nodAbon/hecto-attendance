/**
 * Read-only diagnostic for raw SECOM attendance records.
 * Does not join hr_employee, so employees without a WHR employee number are
 * still visible.
 *
 * Usage:
 *   $env:SECOM_INSPECT_DATE='2026-08-11'
 *   $env:SECOM_INSPECT_SABUN='160020260015,160020260016'
 *   node inspect-secom-attendance-range.js
 *
 * SECOM_INSPECT_SABUN is optional. If omitted, all company-prefixed records
 * for the date are displayed.
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

const date = String(process.env.SECOM_INSPECT_DATE || process.env.ATTENDANCE_BACKFILL_FROM || '').trim();
const sabuns = String(process.env.SECOM_INSPECT_SABUN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const companyCode = process.env.MY_COMPANY_CODE || '1600';

const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 15000,
};

function toCompactDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function normalizeSabun(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 12 && digits.startsWith(companyCode)
    ? digits
    : `${companyCode}${digits.slice(-8).padStart(8, '0')}`;
}

function printRows(rows) {
  if (!rows.length) {
    console.log('조회 결과가 없습니다.');
    return;
  }

  console.table(rows.map((row) => ({
    발생시각: row.ATime,
    사번: row.Sabun || '-',
    이름: row.Name || '-',
    카드번호: row.CardNo || '-',
    장치: row.EqCode || '-',
    상태: row.State || '-',
    Flag1: row.Flag1 ?? '-',
  })));

  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.Sabun || '(사번없음)'} / ${row.Name || '(이름없음)'}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  console.log('\n직원별 건수:');
  for (const [key, count] of grouped) console.log(`- ${key}: ${count}건`);
}

async function run() {
  const compactDate = toCompactDate(date);
  if (!compactDate) throw new Error('SECOM_INSPECT_DATE를 YYYY-MM-DD 형식으로 입력하세요.');

  const conn = await mysql.createConnection(mysqlConfig);
  try {
    const conditions = ['ATime >= ?', 'ATime <= ?'];
    const params = [`${compactDate}000000`, `${compactDate}235959`];

    if (sabuns.length) {
      const normalized = sabuns.map(normalizeSabun);
      conditions.push(`Sabun IN (${normalized.map(() => '?').join(', ')})`);
      params.push(...normalized);
    } else {
      conditions.push('Sabun LIKE ?');
      params.push(`${companyCode}%`);
    }

    const [rows] = await conn.execute(`
      SELECT ATime, Sabun, Name, CardNo, EqCode, State, Flag1
      FROM t_secom_alarm
      WHERE ${conditions.join(' AND ')}
      ORDER BY ATime ASC, Sabun ASC
    `, params);

    console.log(`[secom-inspect] 날짜: ${date}`);
    console.log(`[secom-inspect] 사번 필터: ${sabuns.length ? sabuns.join(', ') : `${companyCode}% 전체`}`);
    console.log(`[secom-inspect] 원본 조회: ${rows.length}건\n`);
    printRows(rows);
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(`[secom-inspect] 실패: ${error.message}`);
  process.exitCode = 1;
});
