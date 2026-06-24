const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logFile = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\a4747729-107a-491a-8de2-d78f7f59f56e\\.system_generated\\logs\\transcript.jsonl';

async function recover() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepCount = 0;
  for await (const line of rl) {
    stepCount++;
    if (line.includes('api/attendance/route.js') || line.includes('api\\\\attendance\\\\route.js')) {
      console.log(`--- Step ${stepCount} matches ---`);
      try {
        const parsed = JSON.parse(line);
        console.log(`Type: ${parsed.type}, Status: ${parsed.status}`);
        if (parsed.tool_calls) {
          for (const tc of parsed.tool_calls) {
            if (tc.name.includes('write') || tc.name.includes('replace') || tc.name.includes('file')) {
              console.log(`Tool: ${tc.name}`);
              console.log(`Args: ${JSON.stringify(tc.args).substring(0, 500)}...`);
            }
          }
        }
      } catch (e) {
        console.log(`Error parsing JSON: ${e.message}`);
      }
    }
  }
}

recover();
