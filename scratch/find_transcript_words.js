const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\f9ab24ee-ade8-435e-9897-7bf90ff32aa5\\.system_generated\\logs\\transcript_full.jsonl';

async function extract() {
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
      if (str.includes('getCheckoutThreshold')) {
        console.log(`Line ${lineNum}: step_index=${obj.step_index}, type=${obj.type}`);
        // Let's write the line content
        fs.writeFileSync(`scratch/word_match_${lineNum}.json`, JSON.stringify(obj, null, 2));
      }
    } catch (e) {}
  }
}

extract();
