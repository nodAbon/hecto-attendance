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

async function main() {
  let conn;
  try {
    console.log('Connecting to MySQL host:', MYSQL_CONFIG.host);
    conn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('Connected successfully!');

    // 1. Check all tables containing yuncha, dili, leave, vacation, or code
    const [tables] = await conn.execute(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?
    `, [process.env.MYSQL_DATABASE]);

    console.log('--- ALL TABLES IN DB ---');
    const tableNames = tables.map(t => t.TABLE_NAME || t.table_name);
    console.log(tableNames.join(', '));

    // 2. Search tables with 'yuncha', 'dili', 'holiday', 'leave', 'vacation', 'comp', 'sub'
    const hrTables = tableNames.filter(name => /hr_|yuncha|dili|vacation|leave|holiday|subst|comp/i.test(name));
    console.log('\n--- HR / LEAVE RELATED TABLES ---');
    console.log(hrTables);

    // 3. Check diligence codes if hr_diligence_code or similar table exists
    for (const tableName of tableNames) {
      if (/code|dili/i.test(tableName)) {
        try {
          const [cols] = await conn.execute(`DESCRIBE \`${tableName}\``);
          console.log(`\nSchema of ${tableName}:`, cols.map(c => c.Field).join(', '));
          const [rows] = await conn.execute(`SELECT * FROM \`${tableName}\` LIMIT 20`);
          console.log(`Sample rows from ${tableName}:`, rows);
        } catch (e) {
          console.log(`Error reading ${tableName}:`, e.message);
        }
      }
    }

    // 4. Check hr_yuncha_use unique I_CODEs and descriptions
    if (tableNames.includes('hr_yuncha_use')) {
      const [codes] = await conn.execute(`
        SELECT DISTINCT I_CODE, COUNT(*) as cnt 
        FROM hr_yuncha_use 
        GROUP BY I_CODE
      `);
      console.log('\n--- hr_yuncha_use UNIQUE I_CODEs ---');
      console.log(codes);
    }

  } catch (err) {
    console.error('MySQL Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

main();
