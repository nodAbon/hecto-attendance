const fs = require('fs');
const path = require('path');

// Default search paths for ADT Caps AccessGuard
const DEFAULT_SEARCH_ROOTS = [
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ADT',
  'C:\\Caps',
  'C:\\AccessGuard',
];

const SCAN_KEYWORDS = [
  'accessguard',
  'access_guard',
  'accessserver',
  'access_server',
  'adt',
  'caps',
];

const INTERESTING_EXTENSIONS = [
  '.ini',
  '.config',
  '.cfg',
  '.xml',
  '.json',
  '.properties',
  '.txt'
];

const DB_KEYWORDS = [
  'server',
  'database',
  'data source',
  'datasource',
  'password',
  'pwd',
  'uid',
  'user id',
  'connection',
  'sql',
  'port',
];

// Helper to recursively search files matching folder names
function findConfigFolders(dir, depth = 0) {
  if (depth > 4) return []; // limit depth to avoid scan freezing
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }

      if (stat.isDirectory()) {
        const lowerName = file.toLowerCase();
        const matchesKeyword = SCAN_KEYWORDS.some(k => lowerName.includes(k));
        if (matchesKeyword) {
          results.push(fullPath);
        } else {
          results = results.concat(findConfigFolders(fullPath, depth + 1));
        }
      }
    }
  } catch (err) {
    // skip unreadable directories
  }
  return results;
}

function scanConfigFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const matchedLines = [];

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      const hasDbKeyword = DB_KEYWORDS.some(k => lowerLine.includes(k));
      if (hasDbKeyword) {
        matchedLines.push({ lineNum: index + 1, content: line.trim() });
      }
    });

    if (matchedLines.length > 0) {
      console.log(`\n[🔍 MATCH FOUND] file: ${filePath}`);
      matchedLines.forEach(match => {
        console.log(`   L${match.lineNum}: ${match.content}`);
      });
    }
  } catch (err) {
    // skip unreadable files
  }
}

function runScanner() {
  console.log('==================================================');
  console.log(' ADT CAPS AccessGuard Configuration Scanner');
  console.log('==================================================');

  // Check if custom search directory is passed via CLI argument
  const customArg = process.argv[2];
  let searchRoots = [];

  if (customArg) {
    const resolvedPath = path.resolve(customArg);
    if (fs.existsSync(resolvedPath)) {
      console.log(`Using custom search directory: ${resolvedPath}`);
      searchRoots = [resolvedPath];
    } else {
      console.log(`❌ Error: Custom directory path does not exist: ${customArg}`);
      console.log('Falling back to default system directories...');
      searchRoots = DEFAULT_SEARCH_ROOTS;
    }
  } else {
    console.log('No directory argument passed. Scanning default Windows locations...');
    searchRoots = DEFAULT_SEARCH_ROOTS;
  }

  console.log('\nStep 1: Searching for target directories...');
  
  let targetDirs = [];
  searchRoots.forEach(root => {
    if (fs.existsSync(root)) {
      console.log(`Checking root: ${root}`);
      // If the path itself is a targeted config folder or if we search inside it
      const lowerName = path.basename(root).toLowerCase();
      const matchesKeyword = SCAN_KEYWORDS.some(k => lowerName.includes(k));
      if (matchesKeyword) {
        targetDirs.push(root);
      }
      targetDirs = targetDirs.concat(findConfigFolders(root));
    }
  });

  // Unique target directories
  targetDirs = Array.from(new Set(targetDirs));

  if (targetDirs.length === 0) {
    console.log('❌ No ADT / AccessGuard related directories found.');
    console.log('Usage: node find_caps_db_info.js [Optional Path to Scan]');
    return;
  }

  console.log(`\nFound ${targetDirs.length} potential directory(ies):`);
  targetDirs.forEach(d => console.log(` - ${d}`));

  console.log('\nStep 2: Scanning config files inside target directories...');
  targetDirs.forEach(dir => {
    try {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (INTERESTING_EXTENSIONS.includes(ext)) {
              scanConfigFile(fullPath);
            }
          }
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }
  });

  console.log('\n==================================================');
  console.log(' Scan Completed.');
  console.log('==================================================');
}

runScanner();
