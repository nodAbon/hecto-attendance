import fs from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scratch/clean_mojibake_comments.mjs <file>');
  process.exit(1);
}

let text = await fs.readFile(file, 'utf8');

// Remove the large broken TAB comment blocks that were left in the page component.
text = text.replace(/\{\/\*[\s\S]*?TAB\s+[1-9B]:[\s\S]*?\*\/\}/g, '');

// Remove line comments that still contain mojibake fragments.
text = text
  .split('\n')
  .filter((line) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('//')) return true;
    if (/[?먥븧붽ㅼㅼㅷㅸㅺㅻㅼㅽㅾㅿ湲곕媛珥뱀뷀쓬쑥쏀]/.test(line)) return false;
    return true;
  })
  .join('\n');

await fs.writeFile(file, text, 'utf8');
console.log(`cleaned: ${file}`);
