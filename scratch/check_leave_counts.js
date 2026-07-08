const { loadSyncEnv } = require('../sync/loadEnv');
const mysql = require('mysql2/promise');

loadSyncEnv();

const MYSQL_CONFIG = {
  host:           process.env.MYSQL_HOST,
  user:           process.env.MYSQL_USER,
  password:       process.env.MYSQL_PASSWORD,
  database:       process.env.MYSQL_DATABASE,
  port:           parseInt(process.env.MYSQL_PORT) || 3306,
  connectTimeout: 15_000,
};

const MY_COMPANY_CODE = process.env.MY_COMPANY_CODE || '1600';

async function main() {
  const conn = await mysql.createConnection(MYSQL_CONFIG);
  try {
    const now = new Date('2026-07-02T16:20:48+09:00'); // Use metadata local time for consistency
    
    // 1. Original: -10 days ~ end of next month
    const fromDateOriginal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10);
    const toMonthOriginal   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fromStrOriginal   = `${fromDateOriginal.getFullYear()}${String(fromDateOriginal.getMonth() + 1).padStart(2, '0')}${String(fromDateOriginal.getDate()).padStart(2, '0')}`;
    const toStrOriginal     = `${toMonthOriginal.getFullYear()}${String(toMonthOriginal.getMonth() + 1).padStart(2, '0')}${String(toMonthOriginal.getDate()).padStart(2, '0')}`;

    // 2. Current: -7 days ~ +3 months
    const fromDateCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const toDateCurrent   = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
    const fromStrCurrent   = `${fromDateCurrent.getFullYear()}${String(fromDateCurrent.getMonth() + 1).padStart(2, '0')}${String(fromDateCurrent.getDate()).padStart(2, '0')}`;
    const toStrCurrent     = `${toDateCurrent.getFullYear()}${String(toDateCurrent.getMonth() + 1).padStart(2, '0')}${String(toDateCurrent.getDate()).padStart(2, '0')}`;

    console.log(`Original range: ${fromStrOriginal} ~ ${toStrOriginal}`);
    console.log(`Current range: ${fromStrCurrent} ~ ${toStrCurrent}`);

    const [rowsOriginal] = await conn.execute(`
      SELECT count(*) as cnt FROM hr_yuncha_use y
      WHERE y.I_COMPANY = ? AND y.I_STATUS = '40' AND y.D_END_DATE >= ? AND y.D_START_DATE <= ?
    `, [MY_COMPANY_CODE, fromStrOriginal, toStrOriginal]);

    const [rowsCurrent] = await conn.execute(`
      SELECT count(*) as cnt FROM hr_yuncha_use y
      WHERE y.I_COMPANY = ? AND y.I_STATUS = '40' AND y.D_END_DATE >= ? AND y.D_START_DATE <= ?
    `, [MY_COMPANY_CODE, fromStrCurrent, toStrCurrent]);

    const [rowsLost] = await conn.execute(`
      SELECT count(*) as cnt FROM hr_yuncha_use y
      WHERE y.I_COMPANY = ? AND y.I_STATUS = '40' 
        AND y.D_END_DATE >= ? AND y.D_END_DATE < ?
    `, [MY_COMPANY_CODE, fromStrOriginal, fromStrCurrent]);

    const [rowsFuture] = await conn.execute(`
      SELECT count(*) as cnt FROM hr_yuncha_use y
      WHERE y.I_COMPANY = ? AND y.I_STATUS = '40' 
        AND y.D_START_DATE > ? AND y.D_START_DATE <= ?
    `, [MY_COMPANY_CODE, toStrOriginal, toStrCurrent]);

    console.log('Original count:', rowsOriginal[0].cnt);
    console.log('Current count:', rowsCurrent[0].cnt);
    console.log('Lost past leaves (June 22 ~ June 24):', rowsLost[0].cnt);
    console.log('New future leaves (Aug 1 ~ Oct 2):', rowsFuture[0].cnt);

  } catch (err) {
    console.error(err);
  } finally {
    await conn.end();
  }
}

main();
