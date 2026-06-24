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
    try {
      const obj = JSON.parse(line);
      const toolCalls = obj.tool_calls || [];
      
      for (const tc of toolCalls) {
        const argsStr = JSON.stringify(tc.arguments || {});
        if (argsStr.includes('route.js')) {
          console.log(`Step ${stepNum}: Tool ${tc.name}`);
          fs.writeFileSync(`scratch/step_${stepNum}_tc_${tc.name}.txt`, JSON.stringify(tc, null, 2));
        }
      }
    } catch (e) {}
  }
}

extract();
