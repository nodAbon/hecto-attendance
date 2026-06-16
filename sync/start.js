/**
 * 두 프로세스 동시 실행 런처 (PM2 대체)
 * node start.js
 */
const { spawn } = require('child_process');
const path = require('path');

function launch(script) {
  const name = path.basename(script, '.js');
  const proc = spawn(process.execPath, [script], {
    cwd: __dirname,
    stdio: 'inherit',
  });
  proc.on('exit', (code) => {
    console.log(`[${name}] 종료 (code=${code}), 10초 후 재시작...`);
    setTimeout(() => launch(script), 10_000);
  });
}

launch(path.join(__dirname, 'attendance.js'));
launch(path.join(__dirname, 'leaves.js'));
