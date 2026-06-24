const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../.next/dev/server/chunks/ssr');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.map'));

let restored = false;

// Sort files descending by LastWriteTime to check the most recent ones first
const filesWithStats = files.map(file => {
  const filePath = path.join(dir, file);
  const stats = fs.statSync(filePath);
  return { file, mtime: stats.mtime };
}).sort((a, b) => b.mtime - a.mtime);

for (const entry of filesWithStats) {
  const { file } = entry;
  // Skip map file we built after restore (today at 4:18 PM is my build)
  if (entry.mtime > new Date("2026-05-29T16:10:00+09:00")) {
    console.log(`Skipping recent map file from our own build: ${file} (mtime: ${entry.mtime})`);
    continue;
  }

  const mapPath = path.join(dir, file);
  try {
    const mapContent = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (mapContent.sections) {
      for (const section of mapContent.sections) {
        const subMap = section.map;
        if (subMap && subMap.sources) {
          for (let i = 0; i < subMap.sources.length; i++) {
            const src = subMap.sources[i];
            if (src.includes('src/app/page.js')) {
              console.log(`FOUND src/app/page.js inside section of ${file} (modified at ${entry.mtime})`);
              const restoredCode = subMap.sourcesContent[i];
              if (restoredCode) {
                const targetPath = path.join(__dirname, '../src/app/page.js');
                fs.writeFileSync(targetPath, restoredCode, 'utf8');
                console.log(`Successfully restored src/app/page.js from sectioned map ${file}!`);
                restored = true;
                break;
              }
            }
          }
        }
        if (restored) break;
      }
    }
    if (restored) break;
  } catch (e) {
    console.error(`Error parsing ${file}:`, e);
  }
}

if (!restored) {
  console.log("Could not find any page.js in older sectioned maps.");
}
