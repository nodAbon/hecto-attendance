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
      const toolCalls = obj.tool_calls || [];
      for (const tc of toolCalls) {
        if (tc.args && tc.args.TargetFile && tc.args.TargetFile.includes('route.js')) {
          console.log(`Line ${lineNum}: tool=${tc.name}, file=${tc.args.TargetFile}`);
          if (tc.name === 'write_to_file' && tc.args.CodeContent) {
            console.log(`  Writing full content to scratch/edit_line_${lineNum}_write.js`);
            fs.writeFileSync(`scratch/edit_line_${lineNum}_write.js`, tc.args.CodeContent);
          }
          if (tc.name === 'replace_file_content') {
            console.log(`  Writing replace replacement to scratch/edit_line_${lineNum}_replace.js`);
            fs.writeFileSync(`scratch/edit_line_${lineNum}_replace.js`, JSON.stringify(tc.args, null, 2));
          }
          if (tc.name === 'multi_replace_file_content') {
            console.log(`  Writing multi replace chunks to scratch/edit_line_${lineNum}_multi.js`);
            fs.writeFileSync(`scratch/edit_line_${lineNum}_multi.js`, JSON.stringify(tc.args, null, 2));
          }
        }
      }
    } catch (e) {}
  }
}

extract();
