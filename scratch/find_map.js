const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../.next/dev/server/chunks/ssr');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.map'));

let found = false;
files.forEach(file => {
  const mapPath = path.join(dir, file);
  try {
    const mapContent = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const sources = mapContent.sources || [];
    sources.forEach((source, idx) => {
      if (source.includes('page.js') && !source.includes('node_modules')) {
        console.log(`Match in ${file}: source=${source}, index=${idx}`);
        found = true;
      }
    });
  } catch (e) {
    // ignore parsing errors
  }
});

if (!found) {
  console.log("No page.js found in any dev ssr maps.");
}
