/**
 * Approved leave inspector.
 *
 * Server PC only. This script reads MySQL only and never writes to MySQL or Supabase.
 *
 * Usage:
 *   node latest-approved-leaves.js
 *   node latest-approved-leaves.js --limit=50
 *   node latest-approved-leaves.js --json
 */

const { loadSyncEnv } = require('./loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

const COMPANY_CODE = process.env.MY_COMPANY_CODE || '1600';

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  connectTimeout: 15_000,
};

const CREATED_AT_COLUMN_CANDIDATES = [
  'D_INSERT_DATE',
  'D_INSERT_DT',
  'D_REG_DATE',
  'D_REG_DT',
  'D_CREATE_DATE',
  'D_CREATE_DT',
  'D_CREATED_DATE',
  'D_CREATED_DT',
  'INSERT_DATE',
  'INSERT_DT',
  'REG_DATE',
  'REG_DT',
  'CREATE_DATE',
  'CREATE_DT',
  'CREATED_AT',
  'CREATEDATE',
  'W_DATE',
  'WRITE_DATE',
  'APPLY_DATE',
  'D_APPLY_DATE',
  'REQUEST_DATE',
  'D_REQUEST_DATE',
];

const UPDATED_AT_COLUMN_CANDIDATES = [
  'D_UPDATE_DATE',
  'D_UPDATE_DT',
  'D_MOD_DATE',
  'D_MOD_DT',
  'UPDATE_DATE',
  'UPDATE_DT',
  'UPDATED_AT',
  'MODIFY_DATE',
  'MODIFY_DT',
  'U_DATE',
];

function parseArgs(argv) {
  const args = { limit: 20, json: false };
  argv.slice(2).forEach((arg) => {
    if (arg === '--json') {
      args.json = true;
      return;
    }
    if (arg.startsWith('--limit=')) {
      const parsed = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.limit = Math.min(parsed, 500);
      }
    }
  });
  return args;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function selectOnly(conn, sql, params = []) {
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    throw new Error('조회 전용 스크립트입니다. SELECT만 실행할 수 있습니다.');
  }
  const [rows] = await conn.execute(sql, params);
  return rows;
}

async function getTableColumns(conn, tableName) {
  const rows = await selectOnly(conn, `
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [MYSQL_CONFIG.database, tableName]);

  return rows.map((row) => normalizeText(row.COLUMN_NAME)).filter(Boolean);
}

function pickColumn(columns, candidates) {
  const upperToOriginal = new Map(columns.map((column) => [column.toUpperCase(), column]));
  for (const candidate of candidates) {
    const found = upperToOriginal.get(candidate.toUpperCase());
    if (found) return found;
  }
  return '';
}

function buildOptionalSelect(columnName, alias) {
  return columnName ? `y.${quoteIdentifier(columnName)} AS ${quoteIdentifier(alias)}` : `NULL AS ${quoteIdentifier(alias)}`;
}

function formatDateLike(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  if (/^\d{14}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)} ${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
  }
  return text;
}

async function main() {
  const { limit, json } = parseArgs(process.argv);

  if (!MYSQL_CONFIG.host || !MYSQL_CONFIG.user || !MYSQL_CONFIG.database) {
    throw new Error('MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE 환경변수를 확인하세요.');
  }

  let conn = null;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);

    const columns = await getTableColumns(conn, 'hr_yuncha_use');
    const createdAtColumn = pickColumn(columns, CREATED_AT_COLUMN_CANDIDATES);
    const updatedAtColumn = pickColumn(columns, UPDATED_AT_COLUMN_CANDIDATES);
    const orderColumn = createdAtColumn || updatedAtColumn || 'D_START_DATE';

    const rows = await selectOnly(conn, `
      SELECT
        y.I_EMPLOY_NO AS emp_no,
        e.N_EMPLOY_NAME AS emp_name,
        d.N_DEPT AS dept_name,
        y.D_START_DATE AS start_date,
        y.D_END_DATE AS end_date,
        y.I_CODE AS leave_code,
        COALESCE(c.N_NAME, tc.NAME, CAST(y.I_CODE AS CHAR)) AS leave_name,
        CAST(y.O_ANNLEV_CNT AS CHAR) AS leave_days,
        y.I_STATUS AS status,
        ${buildOptionalSelect(createdAtColumn, 'registered_at')},
        ${buildOptionalSelect(updatedAtColumn, 'updated_at')}
      FROM hr_yuncha_use y
      INNER JOIN hr_employee e
        ON e.I_COMPANY = y.I_COMPANY
       AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
      LEFT JOIN hr_department d
        ON d.I_COMPANY = e.I_COMPANY
       AND d.I_DEPT = e.I_DEPT
      LEFT JOIN hr_diligence_code c
        ON c.I_CODE = y.I_CODE
      LEFT JOIN tong_code tc
        ON tc.GUBUN_CODE = 'H0281'
       AND tc.CODE = y.I_CODE
      WHERE y.I_COMPANY = ?
        AND y.I_STATUS = '40'
      ORDER BY y.${quoteIdentifier(orderColumn)} DESC, y.D_START_DATE DESC, y.D_END_DATE DESC, y.I_EMPLOY_NO ASC
      LIMIT ${Number(limit)}
    `, [COMPANY_CODE]);

    const normalizedRows = rows.map((row) => ({
      empNo: normalizeText(row.emp_no),
      name: normalizeText(row.emp_name),
      dept: normalizeText(row.dept_name),
      leaveName: normalizeText(row.leave_name),
      leaveCode: normalizeText(row.leave_code),
      leaveDays: Number.parseFloat(row.leave_days) || 0,
      startDate: formatDateLike(row.start_date),
      endDate: formatDateLike(row.end_date),
      status: normalizeText(row.status),
      registeredAt: formatDateLike(row.registered_at),
      updatedAt: formatDateLike(row.updated_at),
    }));

    if (json) {
      console.log(JSON.stringify({
        companyCode: COMPANY_CODE,
        status: '40',
        createdAtColumn: createdAtColumn || null,
        updatedAtColumn: updatedAtColumn || null,
        orderColumn,
        rows: normalizedRows,
      }, null, 2));
      return;
    }

    console.log('승인완료 연차 최신 등록 조회');
    console.log(`- 회사코드: ${COMPANY_CODE}`);
    console.log('- 승인상태: I_STATUS = 40');
    console.log(`- 등록일 후보 컬럼: ${createdAtColumn || '(찾지 못함)'}`);
    console.log(`- 수정일 후보 컬럼: ${updatedAtColumn || '(찾지 못함)'}`);
    console.log(`- 정렬 기준: ${orderColumn}`);
    console.log(`- 조회 건수: ${normalizedRows.length}건`);
    if (!createdAtColumn && !updatedAtColumn) {
      console.log('[안내] 등록/수정일로 보이는 컬럼을 찾지 못해 휴가 시작일 기준으로 정렬했습니다.');
    }
    console.log('');
    console.table(normalizedRows);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch((error) => {
  console.error('[승인완료 연차 최신 등록 조회 실패]', error?.message || error);
  process.exit(1);
});
