const fs = require('fs');

const filepath = 'C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\.next\\dev\\server\\chunks\\[root-of-the-server]__0~lyj_p._.js';
if (fs.existsSync(filepath)) {
  const content = fs.readFileSync(filepath, 'utf8');
  // Find where GET function starts
  const startIdx = content.indexOf('async function GET(');
  if (startIdx !== -1) {
    console.log("Found GET function start at index:", startIdx);
    const getCode = content.substring(startIdx, startIdx + 45000);
    fs.writeFileSync('scratch/extracted_api_get.js', getCode);
    console.log("Saved to scratch/extracted_api_get.js");
  } else {
    console.log("GET function not found.");
  }
} else {
  console.log("Bundle file does not exist.");
}
