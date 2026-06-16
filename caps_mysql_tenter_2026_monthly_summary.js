/**
 * tenter 테이블에서 E_GROUP = '08'의 2026년 월별 건수 요약 조회
 * - 읽기 전용
 * - MySQL 수정 없음
 *
 * 실행:
 *   node caps_mysql_tenter_2026_monthly_summary.js
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

async function main() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);

  try {
    console.log('==================================================');
    console.log(" tenter.E_GROUP = '08' / 2026년 월별 요약");
    console.log('==================================================');
    console.log(`[DB] ${MYSQL_CONFIG.host} / ${MYSQL_CONFIG.database}`);

    const [rangeRows] = await conn.query(`
      SELECT MIN(E_DATE) AS min_date, MAX(E_DATE) AS max_date, COUNT(*) AS total
      FROM tenter
      WHERE E_GROUP = '08'
        AND E_DATE LIKE '2026%'
    `);

    const range = rangeRows?.[0] || {};
    console.log(`\n[전체 범위] ${range.min_date || '-'} ~ ${range.max_date || '-'} | 전체 ${range.total ?? 0}건`);

    const [rows] = await conn.query(`
      SELECT
        SUBSTRING(E_DATE, 1, 6) AS yyyymm,
        COUNT(*) AS cnt
      FROM tenter
      WHERE E_GROUP = '08'
        AND E_DATE LIKE '2026%'
      GROUP BY SUBSTRING(E_DATE, 1, 6)
      ORDER BY yyyymm ASC
    `);

    if (!rows || rows.length === 0) {
      console.log('\n[안내] 2026년에 E_GROUP = 08 데이터가 없습니다.');
      return;
    }

    console.log('\n[월별 건수]');
    rows.forEach((row) => {
      const month = String(row.yyyymm || '');
      const label = month.length === 6 ? `${month.slice(0, 4)}-${month.slice(4, 6)}` : month;
      console.log(`  - ${label}: ${row.cnt}건`);
    });

    console.log('\n==================================================');
    console.log(' 조회 완료');
    console.log('==================================================');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[오류]', err.message);
  process.exit(1);
});
