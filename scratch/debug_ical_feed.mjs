import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx);
  const value = line.slice(idx + 1);
  if (!process.env[key]) process.env[key] = value;
}

const { buildLeaveIcsForDepartments } = await import('../src/lib/icalFeed.js');

try {
  const ics = await buildLeaveIcsForDepartments({
    departments: ['경영지원실', '경영지원팀'],
    calendarName: '비공개 iCal 구독',
    calendarDescription: 'debug',
  });
  console.log(ics.slice(0, 500));
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
