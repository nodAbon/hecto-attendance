import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: profiles, error: pErr } = await supabase
  .from('sa_profiles')
  .select('emp_no, is_admin, position, rank')
  .limit(5);

if (pErr) {
  console.error(pErr);
  process.exit(1);
}

console.log('Profiles:');
console.log(profiles);

// Get employees details for these profiles
const empNos = profiles.map(p => p.emp_no);
const { data: employees, error: eErr } = await supabase
  .from('sa_employees')
  .select('emp_no, name, dept')
  .in('emp_no', empNos);

if (eErr) {
  console.error(eErr);
  process.exit(1);
}

console.log('Employees:');
console.log(employees);
