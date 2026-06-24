const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\a4747729-107a-491a-8de2-d78f7f59f56e\\.system_generated\\logs\\transcript.jsonl';

async function extract() {
  if (!fs.existsSync(transcriptPath)) {
    console.log("File does not exist:", transcriptPath);
    return;
  }
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
          fs.writeFileSync(`scratch/prev_step_${stepNum}_tc_${tc.name}.txt`, JSON.stringify(tc, null, 2));
        }
      }
      if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('route.js')) {
        console.log(`Step ${stepNum}: VIEW_FILE response`);
        fs.writeFileSync(`scratch/prev_step_${stepNum}_view.txt`, obj.content);
      }
    } catch (e) {}
  }
}

extract();
