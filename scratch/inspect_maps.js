const fs = require('fs');
const path = require('path');

const mapFiles = ['src_0tq.a0v._.js.map', 'src_0pbpnku._.js.map'];

mapFiles.forEach(file => {
  const mapPath = path.join(__dirname, '../.next/dev/server/chunks/ssr/', file);
  if (!fs.existsSync(mapPath)) {
    console.log(file + " does not exist.");
    return;
  }
  const mapContent = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const sources = mapContent.sources || [];
  const contents = mapContent.sourcesContent || [];

  for (let i = 0; i < sources.length; i++) {
    if (sources[i].includes('src/app/page.js')) {
      console.log(`--- FOUND page.js in ${file} ---`);
      console.log(`Source name: ${sources[i]}`);
      console.log(`Content length: ${contents[i].length} characters`);
      console.log(`Snippet:\n${contents[i].substring(0, 500)}`);
      console.log(`---------------------------------\n`);
    }
  }
});
