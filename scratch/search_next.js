const fs = require('fs');
const path = require('path');

const nextDir = 'C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\.next';

function searchNext(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      searchNext(path.join(dir, file));
    }
  } else if (stat.isFile() && (dir.endsWith('.js') || dir.endsWith('.json') || dir.endsWith('.html'))) {
    try {
      const content = fs.readFileSync(dir, 'utf8');
      if (content.includes('isCheckoutCandidate') || content.includes('lastCheckoutLog')) {
        console.log(`Found reference in: ${dir}`);
        // If it's a JS file in server/app/api/attendance, let's print its content size or path
        if (dir.includes('attendance') && dir.includes('route')) {
          console.log('--- THIS SEEMS TO BE THE COMPILED ROUTE! ---');
          fs.writeFileSync('C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\scratch\\recovered_compiled_route.js', content, 'utf8');
          console.log('Saved to scratch/recovered_compiled_route.js');
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

searchNext(nextDir);
console.log('Search finished.');
