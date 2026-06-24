const fs = require('fs');
const readline = require('readline');

const transcriptPath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\f9ab24ee-ade8-435e-9897-7bf90ff32aa5\\.system_generated\\logs\\transcript_full.jsonl';

async function extract() {
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const assembled = new Array(800).fill(null);

  let stepNum = 0;
  for await (const line of rl) {
    stepNum++;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'VIEW_FILE' && obj.content && obj.content.includes('Total Lines: 644')) {
        console.log(`Step ${stepNum} is a 644-line view of route.js`);
        const lines = obj.content.split('\n');
        lines.forEach(l => {
          const match = l.match(/^(\d+):\s(.*)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            const code = match[2];
            assembled[num] = code;
          }
        });
      }
    } catch (e) {}
  }

  const output = [];
  for (let i = 1; i < assembled.length; i++) {
    if (assembled[i] !== null) {
      output.push(`${i}: ${assembled[i]}`);
    } else {
      output.push(`${i}: // MISSING`);
    }
  }

  fs.writeFileSync('scratch/assembled_644.txt', output.join('\n'), 'utf8');
  console.log("Written to scratch/assembled_644.txt");
}

extract();
