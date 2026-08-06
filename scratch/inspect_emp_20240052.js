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

const TARGET_EMP_NO = '20240052';
const COMPANY_CODE = '1600';

async function inspectEmpLeave() {
  let conn;
  try {
    console.log('====================================================');
    console.log(`🔍 사번 [${TARGET_EMP_NO}] (김부호 님) 연차/휴가 데이터 상세 분석`);
    console.log(`Connecting to MySQL (${MYSQL_CONFIG.host})...`);
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Connection established successfully!\n');

    // 1. hr_employee 정보 조회
    const [empRows] = await conn.execute(`
      SELECT I_COMPANY, I_EMPLOY_NO, N_EMPLOY_NAME, I_DEPT, D_JOIN_DATE, I_YUNCHA_GEN_TYPE, D_YUNCHA_STAN_DATE, I_RETIRE_YN
      FROM hr_employee
      WHERE (I_EMPLOY_NO = ? OR I_EMPLOY_NO LIKE ?)
    `, [TARGET_EMP_NO, `%${TARGET_EMP_NO}`]);

    console.log('📌 1. 직원 마스터 정보 (hr_employee):');
    console.table(empRows);

    // 2. hr_yuncha_use 전체 내역 조회
    const [leaveRows] = await conn.execute(`
      SELECT 
        y.I_COMPANY,
        y.I_EMPLOY_NO,
        y.D_START_DATE,
        y.D_END_DATE,
        y.I_CODE,
        y.O_ANNLEV_CNT,
        y.I_STATUS,
        y.N_RMK
      FROM hr_yuncha_use y
      WHERE (y.I_EMPLOY_NO = ? OR y.I_EMPLOY_NO LIKE ?)
      ORDER BY y.D_START_DATE DESC
    `, [TARGET_EMP_NO, `%${TARGET_EMP_NO}`]);

    console.log(`\n📌 2. 전체 휴가 사용 신청 내역 (총 ${leaveRows.length}건):`);
    console.table(leaveRows.map(r => ({
      '시작일': r.D_START_DATE,
      '종료일': r.D_END_DATE,
      '코드(I_CODE)': r.I_CODE,
      '사용일수(O_ANNLEV_CNT)': r.O_ANNLEV_CNT,
      '상태(I_STATUS)': r.I_STATUS,
      '사유(N_RMK)': r.N_RMK,
    })));

    // 3. I_CODE (휴가 종류) 및 승인상태(I_STATUS)별 통계 합계
    const [statsByCode] = await conn.execute(`
      SELECT 
        I_CODE,
        I_STATUS,
        COUNT(*) AS cnt,
        SUM(CAST(O_ANNLEV_CNT AS DECIMAL(10,3))) AS total_days
      FROM hr_yuncha_use
      WHERE (I_EMPLOY_NO = ? OR I_EMPLOY_NO LIKE ?)
      GROUP BY I_CODE, I_STATUS
      ORDER BY I_CODE, I_STATUS
    `, [TARGET_EMP_NO, `%${TARGET_EMP_NO}`]);

    console.log('\n📌 3. 휴가 코드(I_CODE) & 승인상태(I_STATUS)별 집계:');
    console.table(statsByCode);

    // 4. 올해(2025/2026) 승인완료(I_STATUS='40') 집계
    const [approvedStats] = await conn.execute(`
      SELECT 
        I_CODE,
        SUM(CAST(O_ANNLEV_CNT AS DECIMAL(10,3))) AS approved_days
      FROM hr_yuncha_use
      WHERE (I_EMPLOY_NO = ? OR I_EMPLOY_NO LIKE ?)
        AND I_STATUS = '40'
      GROUP BY I_CODE
    `, [TARGET_EMP_NO, `%${TARGET_EMP_NO}`]);

    console.log('\n📌 4. 승인 완료(I_STATUS=40) 휴가 코드별 최종 합산 일수:');
    console.table(approvedStats);

    // 5. 비고(N_RMK) 텍스트 분석 (대체/대휴 키워드 검색)
    const [rmkStats] = await conn.execute(`
      SELECT 
        D_START_DATE, D_END_DATE, I_CODE, O_ANNLEV_CNT, N_RMK
      FROM hr_yuncha_use
      WHERE (I_EMPLOY_NO = ? OR I_EMPLOY_NO LIKE ?)
        AND (N_RMK LIKE '%대체%' OR N_RMK LIKE '%대휴%' OR N_RMK LIKE '%주말%')
    `, [TARGET_EMP_NO, `%${TARGET_EMP_NO}`]);

    console.log('\n📌 5. 사유(N_RMK)에 "대체/대휴/주말"이 포함된 내역:');
    console.table(rmkStats);

  } catch (err) {
    console.error('\n❌ MySQL Error:', err.message);
  } finally {
    if (conn) await conn.end();
    console.log('\n====================================================');
  }
}

inspectEmpLeave();
