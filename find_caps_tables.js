/**
 * 캡스(CAPS) 출입 기록 테이블 탐색 스크립트
 * 실행: node find_caps_tables.js
 * (서버 PC에서 실행하세요 - AWS MySQL 접근이 필요합니다)
 */
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: '[REDACTED MYSQL HOST]',
  user: 'whradmin',
  password: '[REDACTED MYSQL PASSWORD]',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('MySQL 연결 성공\n');

    // 1. whr 스키마 전체 테이블 목록
    console.log('=== [1] whr 스키마 전체 테이블 목록 ===');
    const [allTables] = await conn.execute(`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'whr'
      ORDER BY TABLE_NAME
    `);
    allTables.forEach((t, i) => {
      console.log(`  [${String(i+1).padStart(3)}] ${t.TABLE_NAME.padEnd(45)} 행 수: ${String(t.TABLE_ROWS || 0).padStart(8)}`);
    });
    console.log(`\n  총 ${allTables.length}개 테이블\n`);

    // 2. 캡스(CAPS) 관련 키워드로 테이블 필터링
    console.log('=== [2] CAPS/출입/경비 관련 테이블 필터 ===');
    const keywords = ['caps', 'cap_', 'access', 'alarm', 'enter', 'gate', 'door', 'card', 'guard', 'secu', 'patrol'];
    const matched = allTables.filter(t =>
      keywords.some(k => t.TABLE_NAME.toLowerCase().includes(k))
    );
    if (matched.length === 0) {
      console.log('  키워드 매칭 테이블 없음 - 전체 목록에서 수동으로 확인 필요');
    } else {
      matched.forEach((t, i) => {
        console.log(`  [${i+1}] ${t.TABLE_NAME}`);
      });
    }

    // 3. 접근 가능한 스키마 목록 (다른 DB에 캡스 테이블이 있을 수 있음)
    console.log('\n=== [3] 접근 가능한 DB 스키마 목록 ===');
    const [schemas] = await conn.execute(`SHOW DATABASES`);
    for (const s of schemas) {
      const name = Object.values(s)[0];
      if (['information_schema', 'performance_schema', 'sys', 'mysql'].includes(name)) continue;
      console.log(`  DB: ${name}`);

      // 각 DB에서도 캡스 관련 테이블 탐색
      try {
        const [tbls] = await conn.execute(`
          SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND (
            TABLE_NAME LIKE '%caps%' OR TABLE_NAME LIKE '%CAPS%'
            OR TABLE_NAME LIKE '%access%' OR TABLE_NAME LIKE '%alarm%'
          )
        `, [name]);
        if (tbls.length > 0) {
          tbls.forEach(t => console.log(`    └ ${t.TABLE_NAME} (행 수: ${t.TABLE_ROWS || '?'})`));
        }
      } catch(e) { /* 권한 없는 DB는 스킵 */ }
    }

    // 4. t_secom_alarm 과 유사한 구조를 가진 테이블 컬럼 탐색
    console.log('\n=== [4] alarm/secom/caps 이름 포함 테이블 상세 컬럼 조회 ===');
    const candidates = allTables.filter(t =>
      ['alarm', 'secom', 'caps', 'access', 'enter'].some(k => t.TABLE_NAME.toLowerCase().includes(k))
    );
    for (const t of candidates) {
      const [cols] = await conn.execute(`
        SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'whr' AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [t.TABLE_NAME]);
      console.log(`\n  [${t.TABLE_NAME}]`);
      console.log(`    컬럼: ${cols.map(c => c.COLUMN_NAME).join(', ')}`);

      // 최근 데이터 1건 샘플
      try {
        const [sample] = await conn.execute(`SELECT * FROM \`${t.TABLE_NAME}\` LIMIT 1`);
        if (sample.length > 0) {
          console.log(`    샘플: ${JSON.stringify(sample[0]).substring(0, 200)}`);
        } else {
          console.log(`    샘플: 데이터 없음`);
        }
      } catch(e) {
        console.log(`    샘플 조회 실패: ${e.message}`);
      }
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
