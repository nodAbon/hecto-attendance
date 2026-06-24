const fs = require('fs');
const readline = require('readline');
const path = require('path');

const brainDir = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain';

async function recover() {
  let latestFileContent = null;
  let latestFilePath = '';
  let latestStep = 0;

  async function walk(dir) {
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        await walk(path.join(dir, file));
      }
    } else if (dir.endsWith('transcript.jsonl') || dir.endsWith('transcript_full.jsonl')) {
      const fileStream = fs.createReadStream(dir);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let stepCount = 0;
      for await (const line of rl) {
        stepCount++;
        if (line.includes('api/attendance/route.js') || line.includes('api\\\\\\\\attendance\\\\\\\\route.js')) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.tool_calls) {
              for (const tc of parsed.tool_calls) {
                // Look for tool calls that outputted/wrote the code
                if (tc.name === 'write_to_file' && tc.args?.TargetFile?.includes('api/attendance/route.js')) {
                  latestFileContent = tc.args.CodeContent;
                  latestFilePath = dir;
                  latestStep = stepCount;
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }

  await walk(brainDir);

  if (latestFileContent) {
    console.log(`Found route.js contents in ${latestFilePath} at step ${latestStep}`);
    fs.writeFileSync('C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\scratch\\recovered_attendance_route.js', latestFileContent, 'utf8');
    console.log('Saved to scratch/recovered_attendance_route.js');
  } else {
    console.log('No direct write_to_file call found for route.js in the logs.');
  }
}

recover();
