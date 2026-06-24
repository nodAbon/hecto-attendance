const fs = require('fs');
const readline = require('readline');
const path = require('path');

const brainDir = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain';

async function recover() {
  async function walk(dir) {
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        await walk(path.join(dir, file));
      }
    } else if (dir.endsWith('transcript_full.jsonl')) { // SEARCH ONLY IN FULL LOGS!
      const fileStream = fs.createReadStream(dir);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let stepCount = 0;
      for await (const line of rl) {
        stepCount++;
        if (line.includes('api/attendance/route.js') || line.includes('api\\\\attendance\\\\route.js') || line.includes('api\\\\\\\\attendance\\\\\\\\route.js')) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.tool_calls) {
              for (const tc of parsed.tool_calls) {
                const isTargetRoute = tc.args?.TargetFile && (
                  tc.args.TargetFile.includes('api/attendance/route.js') ||
                  tc.args.TargetFile.includes('api\\attendance\\route.js') ||
                  tc.args.TargetFile.includes('api\\\\attendance\\\\route.js')
                );
                if (isTargetRoute) {
                  console.log(`\n=========================================`);
                  console.log(`File: ${dir}`);
                  console.log(`Step: ${stepCount}`);
                  console.log(`Tool: ${tc.name}`);
                  if (tc.args.ReplacementContent) {
                    console.log(`Length of ReplacementContent: ${tc.args.ReplacementContent.length}`);
                    // Save replacement content
                    fs.writeFileSync(`C:\\Users\\Owner\\Documents\\antigravity\\agitated-raman\\scratch\\full_chunk_${stepCount}.js`, tc.args.ReplacementContent, 'utf8');
                  }
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
}

recover().then(() => console.log('Finished walk.'));
