const fs = require('fs');
const glob = require('fs').readdirSync('scratch');

glob.forEach(file => {
  if (file.startsWith('step_') && file.endsWith('_view.txt')) {
    const content = fs.readFileSync('scratch/' + file, 'utf8');
    const firstLine = content.split('\n')[0] || '';
    const rangeLine = content.split('\n').find(l => l.startsWith('Showing lines')) || '';
    console.log(`${file}: ${firstLine} | ${rangeLine}`);
  }
});
