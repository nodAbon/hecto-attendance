import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('sa_schedule_overrides')
  .select('*')
  .eq('emp_no', '20250086')
  .gte('work_date', '2026-04-01')
  .lte('work_date', '2026-04-30')
  .order('work_date', { ascending: true });

if (error) {
  console.error(error);
  process.exit(1);
}

console.log('April Overrides for Jinho Kim:');
console.log(JSON.stringify(data, null, 2));
