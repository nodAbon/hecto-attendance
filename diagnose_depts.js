// 부서명 및 직원 수 진단 스크립트
// 실행: node diagnose_depts.js

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
    console.log('[+] 연결 성공\n');

    // [1] I_COMPANY='1600' 재직자가 속한 부서 전체 목록 + 인원수 (NULL 포함)
    console.log('=== [1] I_COMPANY=1600, 퇴직(1) 제외 직원의 부서별 인원 (NULL 포함) ===');
    const [depts] = await conn.execute(`
      SELECT d.N_DEPT, COUNT(*) AS cnt
      FROM hr_employee e
      INNER JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
      WHERE e.I_COMPANY = '1600' AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
      GROUP BY d.N_DEPT
      ORDER BY cnt DESC
    `);
    depts.forEach(r => console.log(`  [${r.cnt}명] "${r.N_DEPT}"`));

    console.log('\n=== [2] I_RETIRE_YN 값 분포 (I_COMPANY=1600) ===');
    const [retireVals] = await conn.execute(`
      SELECT I_RETIRE_YN, COUNT(*) AS cnt
      FROM hr_employee
      WHERE I_COMPANY = '1600'
      GROUP BY I_RETIRE_YN
    `);
    retireVals.forEach(r => console.log(`  I_RETIRE_YN="${r.I_RETIRE_YN}" : ${r.cnt}명`));

    console.log('\n=== [3] "사업관리" 포함 부서명 전체 조회 ===');
    const [mgmt] = await conn.execute(`
      SELECT DISTINCT d.N_DEPT, COUNT(e.I_EMPLOY_NO) AS cnt
      FROM hr_department d
      LEFT JOIN hr_employee e ON e.I_COMPANY = d.I_COMPANY AND e.I_DEPT = d.I_DEPT AND e.I_RETIRE_YN = '0'
      WHERE d.I_COMPANY = '1600' AND d.N_DEPT LIKE '%사업관리%'
      GROUP BY d.N_DEPT
    `);
    mgmt.forEach(r => console.log(`  "${r.N_DEPT}" : ${r.cnt}명`));

    console.log('\n=== [4] 수정된 필터 적용 결과 인원 수 (NULL 포함, 퇴직 제외) ===');
    const [filtered] = await conn.execute(`
      SELECT COUNT(*) AS total
      FROM hr_employee e
      INNER JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
      WHERE e.I_COMPANY = '1600'
        AND COALESCE(e.I_RETIRE_YN, '0') <> '1'
        AND (
          d.N_DEPT = '플랫폼서비스실'
          OR d.N_DEPT = '사업개발팀'
          OR d.N_DEPT REGEXP '사업관리 ?[123]팀'
        )
    `);
    console.log(`  수정된 필터 결과: ${filtered[0].total}명`);

  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
