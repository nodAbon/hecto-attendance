const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\a4747729-107a-491a-8de2-d78f7f59f56e\\.system_generated\\logs\\transcript_full.jsonl';

async function extract() {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepNum = 0;
  for await (const line of rl) {
    stepNum++;
    if (stepNum === 79) {
      const obj = JSON.parse(line);
      fs.writeFileSync('scratch/prev_step_79_full.txt', obj.content || '');
      console.log("Written step 79 full content to scratch/prev_step_79_full.txt");
      return;
    }
  }
}

extract();
