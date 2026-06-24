const fs = require('fs');

const path = 'src/components/tabs/ScheduleTab.js';
let text = fs.readFileSync(path, 'utf8');

text = text.replace(/^\s*<\/div>\r?\n\s*<\/div>\r?\n\s*\{showSchedule \? \(/m, '                    </div>\n                  {showSchedule ? (');

fs.writeFileSync(path, text, 'utf8');

