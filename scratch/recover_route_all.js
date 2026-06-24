const fs = require('fs');
const readline = require('readline');
const path = require('path');

const brainDir = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain';

async function searchFile(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(filePath);
    for (const file of files) {
      await searchFile(path.join(filePath, file));
    }
  } else if (filePath.endsWith('transcript.jsonl') || filePath.endsWith('transcript_full.jsonl')) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let stepCount = 0;
    for await (const line of rl) {
      stepCount++;
      if (line.includes('api/attendance/route.js') || line.includes('api\\\\attendance\\\\route.js')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.tool_calls) {
            for (const tc of parsed.tool_calls) {
              if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
                console.log(`\n=========================================`);
                console.log(`Found in: ${filePath} at Step ${stepCount}`);
                console.log(`Tool: ${tc.name}`);
                console.log(`Arguments: ${JSON.stringify(tc.args, null, 2)}`);
              }
            }
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }
}

searchFile(brainDir).then(() => console.log('Search finished.'));
