const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
let seen = false;
const next = [];

for (const line of lines) {
  if (line.trim() === ') : null}' && seen) {
    continue;
  }
  if (line.trim() === ') : null}') {
    seen = true;
  }
  next.push(line);
}

fs.writeFileSync(path, next.join('\n'), 'utf8');

