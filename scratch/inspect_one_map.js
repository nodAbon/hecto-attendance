const fs = require('fs');
const path = require('path');
const file = 'src_0tq.a0v._.js.map';
const mapPath = path.join(__dirname, '../.next/dev/server/chunks/ssr/', file);
if (!fs.existsSync(mapPath)) {
  console.log("File not found: " + mapPath);
  process.exit(1);
}
const content = fs.readFileSync(mapPath, 'utf8');
console.log("Keys:", Object.keys(JSON.parse(content)));
console.log("Snippet:", content.substring(0, 1000));
