import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx);
  const value = line.slice(idx + 1);
  if (!process.env[key]) process.env[key] = value;
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('sa_leaves')
  .select('emp_no, emp_name, start_date, end_date, leave_code, leave_name, status')
  .eq('status', '40')
  .limit(10);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
