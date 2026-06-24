import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] || process.cwd();
const includeExt = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.md', '.json', '.sql', '.mjs', '.toml', '.yml', '.yaml', '.txt']);
const includeNames = new Set(['.gitignore', '.editorconfig', '.gitattributes', 'vercel.json']);
const skipDirs = new Set(['node_modules', '.next', '.git']);

let scanned = 0;
let touched = 0;

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      await walk(full);
      continue;
    }

    scanned += 1;
    const ext = path.extname(entry.name).toLowerCase();
    const include = includeExt.has(ext) || includeNames.has(entry.name);
    if (!include) continue;

    const text = await fs.readFile(full, 'utf8');
    await fs.writeFile(full, text, 'utf8');
    touched += 1;
  }
}

await walk(root);
console.log(JSON.stringify({ root, scanned, touched }, null, 2));
