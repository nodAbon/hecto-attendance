const { loadSyncEnv } = require('../sync/loadEnv');
loadSyncEnv();
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
  connectTimeout: 10_000,
};

async function inspectAllDatabases() {
  let conn;
  try {
    console.log('====================================================');
    console.log(`🔍 MySQL 서버 전체 Database(스키마) 및 테이블 전수 조사`);
    console.log(`Connecting to MySQL (${MYSQL_CONFIG.host})...`);
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Connected successfully!\n');

    // 1. 접근 가능한 모든 데이터베이스(Schema) 목록 조회
    const [databases] = await conn.execute(`SHOW DATABASES`);
    const dbList = databases.map(d => Object.values(d)[0]);

    console.log(`📌 1. MySQL 서버 내 전체 Database 목록 (${dbList.length}개):`);
    console.log(dbList);

    // 2. 모든 Database 내의 모든 테이블 목록 전수 조사
    console.log('\n📌 2. 전체 Database별 테이블 및 뷰(View) 전수 검색:');
    for (const dbName of dbList) {
      if (['information_schema', 'performance_schema', 'mysql', 'sys'].includes(dbName)) continue;

      try {
        const [tables] = await conn.execute(`
          SELECT TABLE_NAME, TABLE_TYPE, TABLE_COMMENT, TABLE_ROWS
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME
        `, [dbName]);

        console.log(`\n📂 [Database: ${dbName}] (총 ${tables.length}개 테이블/뷰)`);
        console.table(tables.map(t => ({
          name: t.TABLE_NAME || t.table_name,
          type: t.TABLE_TYPE || t.table_type,
          comment: t.TABLE_COMMENT || t.table_comment || '',
          rows: t.TABLE_ROWS || t.table_rows || 0,
        })));

      } catch (e) {
        console.log(`  ❌ ${dbName} 조회 실패: ${e.message}`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
    console.log('\n====================================================');
  }
}

inspectAllDatabases();
