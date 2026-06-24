const fs = require('fs');

const filepath = 'C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\.next\\dev\\server\\chunks\\[root-of-the-server]__0~lyj_p._.js';
if (fs.existsSync(filepath)) {
  const content = fs.readFileSync(filepath, 'utf8');
  const idx = content.indexOf('nightCheckinGraceHours');
  if (idx !== -1) {
    console.log("Found nightCheckinGraceHours:");
    console.log(content.substring(idx - 100, idx + 1000));
  } else {
    console.log("nightCheckinGraceHours not found.");
  }
}
