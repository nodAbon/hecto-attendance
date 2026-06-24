const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove the extra closing div inserted before the schedule block.
if (lines[404]?.trim() === '</div>' && lines[405]?.trim() === '{showSchedule ? (') {
  lines.splice(404, 1);
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');

