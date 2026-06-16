/**
 * caps1200 우리 회사(1600, Q_ 접두사) 직원 출입기록 분석
 * 실행: node analyze_caps_ours.js
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

const DEPT_FILTER_SQL = `(
  d.N_DEPT = '플랫폼서비스실'
  OR d.N_DEPT = '사업개발팀'
  OR d.N_DEPT REGEXP '사업관리 ?[123]팀'
)`;

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('MySQL 연결 성공\n');

    // 1. caps1200에서 우리 회사 직원만 필터 (Q_ 접두사 OR 1600으로 시작하는 IDNO)
    console.log('=== [1] caps1200 우리 회사 직원 전체 (Q_ 또는 IDNO=1600...) ===');
    const [ours] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO, E_CARD
      FROM caps1200
      WHERE E_NAME LIKE 'Q\\_%' OR E_IDNO LIKE '1600%'
      ORDER BY E_DATE DESC, E_TIME DESC
    `);
    if (ours.length === 0) {
      console.log('  해당 데이터 없음');
    } else {
      ours.forEach((r, i) => {
        console.log(`  [${String(i+1).padStart(2)}] ${r.E_DATE} ${r.E_TIME} | 게이트: ${r.G_ID} | 이름: ${(r.E_NAME||'').padEnd(15)} | IDNO: ${r.E_IDNO}`);
      });
      console.log(`\n  → 총 ${ours.length}건`);
    }

    // 2. 날짜 범위 및 건수
    console.log('\n=== [2] 날짜 범위 ===');
    const [range] = await conn.execute(`
      SELECT MIN(E_DATE) as min_date, MAX(E_DATE) as max_date, COUNT(*) as total
      FROM caps1200
      WHERE E_NAME LIKE 'Q\\_%' OR E_IDNO LIKE '1600%'
    `);
    console.log(`  최초: ${range[0].min_date} | 최신: ${range[0].max_date} | 총 건수: ${range[0].total}`);

    // 3. hr_employee JOIN으로 실제 이름·부서 확인 (스타팅빌딩 부서 필터 없이 전체)
    console.log('\n=== [3] hr_employee JOIN - 직원 매칭 현황 ===');
    const [joined] = await conn.execute(`
      SELECT
        c.E_DATE, c.E_TIME, c.G_ID,
        c.E_NAME AS caps_name,
        c.E_IDNO,
        e.I_EMPLOY_NO,
        e.N_EMPLOY_NAME AS real_name,
        d.N_DEPT
      FROM caps1200 c
      LEFT JOIN hr_employee e
        ON e.I_COMPANY = '1600'
        AND e.I_EMPLOY_NO = RIGHT(c.E_IDNO, 8)
        AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
      LEFT JOIN hr_department d
        ON d.I_COMPANY = '1600' AND d.I_DEPT = e.I_DEPT
      WHERE c.E_NAME LIKE 'Q\\_%' OR c.E_IDNO LIKE '1600%'
      ORDER BY c.E_DATE DESC, c.E_TIME DESC
    `);
    joined.forEach((r, i) => {
      const matchStatus = r.real_name ? '✅' : '❌미매칭';
      console.log(`  [${String(i+1).padStart(2)}] ${r.E_DATE} ${r.E_TIME} | G:${r.G_ID} | caps명: ${(r.caps_name||'').padEnd(12)} | 실제명: ${(r.real_name||'?').padEnd(8)} | 부서: ${r.N_DEPT||'?'} ${matchStatus}`);
    });

    // 4. 스타팅빌딩 부서 직원만 필터
    console.log('\n=== [4] 스타팅빌딩 부서 직원만 ===');
    const [starting] = await conn.execute(`
      SELECT
        c.E_DATE, c.E_TIME, c.G_ID,
        c.E_NAME AS caps_name,
        c.E_IDNO,
        e.I_EMPLOY_NO,
        e.N_EMPLOY_NAME AS real_name,
        d.N_DEPT
      FROM caps1200 c
      INNER JOIN hr_employee e
        ON e.I_COMPANY = '1600'
        AND e.I_EMPLOY_NO = RIGHT(c.E_IDNO, 8)
        AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
      INNER JOIN hr_department d
        ON d.I_COMPANY = '1600' AND d.I_DEPT = e.I_DEPT
      WHERE (c.E_NAME LIKE 'Q\\_%' OR c.E_IDNO LIKE '1600%')
        AND ${DEPT_FILTER_SQL}
      ORDER BY c.E_DATE DESC, c.E_TIME DESC
    `);
    if (starting.length === 0) {
      console.log('  스타팅빌딩 부서 직원 캡스 기록 없음');
    } else {
      starting.forEach((r, i) => {
        console.log(`  [${String(i+1).padStart(2)}] ${r.E_DATE} ${r.E_TIME} | 게이트: ${r.G_ID} | ${r.real_name} (${r.N_DEPT})`);
      });
    }

    // 5. caps1200 전체 게이트 분포 (우리 회사 기준)
    console.log('\n=== [5] 게이트별 분포 (우리 회사 직원) ===');
    const [gDist] = await conn.execute(`
      SELECT G_ID, COUNT(*) as cnt
      FROM caps1200
      WHERE E_NAME LIKE 'Q\\_%' OR E_IDNO LIKE '1600%'
      GROUP BY G_ID ORDER BY cnt DESC
    `);
    gDist.forEach(g => console.log(`  게이트 ${g.G_ID}: ${g.cnt}건`));

    // 6. 오늘 데이터 체크
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    console.log(`\n=== [6] 오늘(${todayStr}) 캡스 기록 ===`);
    const [todayRows] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO
      FROM caps1200
      WHERE E_DATE = ?
        AND (E_NAME LIKE 'Q\\_%' OR E_IDNO LIKE '1600%')
      ORDER BY E_TIME DESC
    `, [todayStr]);
    if (todayRows.length === 0) {
      console.log('  오늘 캡스 기록 없음');
    } else {
      todayRows.forEach(r => console.log(`  ${r.E_TIME} | G:${r.G_ID} | ${r.E_NAME} (${r.E_IDNO})`));
    }

    // 7. caps1200이 실시간으로 쌓이는지 확인 (최신 데이터가 오늘인지?)
    console.log('\n=== [7] caps1200 전체 최신 데이터 5건 ===');
    const [latest] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO
      FROM caps1200
      ORDER BY E_DATE DESC, E_TIME DESC
      LIMIT 5
    `);
    latest.forEach(r => console.log(`  ${r.E_DATE} ${r.E_TIME} | G:${r.G_ID} | ${r.E_NAME} (${r.E_IDNO})`));

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
