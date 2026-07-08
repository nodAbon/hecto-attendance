import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  // Strip quotes if they exist
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

const { createClient } = await import('@supabase/supabase-js');

console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch an active employee
const { data: employees, error: empErr } = await supabase
  .from('sa_employees')
  .select('emp_no, name')
  .eq('is_active', true)
  .limit(1);

if (empErr) {
  console.error('Failed to fetch employees:', empErr);
  process.exit(1);
}

if (!employees || employees.length === 0) {
  console.error('No active employees found.');
  process.exit(1);
}

const empNo = employees[0].emp_no;
const name = employees[0].name;
console.log(`Testing with employee: ${name} (${empNo})`);

// Try inserting/upserting to sa_schedule_overrides
const testRow = {
  emp_no: empNo,
  work_date: '2026-06-25',
  schedule_start: '09:00',
  schedule_end: '18:00',
  allow_overtime: true,
  note: 'Test Override Entry',
};

console.log('Inserting row:', testRow);
const { data, error } = await supabase
  .from('sa_schedule_overrides')
  .upsert(testRow, { onConflict: 'emp_no,work_date' })
  .select();

if (error) {
  console.error('Upsert failed:', error);
} else {
  console.log('Upsert succeeded:', data);
}
