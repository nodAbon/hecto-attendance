const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: 'Prd-Hecto-WHR-Ext-NLB-8e82b66ed560637d.elb.ap-northeast-2.amazonaws.com',
  user: 'whradmin',
  password: '1q2w3e4r!@#$',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('MySQL 연결 성공\n');

    // 1. 캡스(CAPS) 관련 테이블 탐색
    console.log('=== [1] 캡스(CAPS) 관련 테이블 탐색 ===');
    const [tables] = await conn.execute(`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'whr'
        AND (
          TABLE_NAME LIKE '%caps%'
          OR TABLE_NAME LIKE '%CAPS%'
          OR TABLE_NAME LIKE '%cap_%'
          OR TABLE_NAME LIKE '%access%'
          OR TABLE_NAME LIKE '%alarm%'
          OR TABLE_NAME LIKE '%enter%'
          OR TABLE_NAME LIKE '%gate%'
          OR TABLE_NAME LIKE '%door%'
          OR TABLE_NAME LIKE '%card%'
        )
      ORDER BY TABLE_NAME
    `);
    if (tables.length === 0) {
      console.log('  캡스 관련 테이블이 없습니다.');
    } else {
      tables.forEach((t, i) => {
        console.log(`  [${i+1}] ${t.TABLE_NAME}  (행 수 추정: ${t.TABLE_ROWS || '?'})`);
      });
    }

    // 2. 전체 테이블 목록 (whr 스키마)
    console.log('\n=== [2] whr 스키마 전체 테이블 목록 ===');
    const [allTables] = await conn.execute(`
      SELECT TABLE_NAME, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'whr'
      ORDER BY TABLE_NAME
    `);
    allTables.forEach((t, i) => {
      console.log(`  [${String(i+1).padStart(3)}] ${t.TABLE_NAME}`);
    });

    // 3. 다른 스키마에 캡스 테이블이 있는지 확인
    console.log('\n=== [3] 접근 가능한 전체 스키마 목록 ===');
    const [schemas] = await conn.execute(`SHOW DATABASES`);
    schemas.forEach(s => {
      const name = Object.values(s)[0];
      if (!['information_schema', 'performance_schema', 'sys', 'mysql'].includes(name)) {
        console.log(`  DB: ${name}`);
      }
    });

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
