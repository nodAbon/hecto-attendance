/**
 * CAPS 출입기록 테이블 점검 스크립트
 * - 서버PC에서 MySQL 접속 후 CAPS 관련 테이블을 찾습니다.
 * - 테이블 컬럼, 행 개수, 최신 샘플 데이터를 출력합니다.
 *
 * 실행:
 *   node caps_mysql_inspect.js
 */

const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: Number(process.env.MYSQL_PORT || 3306),
  connectTimeout: 10000,
};

const KEYWORDS = ['caps', 'cap_', 'alarm', 'access', 'enter', 'gate', 'door', 'card', 'guard', 'secom', 'tenter'];
const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const SAMPLE_LIMIT = 5;

function pickOrderBy(columns) {
  const names = columns.map((c) => String(c.COLUMN_NAME || c.Field || '').toUpperCase());

  if (names.includes('ATIME')) return 'ATime DESC';
  if (names.includes('E_DATE') && names.includes('E_TIME')) return 'E_DATE DESC, E_TIME DESC';
  if (names.includes('LOG_TIME')) return 'log_time DESC';
  if (names.includes('UPDATE_TIME')) return 'UpdateTime DESC';
  if (names.includes('CREATED_AT')) return 'created_at DESC';
  if (names.includes('CREATEDATE')) return 'CreateDate DESC';
  if (names.includes('DATE')) return '`DATE` DESC';
  return null;
}

function formatValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 120 ? value.slice(0, 117) + '...' : value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function main() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);

  try {
    console.log('==================================================');
    console.log(' CAPS 출입기록 테이블 점검');
    console.log('==================================================');
    console.log(`[DB] ${MYSQL_CONFIG.host} / ${MYSQL_CONFIG.database}`);

    const [tables] = await conn.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    const candidates = tables.filter((t) => {
      const lower = String(t.TABLE_NAME || '').toLowerCase();
      return KEYWORDS.some((k) => lower.includes(k));
    });

    if (candidates.length === 0) {
      console.log('\n[안내] CAPS 관련 후보 테이블을 찾지 못했습니다.');
      console.log('       테이블명에 caps / alarm / enter / access / tenter 등이 포함되는지 확인해 주세요.');
      return;
    }

    console.log(`\n[1] 후보 테이블 ${candidates.length}개 발견`);
    candidates.forEach((t, idx) => {
      console.log(`  ${String(idx + 1).padStart(2, '0')}. ${t.TABLE_SCHEMA}.${t.TABLE_NAME} (rows: ${t.TABLE_ROWS ?? 0})`);
    });

    for (const table of candidates) {
      const fullName = `\`${table.TABLE_SCHEMA}\`.\`${table.TABLE_NAME}\``;
      console.log('\n--------------------------------------------------');
      console.log(`[테이블] ${table.TABLE_SCHEMA}.${table.TABLE_NAME}`);
      console.log('--------------------------------------------------');

      const [columns] = await conn.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [table.TABLE_SCHEMA, table.TABLE_NAME]);

      if (columns.length === 0) {
        console.log('  [경고] 컬럼 정보를 읽지 못했습니다.');
        continue;
      }

      console.log('  [컬럼]');
      columns.forEach((col) => {
        console.log(
          `    - ${String(col.COLUMN_NAME).padEnd(24)} | ${String(col.DATA_TYPE).padEnd(12)} | NULL=${String(col.IS_NULLABLE).padEnd(3)} | KEY=${col.COLUMN_KEY || '-'} | ${col.EXTRA || '-'}`
        );
      });

      const [countRows] = await conn.query(`SELECT COUNT(*) AS cnt FROM ${fullName}`);
      const count = countRows?.[0]?.cnt ?? 0;
      console.log(`\n  [행 수] ${count}건`);

      const orderBy = pickOrderBy(columns);
      if (orderBy) {
        try {
          const [rangeRows] = await conn.query(`
            SELECT MIN(t.${columns[0].COLUMN_NAME}) AS min_value, MAX(t.${columns[0].COLUMN_NAME}) AS max_value
            FROM ${fullName} t
          `);
          const range = rangeRows?.[0] || {};
          if (range.min_value !== undefined || range.max_value !== undefined) {
            console.log(`  [값 범위 참고] ${formatValue(range.min_value)} ~ ${formatValue(range.max_value)}`);
          }
        } catch {
          // range는 참고용이므로 실패해도 계속 진행
        }
      }

      if (count === 0) {
        console.log('  [샘플] 데이터가 없습니다.');
        continue;
      }

      const sampleSql = orderBy
        ? `SELECT * FROM ${fullName} ORDER BY ${orderBy} LIMIT ${SAMPLE_LIMIT}`
        : `SELECT * FROM ${fullName} LIMIT ${SAMPLE_LIMIT}`;

      try {
        const [samples] = await conn.query(sampleSql);
        console.log(`\n  [최신 샘플 ${samples.length}건]`);
        samples.forEach((row, idx) => {
          console.log(`    (${idx + 1})`);
          Object.entries(row).forEach(([key, value]) => {
            console.log(`      ${key}: ${formatValue(value)}`);
          });
        });
      } catch (err) {
        console.log(`  [샘플 조회 실패] ${err.message}`);
      }
    }

    console.log('\n==================================================');
    console.log(' 점검 완료');
    console.log('==================================================');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[오류]', err.message);
  process.exit(1);
});
