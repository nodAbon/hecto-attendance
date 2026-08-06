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

async function inspectMasterTables() {
  let conn;
  try {
    console.log('====================================================');
    console.log(`🔍 Connecting to MySQL (${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database})...`);
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Connection established successfully!\n');

    // 1. 전체 테이블 목록 가져오기
    const [tables] = await conn.execute(`
      SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [MYSQL_CONFIG.database]);

    const tableList = tables.map(t => ({
      name: t.TABLE_NAME || t.table_name,
      comment: t.TABLE_COMMENT || t.table_comment || '',
      rows: t.TABLE_ROWS || t.table_rows || 0,
    }));

    console.log(`📊 Total tables in Database: ${tableList.length}`);

    // 2. 연차 / 휴가 / 근태 / 코드 관련 후보 테이블 필터링
    const targetKeywords = ['yuncha', 'leave', 'vacation', 'dili', 'holiday', 'comp', 'subst', 'rest', 'code', 'emp'];
    const candidateTables = tableList.filter(t => 
      targetKeywords.some(kw => t.name.toLowerCase().includes(kw))
    );

    console.log(`\n🎯 Candidate HR/Leave/Diligence tables found: ${candidateTables.length}`);
    console.table(candidateTables);

    // 3. 각 후보 테이블의 스키마 및 데이터 탐색
    for (const table of candidateTables) {
      console.log('\n----------------------------------------------------');
      console.log(`📋 Table: ${table.name} (Estimated rows: ${table.rows})`);
      
      try {
        // 컬럼 구조 조회
        const [columns] = await conn.execute(`DESCRIBE \`${table.name}\``);
        const colSummary = columns.map(c => `${c.Field} (${c.Type}${c.Null === 'NO' ? ' NOT NULL' : ''})`).join(', ');
        console.log(`  🔹 Columns: ${colSummary}`);

        // 샘플 데이터 3건 조회
        const [sampleRows] = await conn.execute(`SELECT * FROM \`${table.name}\` LIMIT 3`);
        if (sampleRows.length > 0) {
          console.log('  🔹 Sample Row (1st):');
          console.dir(sampleRows[0], { depth: 2 });
        } else {
          console.log('  🔹 Table is empty (0 rows)');
        }
      } catch (err) {
        console.log(`  ❌ Failed to inspect ${table.name}: ${err.message}`);
      }
    }

  } catch (err) {
    console.error('\n❌ MySQL Connection/Query Error:', err.message);
    if (err.code === 'ETIMEDOUT') {
      console.error('💡 TIP: DB 서브넷 접근 혹은 VPN 연결 상태를 확인해주세요.');
    }
  } finally {
    if (conn) await conn.end();
    console.log('\n====================================================');
  }
}

inspectMasterTables();
