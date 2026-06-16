/**
 * 캡스 실시간 데이터 소스 탐색
 * - 2026년에 업데이트된 테이블 중 캡스 관련 찾기
 * - caps1200 최신 상태 재확인
 * 실행: node find_caps_live.js
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

    // 1. caps1200 전체 최신 데이터 재확인 (날짜범위, 최신건)
    console.log('=== [1] caps1200 전체 현황 ===');
    const [capsMeta] = await conn.execute(`
      SELECT MIN(CONCAT(E_DATE,E_TIME)) min, MAX(CONCAT(E_DATE,E_TIME)) max, COUNT(*) cnt
      FROM caps1200
    `);
    console.log(`  날짜범위: ${capsMeta[0].min} ~ ${capsMeta[0].max} | 총 ${capsMeta[0].cnt}건`);

    const [capsLatest] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO
      FROM caps1200
      ORDER BY E_DATE DESC, E_TIME DESC
      LIMIT 5
    `);
    capsLatest.forEach(r => console.log(`  ${r.E_DATE} ${r.E_TIME} | G:${r.G_ID} | ${r.E_NAME} | ${r.E_IDNO || 'null'}`));

    // 2. 2026년에 데이터가 있는 모든 테이블 탐색 (출입 관련 컬럼 가진 것)
    console.log('\n=== [2] 2026년 이후 데이터가 있는 출입/근태 관련 테이블 ===');
    // tenter와 같은 구조(E_DATE, E_TIME, G_ID 컬럼 가진) 테이블 전체 조회
    const [colTables] = await conn.execute(`
      SELECT DISTINCT TABLE_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'whr'
        AND COLUMN_NAME = 'E_DATE'
      ORDER BY TABLE_NAME
    `);
    console.log(`  E_DATE 컬럼을 가진 테이블 목록:`);
    for (const t of colTables) {
      try {
        const [r] = await conn.execute(`
          SELECT MAX(CONCAT(E_DATE, IFNULL(E_TIME,''))) as latest, COUNT(*) as cnt
          FROM \`${t.TABLE_NAME}\`
          WHERE E_DATE >= '20260101'
        `);
        if (r[0].cnt > 0) {
          console.log(`  ✅ ${t.TABLE_NAME.padEnd(35)} 2026년 데이터: ${r[0].cnt}건, 최신: ${r[0].latest}`);
        } else {
          console.log(`  ❌ ${t.TABLE_NAME.padEnd(35)} 2026년 데이터 없음`);
        }
      } catch(e) {
        console.log(`  ⚠️  ${t.TABLE_NAME.padEnd(35)} 조회 오류: ${e.message.substring(0,50)}`);
      }
    }

    // 3. 다른 스키마(whr_20251229, whr_251101 등)에서 caps 관련 테이블 탐색
    console.log('\n=== [3] 다른 스키마에서 caps/enter 관련 테이블 탐색 ===');
    const schemas = ['whr_20251229', 'whr_251101', 'whr_bak20251102_1531'];
    for (const schema of schemas) {
      try {
        const [tbls] = await conn.execute(`
          SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ?
            AND (TABLE_NAME LIKE '%caps%' OR TABLE_NAME LIKE '%enter%' OR TABLE_NAME LIKE '%tenter%')
        `, [schema]);
        if (tbls.length > 0) {
          console.log(`\n  [${schema}]`);
          tbls.forEach(t => console.log(`    ${t.TABLE_NAME} (행수: ${t.TABLE_ROWS})`));
        } else {
          console.log(`  [${schema}] - 관련 테이블 없음`);
        }
      } catch(e) {
        console.log(`  [${schema}] - 접근 불가: ${e.message.substring(0,50)}`);
      }
    }

    // 4. ATime 컬럼(세콤 형식) 가진 테이블 중 2026년 데이터 있는 것
    console.log('\n=== [4] ATime 컬럼 가진 테이블 중 2026년 데이터 ===');
    const [atimeTables] = await conn.execute(`
      SELECT DISTINCT TABLE_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'whr' AND COLUMN_NAME = 'ATime'
    `);
    for (const t of atimeTables) {
      try {
        const [r] = await conn.execute(`
          SELECT MAX(ATime) as latest, COUNT(*) as cnt
          FROM \`${t.TABLE_NAME}\`
          WHERE ATime >= '20260101'
        `);
        if (r[0].cnt > 0) {
          console.log(`  ✅ ${t.TABLE_NAME.padEnd(30)} 2026년: ${r[0].cnt}건, 최신: ${r[0].latest}`);
        }
      } catch(e) {}
    }

    // 5. 현재 캡스(G:4000, 4004) 사용 직원이 오늘 어디서 찍혔는지
    const todayStr = `${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}`;
    console.log(`\n=== [5] 과거 캡스 사용 직원 10명, 오늘(${todayStr}) 세콤 기록 확인 ===`);
    const capsEmpNos = ['20240047','20220033','20240050','20240047','20250058','20230039','20240048','20220027','20230042','20200013'];
    const [todayCheck] = await conn.execute(`
      SELECT s.Sabun, s.Name, COUNT(*) as cnt, MAX(s.ATime) as last
      FROM t_secom_alarm s
      WHERE s.ATime LIKE '${todayStr}%'
        AND s.Sabun IS NOT NULL
        AND RIGHT(s.Sabun, 8) IN (${capsEmpNos.map(n => `'${n}'`).join(',')})
      GROUP BY s.Sabun, s.Name
      ORDER BY last DESC
    `);
    if (todayCheck.length === 0) {
      console.log('  오늘 세콤 기록 없음 (캡스 사용 직원들)');
    } else {
      todayCheck.forEach(r => console.log(`  ${r.Name} (${r.Sabun}) - 오늘 세콤 ${r.cnt}건, 마지막: ${r.last}`));
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
