const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'WorkManager.DB');

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('[+] Opened WorkManager.DB successfully.');

  // 1. List all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log('Tables:', tables);

  // Find table representing event logs / alarm
  const logTable = tables.find(t => ['alarm', 'eventlog', 'commute', 'log', 'workhistory'].includes(t.toLowerCase())) || tables[0];
  console.log('Target Log Table:', logTable);

  if (logTable) {
    // 2. Describe columns
    const columns = db.prepare(`PRAGMA table_info(${logTable})`).all();
    console.log('\n--- Columns in ' + logTable + ' ---');
    console.table(columns.map(c => ({ Name: c.name, Type: c.type })));

    // 3. Find if there are status/state/type columns and group by them
    const colNames = columns.map(c => c.name.toLowerCase());
    const stateCol = columns.find(c => ['eventtype', 'state', 'status', 'type', 'mode'].includes(c.name.toLowerCase()));
    
    if (stateCol) {
      console.log(`\nFound state-like column: ${stateCol.name}`);
      try {
        const rows = db.prepare(`SELECT ${stateCol.name}, COUNT(*) as count FROM ${logTable} GROUP BY ${stateCol.name}`).all();
        console.log('\n--- Distribution of values in ' + stateCol.name + ' ---');
        console.table(rows);
      } catch (err) {
        console.error('Error grouping by state column:', err.message);
      }
    }

    // 4. Dump a few sample records
    console.log('\n--- Sample Records (latest 10) ---');
    const samples = db.prepare(`SELECT * FROM ${logTable} ORDER BY rowid DESC LIMIT 10`).all();
    console.log(JSON.stringify(samples, null, 2));
  }

  db.close();
} catch (e) {
  console.error('Error:', e);
}
