const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\a4747729-107a-491a-8de2-d78f7f59f56e\\.system_generated\\logs\\transcript.jsonl';

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
      if (str.includes('isCheckoutCandidate') || str.includes('lastCheckoutLog')) {
        console.log(`Line ${lineNum}: step_index=${obj.step_index}, type=${obj.type}`);
        fs.writeFileSync(`scratch/prev_match_line_${lineNum}.json`, JSON.stringify(obj, null, 2));
      }
    } catch (e) {}
  }
}

extract();
