const fs = require('fs');

const path = 'src/components/tabs/MonthlyTab.js';
let text = fs.readFileSync(path, 'utf8');
text = text
  .split('\n')
  .map((line) => (line.trimStart().startsWith('const adjustmentDateText =')
    ? "                    const adjustmentDateText = '';"
    : line))
  .join('\n');
fs.writeFileSync(path, text);
