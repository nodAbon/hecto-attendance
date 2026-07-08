import fs from 'fs';
import path from 'path';

const rootDir = 'c:\\Users\\Owner\\Documents\\Antigravity\\agitated-raman';

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        // Skip node_modules and .next if we just want top-level, but let's count them
        size += getDirSize(fullPath);
      } else if (file.isFile()) {
        const stats = fs.statSync(fullPath);
        size += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors for permission denied or locked files
  }
  return size;
}

const items = fs.readdirSync(rootDir, { withFileTypes: true });
const results = [];

let totalSize = 0;

for (const item of items) {
  const fullPath = path.join(rootDir, item.name);
  if (item.isDirectory()) {
    const size = getDirSize(fullPath);
    results.push({ name: item.name, isDir: true, sizeMB: (size / (1024 * 1024)).toFixed(2) });
    totalSize += size;
  } else if (item.isFile()) {
    const stats = fs.statSync(fullPath);
    results.push({ name: item.name, isDir: false, sizeMB: (stats.size / (1024 * 1024)).toFixed(2) });
    totalSize += stats.size;
  }
}

results.sort((a, b) => parseFloat(b.sizeMB) - parseFloat(a.sizeMB));

console.log('--- Project Directory Size Report ---');
results.forEach(r => {
  console.log(`${r.isDir ? '[DIR]' : '[FILE]'} ${r.name}: ${r.sizeMB} MB`);
});
console.log(`\nTotal Project Size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB (${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
