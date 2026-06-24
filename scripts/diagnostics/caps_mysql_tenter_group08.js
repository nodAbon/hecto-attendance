/**
 * tenter 테이블에서 E_GROUP = '08'인 출입기록 10건 조회
 * - 읽기 전용
 * - 서버PC에서 실행
 *
 * 실행:
 *   node caps_mysql_tenter_group08.js
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
    console.log(" tenter.E_GROUP = '08' 조회");
    console.log('==================================================');
    console.log(`[DB] ${MYSQL_CONFIG.host} / ${MYSQL_CONFIG.database}`);

    const [countRows] = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM tenter
      WHERE E_GROUP = '08'
    `);
    const total = countRows?.[0]?.cnt ?? 0;

    console.log(`\n[전체 건수] ${total}건`);

    const [rows] = await conn.query(`
      SELECT
        E_DATE,
        E_TIME,
        G_ID,
        E_ID,
        E_NAME,
        E_IDNO,
        E_GROUP,
        E_USER,
        E_MODE,
        E_TYPE,
        E_RESULT,
        E_ETC,
        E_CARD
      FROM tenter
      WHERE E_GROUP = '08'
      ORDER BY E_DATE DESC, E_TIME DESC
      LIMIT 10
    `);

    if (rows.length === 0) {
      console.log('[안내] E_GROUP = 08인 데이터가 없습니다.');
      return;
    }

    console.log(`\n[최신 10건]`);
    rows.forEach((row, idx) => {
      console.log(`\n(${idx + 1}) ${row.E_DATE} ${row.E_TIME} | G:${row.G_ID} | ${row.E_NAME || '-'} | ${row.E_IDNO || '-'} | CARD:${row.E_CARD || '-'}`);
      console.log(`    GROUP:${row.E_GROUP || '-'} | MODE:${row.E_MODE || '-'} | TYPE:${row.E_TYPE || '-'} | RESULT:${row.E_RESULT || '-'}`);
      if (row.E_ETC) {
        console.log(`    ETC: ${row.E_ETC}`);
      }
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
