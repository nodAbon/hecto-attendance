const fs = require('fs');

const assembled = new Array(800).fill(null);

const files = [
  'step_444_view.txt',
  'step_388_view.txt',
  'step_386_view.txt',
  'step_382_view.txt',
  'step_430_view.txt',
  'step_432_view.txt'
];

files.forEach(file => {
  const filepath = 'scratch/' + file;
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  lines.forEach(line => {
    const match = line.match(/^(\d+):\s(.*)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const code = match[2];
      assembled[num] = code;
    }
  });
});

const output = [];
for (let i = 1; i < assembled.length; i++) {
  if (assembled[i] !== null) {
    output.push(assembled[i]);
  } else {
    // If we have a gap, let's output a placeholder
    // but only if we already started seeing code and haven't ended yet
    if (i < 650) {
      output.push(`// MISSING LINE ${i}`);
    }
  }
}

fs.writeFileSync('scratch/reconstructed_route_assembled.js', output.join('\n'), 'utf8');
console.log("Assembled route written to scratch/reconstructed_route_assembled.js");
