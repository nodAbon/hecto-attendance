/**
 * Read-only diagnostic for employment status in WHR MySQL.
 *
 * Usage:
 *   node inspect-employee-employment-status.js
 *
 * Optional:
 *   EMPLOYMENT_STATUS_EMP_NOS=20210019,20200010 node inspect-employee-employment-status.js
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

const COMPANY_CODE = process.env.MY_COMPANY_CODE || '1600';
const TARGET_EMP_NOS = String(process.env.EMPLOYMENT_STATUS_EMP_NOS || '20210019,20200010')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 15000,
};

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const STATUS_PATTERNS = [
  /retire/i,
  /resign/i,
  /status/i,
  /active/i,
  /employ/i,
  /work/i,
  /use/i,
  /date/i,
  /start/i,
  /end/i,
  /leave/i,
];

function printRows(rows, statusColumns) {
  if (!rows.length) {
    console.log('조회 결과가 없습니다.');
    return;
  }

  for (const row of rows) {
    console.log('\n=== 직원 ===');
    console.log(`사번: ${row.I_EMPLOY_NO || '-'}`);
    console.log(`이름: ${row.N_EMPLOY_NAME || '-'}`);
    console.log(`부서코드: ${row.I_DEPT || '-'}`);
    console.log(`부서명: ${row.dept_name || '-'}`);

    console.log('\n상태 관련 컬럼:');
    for (const column of statusColumns) {
      console.log(`- ${column}: ${row[column] ?? '(NULL)'}`);
    }

    console.log('\n전체 직원 원본 컬럼:');
    for (const [key, value] of Object.entries(row)) {
      if (key === 'dept_name' || statusColumns.includes(key)) continue;
      console.log(`- ${key}: ${value ?? '(NULL)'}`);
    }
  }
}

async function run() {
  if (!TARGET_EMP_NOS.length) throw new Error('조회할 사번이 없습니다.');

  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    const [columnRows] = await conn.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'hr_employee'
      ORDER BY ORDINAL_POSITION
    `);

    const columns = columnRows.map((row) => String(row.COLUMN_NAME || '')).filter(Boolean);
    if (!columns.includes('I_EMPLOY_NO')) {
      throw new Error('hr_employee.I_EMPLOY_NO 컬럼을 찾을 수 없습니다.');
    }

    const statusColumns = columns.filter((column) => STATUS_PATTERNS.some((pattern) => pattern.test(column)));
    const selectedColumns = [
      ...new Set([
        'I_EMPLOY_NO',
        'N_EMPLOY_NAME',
        'I_DEPT',
        ...statusColumns,
      ]),
    ].filter((column) => columns.includes(column));

    const selectList = selectedColumns.map((column) => `e.${quoteIdentifier(column)}`).join(', ');
    const placeholders = TARGET_EMP_NOS.map(() => '?').join(', ');

    const [rows] = await conn.execute(`
      SELECT
        ${selectList},
        d.N_DEPT AS dept_name
      FROM hr_employee e
      LEFT JOIN hr_department d
        ON d.I_COMPANY = e.I_COMPANY
       AND d.I_DEPT = e.I_DEPT
      WHERE e.I_COMPANY = ?
        AND e.I_EMPLOY_NO IN (${placeholders})
      ORDER BY e.I_EMPLOY_NO
    `, [COMPANY_CODE, ...TARGET_EMP_NOS]);

    console.log(`[employment-status] 회사코드: ${COMPANY_CODE}`);
    console.log(`[employment-status] 조회 사번: ${TARGET_EMP_NOS.join(', ')}`);
    console.log(`[employment-status] hr_employee 결과: ${rows.length}건`);
    console.log(`[employment-status] 상태 후보 컬럼: ${statusColumns.join(', ') || '(없음)'}`);
    printRows(rows, statusColumns);
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(`[employment-status] 실패: ${error.message}`);
  process.exitCode = 1;
});
