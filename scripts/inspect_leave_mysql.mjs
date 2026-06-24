import mysql from 'mysql2/promise';

const {
  MYSQL_HOST,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE,
  MYSQL_PORT = '3306',
} = process.env;

const KEYWORDS = [
  'leave',
  'vacation',
  'yuncha',
  'annlev',
  'annual',
  'holiday',
  'remain',
  'balance',
  '휴가',
  '연차',
  '잔여',
  '보유',
  '사용',
];

const TARGET_COLUMN_KEYWORDS = [
  'leave',
  'vacation',
  'yuncha',
  'annlev',
  'annual',
  'remain',
  'balance',
  'used',
  'total',
  'available',
  'status',
];

const hasEnv = [MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE].every(Boolean);

function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
}

function normalize(text = '') {
  return String(text || '').toLowerCase();
}

async function main() {
  if (!hasEnv) {
    console.error('[오류] MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE 환경변수를 먼저 설정해 주세요.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    port: Number.parseInt(MYSQL_PORT, 10) || 3306,
    connectTimeout: 10000,
  });

  try {
    printSection('MySQL 연차 조회 진단');
    console.log(`[DB] ${MYSQL_DATABASE} @ ${MYSQL_HOST}:${MYSQL_PORT}`);
    console.log('[안내] 이 스크립트는 조회만 수행합니다. INSERT / UPDATE / DELETE / CREATE / DROP 는 실행하지 않습니다.');

    const [tableRows] = await conn.execute(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [MYSQL_DATABASE]);

    const tableNames = (tableRows || []).map((row) => row.TABLE_NAME).filter(Boolean);
    const keywordTables = tableNames.filter((tableName) => {
      const normalized = normalize(tableName);
      return KEYWORDS.some((keyword) => normalized.includes(normalize(keyword)));
    });

    printSection(`테이블 후보 (${keywordTables.length}개)`);
    keywordTables.forEach((tableName) => console.log(`- ${tableName}`));

    const [columnRows] = await conn.execute(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, [MYSQL_DATABASE]);

    const columnsByTable = new Map();
    (columnRows || []).forEach((row) => {
      if (!columnsByTable.has(row.TABLE_NAME)) columnsByTable.set(row.TABLE_NAME, []);
      columnsByTable.get(row.TABLE_NAME).push(row);
    });

    const matchedTables = [];
    for (const tableName of tableNames) {
      const columns = columnsByTable.get(tableName) || [];
      const matchedColumns = columns.filter((column) => {
        const normalized = normalize(column.COLUMN_NAME);
        return TARGET_COLUMN_KEYWORDS.some((keyword) => normalized.includes(keyword));
      });

      if (matchedColumns.length > 0) {
        matchedTables.push({ tableName, matchedColumns, columns });
      }
    }

    printSection(`연차/잔여 관련 컬럼 후보 (${matchedTables.length}개 테이블)`);
    matchedTables.forEach(({ tableName, matchedColumns }) => {
      console.log(`\n[${tableName}]`);
      matchedColumns.forEach((column) => {
        console.log(`  - ${column.COLUMN_NAME} | ${column.DATA_TYPE} | NULL=${column.IS_NULLABLE} | KEY=${column.COLUMN_KEY || '-'}`);
      });
    });

    const inspectTargets = new Set([
      ...keywordTables,
      ...matchedTables.map((item) => item.tableName),
      'hr_yuncha_use',
    ]);

    for (const tableName of inspectTargets) {
      if (!tableNames.includes(tableName)) continue;
      const columns = columnsByTable.get(tableName) || [];
      if (columns.length === 0) continue;

      const selectedColumns = [
        'emp_no',
        'emp_name',
        'name',
        'leave_code',
        'leave_name',
        'leave_days',
        'status',
        'total',
        'used',
        'used_days',
        'remain',
        'remaining',
        'balance',
        'available',
        'annual',
        'annlev',
      ].filter((name) => columns.some((column) => normalize(column.COLUMN_NAME) === normalize(name)));

      const selectClause = selectedColumns.length > 0 ? selectedColumns.join(', ') : '*';
      const [sampleRows] = await conn.execute(`SELECT ${selectClause} FROM \`${tableName}\` LIMIT 5`);

      printSection(`샘플 행: ${tableName}`);
      console.log(`선택 컬럼: ${selectClause}`);
      console.log(JSON.stringify(sampleRows, null, 2));
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[실행 오류]', error?.message || error);
  process.exit(1);
});
