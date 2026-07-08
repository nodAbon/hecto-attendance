import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\WorkManager.DB';

try {
  // If old file exists, delete it first to ensure we write a clean SQLite file
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('[+] Removed old database file.');
  }

  const db = new Database(dbPath);
  console.log('[+] Created new SQLite database.');

  // Create the eventlog table matching the codebase expectations
  db.exec(`
    CREATE TABLE eventlog (
      atime TEXT,
      sabun TEXT,
      cardno TEXT,
      eqcode TEXT,
      flag1 TEXT
    )
  `);
  console.log('[+] Created "eventlog" table with required columns.');

  // Insert one dummy row just in case
  const insert = db.prepare('INSERT INTO eventlog (atime, sabun, cardno, eqcode, flag1) VALUES (?, ?, ?, ?, ?)');
  insert.run('20260626090000', '20240052', '12345', '0001', '1');
  console.log('[+] Inserted dummy record.');

  db.close();
  console.log('[+] Dummy DB setup completed.');
} catch (err) {
  console.error('Error creating dummy DB:', err);
}
