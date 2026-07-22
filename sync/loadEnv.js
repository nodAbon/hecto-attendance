const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let currentKey = null;
  let currentValueLines = [];
  let inMultiLine = false;

  for (const line of lines) {
    if (inMultiLine) {
      const trimmed = line.trim();
      if (trimmed.endsWith('"') || trimmed.endsWith("'")) {
        currentValueLines.push(trimmed.slice(0, -1));
        if (process.env[currentKey] === undefined) {
          process.env[currentKey] = currentValueLines.join('\n');
        }
        inMultiLine = false;
        currentKey = null;
        currentValueLines = [];
      } else {
        currentValueLines.push(line);
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && !value.endsWith('"')) || (value.startsWith("'") && !value.endsWith("'"))) {
      inMultiLine = true;
      currentKey = key;
      currentValueLines = [value.slice(1)];
    } else {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  return true;
}

function loadSyncEnv() {
  const cwd = process.cwd();
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '.env.local'),
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '..', '.env'),
    path.join(cwd, '..', '.env.local'),
  ];

  for (const filePath of candidates) {
    parseEnvFile(filePath);
  }
}

module.exports = { loadSyncEnv };
