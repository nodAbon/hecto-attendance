const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: 'Prd-Hecto-WHR-Ext-NLB-8e82b66ed560637d.elb.ap-northeast-2.amazonaws.com',
  user: 'whradmin',
  password: '1q2w3e4r!@#$',
  database: 'whr',
  port: 3306,
  connectTimeout: 5000
};

const MY_COMPANY_CODE = '1600';

async function checkLatestMySQL() {
  console.log('Connecting to AWS MySQL...');
  try {
    const connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('[+] Connected successfully.');

    // 1. Get latest logs from tenter for today (2026-05-22)
    const todayStr = '20260522';
    console.log(`\nQuerying tenter logs for date: ${todayStr}`);

    const [rows] = await connection.query(`
      SELECT 
        E_IDNO,
        E_CARD,
        E_DATE,
        E_TIME,
        G_ID
      FROM tenter
      WHERE E_DATE = ?
      ORDER BY E_TIME DESC
      LIMIT 20
    `, [todayStr]);

    console.log(`Found ${rows.length} logs for today.`);
    if (rows.length > 0) {
      console.log('Latest 20 logs today in tenter:');
      rows.forEach(r => {
        const timeFormatted = `${r.E_TIME.substring(0,2)}:${r.E_TIME.substring(2,4)}:${r.E_TIME.substring(4,6)}`;
        console.log(`- ID: ${r.E_IDNO}, Card: ${r.E_CARD}, Time: ${timeFormatted}, Gate: ${r.G_ID}`);
      });
    }

    // 2. Also check if there is any company 1600 employees active today
    const [companyRows] = await connection.query(`
      SELECT 
        e.I_EMPLOY_NO AS empNo,
        e.N_EMPLOY_NAME AS name,
        d.N_DEPT AS dept,
        t.E_TIME AS time,
        t.G_ID AS gateCode
      FROM tenter t
      INNER JOIN hr_employee e ON
        e.I_COMPANY = ?
        AND t.E_IDNO IS NOT NULL
        AND t.E_IDNO <> ''
        AND e.I_COMPANY = LEFT(t.E_IDNO, 4)
        AND e.I_EMPLOY_NO = RIGHT(t.E_IDNO, 8)
      INNER JOIN hr_department d ON
        d.I_COMPANY = ?
        AND d.I_DEPT = e.I_DEPT
      WHERE t.E_DATE = ?
      ORDER BY t.E_TIME DESC
      LIMIT 20
    `, [MY_COMPANY_CODE, MY_COMPANY_CODE, todayStr]);

    console.log(`\nLatest 20 logs for Company ${MY_COMPANY_CODE} today:`);
    companyRows.forEach(r => {
      console.log(`- ${r.dept} / ${r.name} (${r.empNo}) at ${r.time} at Gate ${r.gateCode}`);
    });

    await connection.end();
  } catch (err) {
    console.error('[-] Error querying MySQL:', err);
  }
}

checkLatestMySQL();
