const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\f9ab24ee-ade8-435e-9897-7bf90ff32aa5\\.system_generated\\logs\\transcript_full.jsonl';

async function search() {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    try {
      const obj = JSON.parse(line);
      const str = JSON.stringify(obj);
      if (str.includes('isCheckoutCandidate') && (str.includes(' = ') || str.includes(':'))) {
        // Find if we have lines setting it like "isCheckoutCandidate = " or "isCheckoutCandidate:"
        if (str.includes('isCheckoutCandidate =') || str.includes('"isCheckoutCandidate":')) {
          console.log(`=== Line ${lineNum} ===`);
          const matches = str.match(/.{0,100}isCheckoutCandidate.{0,200}/g);
          if (matches) {
            matches.forEach(m => console.log("   " + m));
          }
        }
      }
    } catch (e) {}
  }
}

search();
