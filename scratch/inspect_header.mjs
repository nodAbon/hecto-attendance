import fs from 'fs';

const dbPath = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman\\WorkManager.DB';

try {
  const fd = fs.openSync(dbPath, 'r');
  const buffer = Buffer.alloc(100);
  fs.readSync(fd, buffer, 0, 100, 0);
  fs.closeSync(fd);
  
  console.log('Hex Header:', buffer.toString('hex'));
  console.log('ASCII Header:', buffer.toString('ascii'));
} catch (err) {
  console.error('Error reading header:', err);
}
