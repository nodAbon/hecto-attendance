const fs = require('fs');

const path = 'src/lib/attendanceWorkTime.js';
let text = fs.readFileSync(path, 'utf8');
text = text.replace(
  /export const formatOvertimeMinutes = \(minutes = 0\) => \{[\s\S]*?\n\};/,
  `export const formatOvertimeMinutes = (minutes = 0) => {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  if (safe <= 0) return '';
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return \`OT \${hours}h \${String(mins).padStart(2, '0')}m\`;
};`
);
fs.writeFileSync(path, text);
