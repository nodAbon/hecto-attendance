const fs = require('fs');

const files = [
  'edit_line_427_replace.js',
  'edit_line_433_replace.js'
];

files.forEach(file => {
  const path = 'scratch/' + file;
  if (!fs.existsSync(path)) return;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  console.log(`\n\n==================== ${file} ====================`);
  console.log(`StartLine: ${data.StartLine}, EndLine: ${data.EndLine}`);
  console.log("--- TARGET CONTENT ---");
  console.log(data.TargetContent);
  console.log("--- REPLACEMENT CONTENT ---");
  console.log(data.ReplacementContent);
});
