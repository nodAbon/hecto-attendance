const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Insert the missing closing div directly before the schedule block.
lines.splice(404, 0, '                    </div>');

fs.writeFileSync(path, lines.join('\n'), 'utf8');

