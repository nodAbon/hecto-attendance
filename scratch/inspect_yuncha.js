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
const TODAY_STR = '20260526';

async function run() {
  console.log('Connecting to AWS MySQL...');
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    console.log('Connected!');

    // 1. Describe table hr_yuncha_use
    console.log('\n--- Describe hr_yuncha_use ---');
    const [columns] = await conn.execute('DESCRIBE hr_yuncha_use');
    console.table(columns.map(c => ({ Field: c.Field, Type: c.Type })));

    // 2. Query approved leaves for company 1600 on 2026-05-26
    console.log(`\n--- Approved Leaves for Company ${MY_COMPANY_CODE} overlapping with ${TODAY_STR} ---`);
    const [leaves] = await conn.execute(`
      SELECT 
        y.I_EMPLOY_NO,
        e.N_EMPLOY_NAME,
        d.N_DEPT,
        y.D_START_DATE,
        y.D_END_DATE,
        y.I_CODE,
        c.N_NAME as LEAVE_NAME,
        y.O_ANNLEV_CNT,
        y.I_STATUS
      FROM hr_yuncha_use y
      INNER JOIN hr_employee e ON e.I_COMPANY = y.I_COMPANY AND e.I_EMPLOY_NO = y.I_EMPLOY_NO
      INNER JOIN hr_department d ON d.I_COMPANY = e.I_COMPANY AND d.I_DEPT = e.I_DEPT
      LEFT JOIN hr_diligence_code c ON c.I_CODE = y.I_CODE
      WHERE y.I_COMPANY = ?
        AND y.I_STATUS = '40'
        AND ? BETWEEN y.D_START_DATE AND y.D_END_DATE
    `, [MY_COMPANY_CODE, TODAY_STR]);

    console.log(`Found ${leaves.length} approved leaves for today:`);
    console.log(JSON.stringify(leaves, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await conn.end();
  }
}

run();
