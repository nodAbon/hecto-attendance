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
      
      // Look for write_to_file, replace_file_content, view_file
      for (const tc of toolCalls) {
        if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'view_file') {
          const args = tc.arguments || {};
          const target = args.TargetFile || args.AbsolutePath;
          if (target && target.includes('route.js')) {
            console.log(`Step ${stepNum}: Tool ${tc.name} target=${target}`);
            // Let's print details
            if (tc.name === 'replace_file_content') {
              console.log(`   StartLine: ${args.StartLine}, EndLine: ${args.EndLine}`);
              console.log(`   TargetContent: ${args.TargetContent.substring(0, 100)}...`);
              console.log(`   ReplacementContent: ${args.ReplacementContent.substring(0, 200)}...`);
              fs.writeFileSync(`scratch/step_${stepNum}_replace.txt`, JSON.stringify(args, null, 2));
            } else if (tc.name === 'write_to_file') {
              console.log(`   Overwrite: ${args.Overwrite}`);
              fs.writeFileSync(`scratch/step_${stepNum}_write.txt`, args.CodeContent);
            }
          }
        }
      }

      // Also check output/response of system for view_file
      if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('route.js')) {
        console.log(`Step ${stepNum}: VIEW_FILE response`);
        fs.writeFileSync(`scratch/step_${stepNum}_view.txt`, obj.content);
      }
    } catch (e) {}
  }
}

extract();
