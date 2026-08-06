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

async function listAllTables() {
  let conn;
  try {
    conn = await mysql.createConnection(MYSQL_CONFIG);
    const [tables] = await conn.execute(`
      SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [MYSQL_CONFIG.database]);

    console.log('=== ALL 5 TABLES IN MYSQL DATABASE ===');
    console.table(tables.map(t => ({
      name: t.TABLE_NAME || t.table_name,
      comment: t.TABLE_COMMENT || t.table_comment || '',
      rows: t.TABLE_ROWS || t.table_rows || 0,
    })));

    for (const t of tables) {
      const name = t.TABLE_NAME || t.table_name;
      console.log(`\n--- [Table: ${name}] Columns ---`);
      const [cols] = await conn.execute(`DESCRIBE \`${name}\``);
      console.log(cols.map(c => c.Field).join(', '));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

listAllTables();
