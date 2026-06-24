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
  } else if (stat.isFile() && dir.endsWith('.js')) {
    try {
      const content = fs.readFileSync(dir, 'utf8');
      if (content.includes('isCheckoutCandidate') && content.includes('isCheckoutCandidateForLog')) {
        console.log(`Found file: ${dir}`);
        // Let's print around the match
        const idx = content.indexOf('isCheckoutCandidateForLog');
        console.log("Snippet around isCheckoutCandidateForLog:");
        console.log(content.substring(idx - 100, idx + 1500));
        
        const idx2 = content.indexOf('isCheckoutCandidate:');
        if (idx2 !== -1) {
          console.log("Snippet around isCheckoutCandidate:");
          console.log(content.substring(idx2 - 100, idx2 + 1000));
        }
      }
    } catch (e) {}
  }
}

searchNext(nextDir);
