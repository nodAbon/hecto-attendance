const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\scratch\\chunk_3167.js', 'utf8');

// The content is a JSON string containing \n. We can parse it if it is JSON, or do a replacement.
let parsed = content;
if (content.startsWith('"') && content.endsWith('"')) {
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parsed = eval(content); // Fallback
  }
}

fs.writeFileSync('C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\scratch\\formatted_chunk_3167.js', parsed, 'utf8');
console.log('Saved formatted chunk.');
