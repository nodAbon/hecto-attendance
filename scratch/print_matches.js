const fs = require('fs');
const glob = require('fs').readdirSync('scratch');

glob.forEach(file => {
  if (file.startsWith('recovered_route_line_') && file.endsWith('.txt')) {
    const content = fs.readFileSync('scratch/' + file, 'utf8');
    console.log(`\n\n==================== ${file} ====================`);
    // Find where isCheckoutCandidate is assigned
    // We can do a simple regex search or search for substrings
    const matches = content.match(/.{0,100}isCheckoutCandidate.{0,200}/g);
    if (matches) {
      matches.forEach(m => console.log(m));
    }
  }
});
