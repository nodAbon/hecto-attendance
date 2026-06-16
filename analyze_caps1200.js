/**
 * caps1200 테이블 상세 분석 스크립트
 * 실행: node analyze_caps1200.js
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

    // 1. caps1200 전체 데이터 조회 (66행이니 전부 봐도 됨)
    console.log('=== [1] caps1200 전체 데이터 (최신순) ===');
    const [rows] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO, E_GROUP, E_CARD
      FROM caps1200
      ORDER BY E_DATE DESC, E_TIME DESC
    `);
    rows.forEach((r, i) => {
      console.log(`  [${String(i+1).padStart(2)}] ${r.E_DATE} ${r.E_TIME} | 게이트: ${r.G_ID} | 이름: ${(r.E_NAME||'').padEnd(15)} | IDNO: ${r.E_IDNO} | CARD: ${r.E_CARD || 'null'}`);
    });

    // 2. 날짜 범위 확인
    console.log('\n=== [2] 날짜 범위 ===');
    const [range] = await conn.execute(`
      SELECT MIN(E_DATE) as min_date, MAX(E_DATE) as max_date, COUNT(*) as total
      FROM caps1200
    `);
    console.log(`  최초: ${range[0].min_date} | 최신: ${range[0].max_date} | 총 행수: ${range[0].total}`);

    // 3. G_ID(게이트) 분포
    console.log('\n=== [3] 게이트(G_ID) 분포 ===');
    const [gates] = await conn.execute(`
      SELECT G_ID, COUNT(*) as cnt FROM caps1200
      GROUP BY G_ID ORDER BY G_ID
    `);
    gates.forEach(g => console.log(`  게이트 ${g.G_ID}: ${g.cnt}건`));

    // 4. E_IDNO 패턴 분석 (우리 회사 1600 직원인지?)
    console.log('\n=== [4] E_IDNO 패턴 분석 ===');
    const [idnos] = await conn.execute(`
      SELECT DISTINCT E_IDNO, E_NAME, E_CARD
      FROM caps1200
      ORDER BY E_IDNO
    `);
    idnos.forEach(r => {
      const prefix = (r.E_IDNO || '').substring(0, 4);
      console.log(`  IDNO: ${(r.E_IDNO||'').padEnd(20)} | 이름: ${(r.E_NAME||'').padEnd(15)} | 카드: ${r.E_CARD || 'null'} | 회사코드추정: ${prefix}`);
    });

    // 5. E_IDNO가 1600으로 시작하는 우리 회사 직원인지 JOIN으로 확인
    console.log('\n=== [5] hr_employee와 JOIN하여 우리 회사(1600) 직원 매칭 확인 ===');
    const [matched] = await conn.execute(`
      SELECT
        c.E_DATE, c.E_TIME, c.G_ID, c.E_NAME as caps_name, c.E_IDNO,
        e.I_EMPLOY_NO, e.N_EMPLOY_NAME, e.I_DEPT
      FROM caps1200 c
      LEFT JOIN hr_employee e
        ON e.I_COMPANY = '1600'
        AND (
          c.E_IDNO = CONCAT('1600', e.I_EMPLOY_NO)
          OR c.E_IDNO = e.I_EMPLOY_NO
          OR c.E_CARD = e.I_EMPLOY_NO
        )
      ORDER BY c.E_DATE DESC, c.E_TIME DESC
      LIMIT 20
    `);
    matched.forEach((r, i) => {
      const matched = r.I_EMPLOY_NO ? '✅ 매칭' : '❌ 미매칭';
      console.log(`  [${i+1}] ${r.E_DATE} ${r.E_TIME} | ${r.caps_name} (${r.E_IDNO}) ${matched} → ${r.N_EMPLOY_NAME || '-'}`);
    });

    // 6. 오늘 데이터 있는지?
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    console.log(`\n=== [6] 오늘(${todayStr}) 데이터 ===`);
    const [todayRows] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO
      FROM caps1200
      WHERE E_DATE = ?
      ORDER BY E_TIME DESC
    `, [todayStr]);
    if (todayRows.length === 0) {
      console.log('  오늘 데이터 없음');
    } else {
      todayRows.forEach(r => console.log(`  ${r.E_TIME} | 게이트: ${r.G_ID} | ${r.E_NAME} (${r.E_IDNO})`));
    }

    // 7. t_secom_alarm과 비교 - 같은 날 동일 직원이 두 테이블에 다 있는지?
    console.log('\n=== [7] 최근 공통 날짜 비교 (caps1200 vs t_secom_alarm) ===');
    const [commonDates] = await conn.execute(`
      SELECT DISTINCT c.E_DATE
      FROM caps1200 c
      INNER JOIN t_secom_alarm s ON LEFT(s.ATime, 8) = c.E_DATE
      ORDER BY c.E_DATE DESC
      LIMIT 5
    `);
    if (commonDates.length === 0) {
      console.log('  공통 날짜 없음 → 두 시스템이 서로 다른 기간 운영');
    } else {
      commonDates.forEach(d => console.log(`  공통 날짜: ${d.E_DATE}`));
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
