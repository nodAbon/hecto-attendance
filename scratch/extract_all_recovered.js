const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\f9ab24ee-ade8-435e-9897-7bf90ff32aa5\\.system_generated\\logs\\transcript_full.jsonl';

async function extract() {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepNum = 0;
  for await (const line of rl) {
    stepNum++;
    if (stepNum >= 370 && stepNum <= 395) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('route.js')) {
          console.log(`Step ${stepNum} is a VIEW_FILE of route.js:`);
          console.log(obj.content.split('\n').slice(0, 10).join('\n'));
          fs.writeFileSync(`scratch/v644_step_${stepNum}.txt`, obj.content);
        }
      } catch (e) {}
    }
  }
}

extract();
