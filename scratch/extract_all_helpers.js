const fs = require('fs');

const filepath = 'C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\.next\\dev\\server\\chunks\\[root-of-the-server]__0~lyj_p._.js';
if (fs.existsSync(filepath)) {
  const content = fs.readFileSync(filepath, 'utf8');
  
  const helpers = [
    'toMinutes',
    'normalizeTime',
    'inferScheduleEnd',
    'getSchedulePairForDate',
    'shiftDate',
    'isOvernightSchedule',
    'isLogWithinWindow',
    'getWorkOrder',
    'getCheckoutThreshold',
    'isAfternoonHalfLeave'
  ];
  
  helpers.forEach(name => {
    const idx = content.indexOf(name);
    if (idx !== -1) {
      console.log(`\n\n=== Match for ${name} ===`);
      console.log(content.substring(idx - 100, idx + 1000));
    }
  });
}
