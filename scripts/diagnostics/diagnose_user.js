const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: '[REDACTED MYSQL HOST]',
  user: 'whradmin',
  password: '[REDACTED MYSQL PASSWORD]',
  database: 'whr',
  port: 3306,
  connectTimeout: 10000
};

const TARGET_SABUN = '20260008';
const FULL_SABUN = '160020260008';

async function run() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('[+] MySQL 연결 성공\n');
    console.log(`[분석 대상 사번] ${TARGET_SABUN} (풀사번: ${FULL_SABUN})\n`);

    // 1. hr_employee 정보 조회
    console.log('=== [1] hr_employee (인사 테이블) 정보 ===');
    try {
      const [rows] = await conn.query(`
        SELECT 
          e.I_COMPANY,
          e.I_EMPLOY_NO,
          e.N_EMPLOY_NAME,
          e.I_DEPT,
          d.N_DEPT,
          e.I_RETIRE_YN,
          e.D_JOIN_DATE,
          e.D_RETIRE_DATE
        FROM hr_employee e
        LEFT JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
        WHERE e.I_COMPANY = '1600' AND e.I_EMPLOY_NO = ?
      `, [TARGET_SABUN]);

      if (rows.length === 0) {
        console.log(`  [-] hr_employee 테이블에 사번 ${TARGET_SABUN} 정보가 존재하지 않습니다.`);
      } else {
        const emp = rows[0];
        console.log(`  [O] 사원명: ${emp.N_EMPLOY_NAME}`);
        console.log(`  [O] 부서코드: ${emp.I_DEPT} (부서명: ${emp.N_DEPT})`);
        console.log(`  [O] 입사일: ${emp.D_JOIN_DATE} | 퇴사일: ${emp.D_RETIRE_DATE}`);
        console.log(`  [O] 퇴직여부(I_RETIRE_YN): ${emp.I_RETIRE_YN}`);
        
        // 부서 필터 조건 부합 여부 체크
        const allowedDepts = ['플랫폼서비스실', '사업개발팀', '사업관리 1팀', '사업관리 2팀', '사업관리 3팀', '사업관리1팀', '사업관리2팀', '사업관리3팀'];
        if (allowedDepts.includes(emp.N_DEPT)) {
          console.log('  [O] 이 부서는 대시보드 노출 대상 부서가 맞습니다.');
        } else {
          console.log(`  [X] 경고: 부서 "${emp.N_DEPT}"는 대시보드 노출 대상 부서(플랫폼서비스실, 사업개발팀, 사업관리1~3팀)가 아닙니다!`);
        }
      }
    } catch (e) {
      console.log(`  [-] 인사 테이블 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 2. t_secom_person_p 정보 조회 (세콤 연동 사원 정보)
    console.log('=== [2] t_secom_person_p (세콤 사원 테이블) 정보 ===');
    try {
      const [rows] = await conn.query(`
        SELECT * FROM t_secom_person_p 
        WHERE Sabun = ? OR Sabun LIKE ?
      `, [FULL_SABUN, `%${TARGET_SABUN}`]);

      if (rows.length === 0) {
        console.log(`  [-] t_secom_person_p 테이블에 사번 ${TARGET_SABUN} 정보가 존재하지 않습니다.`);
        console.log(`      (세콤 매니저의 사원 정보가 AWS MySQL로 동기화되지 않았을 가능성이 있습니다.)`);
      } else {
        const p = rows[0];
        console.log(`  [O] Sabun (사번): ${p.Sabun}`);
        console.log(`  [O] Name (이름): ${p.Name}`);
        console.log(`  [O] Company: ${p.Company} | Department: ${p.Department}`);
        console.log(`  [O] WorkStatus (근무상태): ${p.WorkStatus}`);
        console.log(`  [O] CardCnt: ${p.CardCnt}`);
      }
    } catch (e) {
      console.log(`  [-] 세콤 사원 테이블 조회 실패: ${e.message}`);
    }
    console.log('\n');

    // 3. t_secom_alarm 오늘 태깅 기록 조회
    console.log('=== [3] t_secom_alarm 오늘(20260522) 태깅 내역 ===');
    try {
      const [rows] = await conn.query(`
        SELECT ATime, CardNo, Name, EqCode, Sabun, State, Flag1 
        FROM t_secom_alarm 
        WHERE ATime LIKE '20260522%' 
          AND (Sabun = ? OR Sabun LIKE ? OR CardNo IN (
             SELECT CardNo FROM t_secom_person_p WHERE Sabun = ?
          ))
        ORDER BY ATime DESC
      `, [FULL_SABUN, `%${TARGET_SABUN}`, FULL_SABUN]);

      if (rows.length === 0) {
        console.log(`  [-] 오늘 t_secom_alarm 테이블에 사번 ${TARGET_SABUN} (혹은 연동된 카드)로 찍힌 로그가 0건입니다.`);
      } else {
        console.log(`  [O] 오늘 총 ${rows.length}건의 태깅 내역이 발견되었습니다:`);
        rows.forEach((r, idx) => {
          console.log(`    [${idx+1}] 시간: ${r.ATime} | 카드: ${r.CardNo} | 이름: ${r.Name} | 게이트: ${r.EqCode} | 사번컬럼: ${r.Sabun}`);
        });
      }
    } catch (e) {
      console.log(`  [-] 오늘 태깅 내역 조회 실패: ${e.message}`);
    }
    console.log('\n');

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
