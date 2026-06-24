/**
 * tenter 테이블 현황 심층 분석
 * - 캡스(4000/4004) vs 세콤 기록 비교
 * - 동기화가 언제 멈췄는지 확인
 * 실행: node analyze_tenter_status.js
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

    // 1. tenter 전체 최신 데이터 (게이트 무관) - 동기화 멈춘 시점 확인
    console.log('=== [1] tenter 전체 최신 기록 10건 ===');
    const [latest] = await conn.execute(`
      SELECT E_DATE, E_TIME, G_ID, E_NAME, E_IDNO
      FROM tenter
      ORDER BY E_DATE DESC, E_TIME DESC
      LIMIT 10
    `);
    latest.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.E_DATE} ${r.E_TIME} | G:${r.G_ID} | ${r.E_NAME} | ${r.E_IDNO}`);
    });

    // 2. tenter vs t_secom_alarm 날짜 범위 비교
    console.log('\n=== [2] 날짜 범위 비교 ===');
    const [tRange] = await conn.execute(`SELECT MIN(CONCAT(E_DATE,E_TIME)) min, MAX(CONCAT(E_DATE,E_TIME)) max, COUNT(*) cnt FROM tenter`);
    const [sRange] = await conn.execute(`SELECT MIN(ATime) min, MAX(ATime) max, COUNT(*) cnt FROM t_secom_alarm`);
    console.log(`  tenter      : ${tRange[0].min} ~ ${tRange[0].max}  (${tRange[0].cnt}건)`);
    console.log(`  t_secom_alarm: ${sRange[0].min} ~ ${sRange[0].max}  (${sRange[0].cnt}건)`);

    // 3. tenter에서 캡스(4000/4004) vs 세콤(나머지) 게이트 분포
    console.log('\n=== [3] tenter 게이트별 분포 (우리 회사 Q_ 직원) ===');
    const [gDist] = await conn.execute(`
      SELECT G_ID, COUNT(*) as cnt,
             MIN(CONCAT(E_DATE,E_TIME)) as first,
             MAX(CONCAT(E_DATE,E_TIME)) as last
      FROM tenter
      WHERE E_NAME LIKE 'Q\\_%'
      GROUP BY G_ID
      ORDER BY cnt DESC
    `);
    gDist.forEach(g => {
      const type = ['4000','4004'].includes(g.G_ID) ? '📱캡스' : '🔒세콤';
      console.log(`  ${type} G:${g.G_ID.padEnd(6)} ${g.cnt}건   ${g.first} ~ ${g.last}`);
    });

    // 4. 월별 캡스(4000/4004) 기록 건수 추이
    console.log('\n=== [4] tenter 캡스(4000/4004) 월별 건수 추이 ===');
    const [monthly] = await conn.execute(`
      SELECT LEFT(E_DATE, 6) as ym, COUNT(*) as cnt
      FROM tenter
      WHERE G_ID IN ('4000','4004') AND E_NAME LIKE 'Q\\_%'
      GROUP BY LEFT(E_DATE, 6)
      ORDER BY ym
    `);
    monthly.forEach(r => console.log(`  ${r.ym}: ${r.cnt}건`));

    // 5. 오늘(2026-05-22) 세콤 vs 캡스 비교
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    console.log(`\n=== [5] 오늘(${todayStr}) 기록 소스별 현황 ===`);
    const [todaySecom] = await conn.execute(`SELECT COUNT(*) cnt FROM t_secom_alarm WHERE ATime LIKE '${todayStr}%' AND Sabun LIKE '1600%'`);
    const [todayTenter] = await conn.execute(`SELECT COUNT(*) cnt FROM tenter WHERE E_DATE = '${todayStr}' AND E_NAME LIKE 'Q\\_%'`);
    console.log(`  t_secom_alarm (오늘, 1600 사번): ${todaySecom[0].cnt}건`);
    console.log(`  tenter (오늘, Q_ 직원):          ${todayTenter[0].cnt}건`);

    // 6. 스타팅빌딩 부서 직원 중 캡스만 쓰는 직원 파악
    console.log('\n=== [6] 스타팅빌딩 부서 직원 중 캡스 기록 있는 직원 ===');
    const [capsEmps] = await conn.execute(`
      SELECT DISTINCT
        t.E_IDNO, t.E_NAME,
        d.N_DEPT,
        COUNT(*) as caps_cnt,
        MAX(CONCAT(t.E_DATE, t.E_TIME)) as last_record
      FROM tenter t
      INNER JOIN hr_employee e
        ON e.I_COMPANY = '1600'
        AND e.I_EMPLOY_NO = RIGHT(t.E_IDNO, 8)
        AND COALESCE(e.I_RETIRE_YN,'0') <> '1'
      INNER JOIN hr_department d
        ON d.I_COMPANY = '1600' AND d.I_DEPT = e.I_DEPT
      WHERE t.G_ID IN ('4000','4004')
        AND ${DEPT_FILTER_SQL}
      GROUP BY t.E_IDNO, t.E_NAME, d.N_DEPT
      ORDER BY last_record DESC
    `);
    if (capsEmps.length === 0) {
      console.log('  스타팅빌딩 부서 직원 중 캡스 기록 없음');
    } else {
      console.log(`  총 ${capsEmps.length}명`);
      capsEmps.forEach((r, i) => {
        console.log(`  [${String(i+1).padStart(2)}] ${r.E_NAME.padEnd(10)} | ${r.N_DEPT} | 캡스기록: ${r.caps_cnt}건 | 마지막: ${r.last_record}`);
      });
    }

    // 7. 스타팅빌딩 부서 직원 중 세콤 기록은 없고 캡스 기록만 있는 직원
    console.log('\n=== [7] 세콤 기록 없고 캡스 기록만 있는 스타팅빌딩 직원 ===');
    const [capsOnly] = await conn.execute(`
      SELECT DISTINCT
        e.I_EMPLOY_NO, e.N_EMPLOY_NAME, d.N_DEPT
      FROM hr_employee e
      INNER JOIN hr_department d ON d.I_COMPANY = '1600' AND d.I_DEPT = e.I_DEPT
      WHERE e.I_COMPANY = '1600'
        AND COALESCE(e.I_RETIRE_YN,'0') <> '1'
        AND ${DEPT_FILTER_SQL}
        AND EXISTS (
          SELECT 1 FROM tenter t
          WHERE t.G_ID IN ('4000','4004')
            AND RIGHT(t.E_IDNO, 8) = e.I_EMPLOY_NO
        )
        AND NOT EXISTS (
          SELECT 1 FROM t_secom_alarm s
          WHERE s.Sabun = CONCAT('1600', e.I_EMPLOY_NO)
        )
      ORDER BY d.N_DEPT, e.N_EMPLOY_NAME
    `);
    if (capsOnly.length === 0) {
      console.log('  해당 없음');
    } else {
      console.log(`  총 ${capsOnly.length}명 (이 직원들은 현재 대시보드에서 미출근으로 잡힘)`);
      capsOnly.forEach((r, i) => {
        console.log(`  [${String(i+1).padStart(2)}] ${r.N_EMPLOY_NAME} (${r.I_EMPLOY_NO}) | ${r.N_DEPT}`);
      });
    }

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
