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

async function inspectSubholi() {
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    
    // 김부호 님의 O_SUBHOLI_CNT, O_LESSLEV_CNT, O_ANNLEV_CNT, O_TOTAL_CNT 조회
    const [rows] = await conn.execute(`
      SELECT 
        D_START_DATE,
        D_END_DATE,
        I_CODE,
        O_SUBHOLI_CNT,
        O_LESSLEV_CNT,
        O_ANNLEV_CNT,
        O_TOTAL_CNT,
        I_STATUS,
        N_RMK
      FROM hr_yuncha_use
      WHERE I_COMPANY = '1600' AND I_EMPLOY_NO = ? AND I_STATUS = '40'
      ORDER BY D_START_DATE DESC
    `, [TARGET_EMP_NO]);

    console.log(`=== 김부호 님(20240052) hr_yuncha_use 상세 컬럼 조회 (${rows.length}건) ===`);
    console.table(rows);

    // 컬럼별 SUM 합계
    const [sumRow] = await conn.execute(`
      SELECT 
        SUM(CAST(COALESCE(O_SUBHOLI_CNT, 0) AS DECIMAL(10,3))) AS total_subholi,
        SUM(CAST(COALESCE(O_LESSLEV_CNT, 0) AS DECIMAL(10,3))) AS total_lesslev,
        SUM(CAST(COALESCE(O_ANNLEV_CNT, 0) AS DECIMAL(10,3))) AS total_annlev,
        SUM(CAST(COALESCE(O_TOTAL_CNT, 0) AS DECIMAL(10,3)))   AS total_sum
      FROM hr_yuncha_use
      WHERE I_COMPANY = '1600' AND I_EMPLOY_NO = ? AND I_STATUS = '40'
    `, [TARGET_EMP_NO]);

    console.log('\n=== 승인완료(I_STATUS=40) 컬럼별 합계 ===');
    console.table(sumRow);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

inspectSubholi();
