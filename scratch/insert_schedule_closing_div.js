const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const target = '                  {showSchedule ? (';
const idx = lines.findIndex((line) => line.trim() === '{showSchedule ? (');

if (idx !== -1 && lines[idx - 1]?.trim() !== '</div>') {
  lines.splice(idx, 0, '                    </div>');
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');

