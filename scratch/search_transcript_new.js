const fs = require('fs');
const readline = require('readline');
const path = require('path');

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
      // Let's check tool_calls or content or response
      const str = JSON.stringify(obj);
      if (str.includes('isCheckoutCandidate') && str.includes('const isCheckedOut')) {
        console.log(`=== Line ${lineNum} ===`);
        // We find the replacementContent or code content
        // Let's inspect where it is in the object
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            if (tc.arguments && JSON.stringify(tc.arguments).includes('isCheckoutCandidate')) {
              console.log("Found in tool call arguments!");
              fs.writeFileSync('scratch/recovered_code.txt', JSON.stringify(tc.arguments, null, 2));
              return;
            }
          }
        }
        if (obj.content && obj.content.includes('isCheckoutCandidate')) {
          console.log("Found in content!");
          fs.writeFileSync('scratch/recovered_content.txt', obj.content);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  console.log("Search complete, not found or couldn't parse.");
}

search();
