import Database from 'better-sqlite3';
import path from 'path';

const dbPath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\WorkManager.DB';

try {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
  
  console.log('--- TABLES & SCHEMAS ---');
  tables.forEach(t => {
    console.log(`Table: ${t.name}`);
    console.log(t.sql);
    console.log('------------------------');
  });
  
  db.close();
} catch (err) {
  console.error('Error reading DB schema:', err);
}
