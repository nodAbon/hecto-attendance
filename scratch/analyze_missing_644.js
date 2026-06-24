const fs = require('fs');
const content = fs.readFileSync('scratch/assembled_644.txt', 'utf8');
const lines = content.split('\n');

let missingStart = null;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('// MISSING')) {
    if (missingStart === null) {
      missingStart = i + 1;
    }
  } else {
    if (missingStart !== null) {
      console.log(`Missing range: L${missingStart} - L${i}`);
      missingStart = null;
    }
  }
}
if (missingStart !== null) {
  console.log(`Missing range: L${missingStart} - L${lines.length}`);
}
