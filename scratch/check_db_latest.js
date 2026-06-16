const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const settingsPath = path.join(__dirname, '..', 'secom-settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}
console.log('Current Settings:', settings);

const dbFolder = settings.secomDbPath || __dirname;
const workDbPath = path.join(dbFolder, 'WorkManager.DB');

console.log('Target WorkManager.DB path:', workDbPath);
if (!fs.existsSync(workDbPath)) {
  console.log('WorkManager.DB does not exist at target path.');
  process.exit(1);
}

const stats = fs.statSync(workDbPath);
console.log('File stats:');
console.log(`- Size: ${stats.size} bytes`);
console.log(`- Mtime (Modified Time): ${stats.mtime}`);

try {
  const db = new Database(workDbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log('Tables in DB:', tables);

  const logTableName = tables.find(t => ['alarm', 'eventlog', 'commute', 'log', 'workhistory'].includes(t.toLowerCase())) || tables[0];
  console.log('Selected log table:', logTableName);

  if (logTableName) {
    const columns = db.prepare(`PRAGMA table_info(${logTableName})`).all().map(c => c.name);
    console.log('Columns in log table:', columns);

    const colTime = columns.find(c => ['logtime', 'logdate', 'eventtime', 'checktime'].includes(c.toLowerCase())) || columns[0];
    
    // Get latest 5 logs
    const latestLogs = db.prepare(`SELECT * FROM ${logTableName} ORDER BY ${colTime} DESC LIMIT 5`).all();
    console.log('Latest 5 logs in DB:');
    console.log(JSON.stringify(latestLogs, null, 2));
  }
  db.close();
} catch (err) {
  console.error('Error reading DB:', err);
}
