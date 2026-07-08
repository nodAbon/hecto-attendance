import fs from 'node:fs';

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: logs } = await supabase.from('sa_attendance')
    .select('log_time, event_type, gate_name')
    .eq('emp_no', '20240045')
    .gte('log_time', '2026-02-10T00:00:00+09:00')
    .lte('log_time', '2026-02-12T23:59:59+09:00')
    .order('log_time', { ascending: true });
  console.log('Logs count:', logs.length);
  logs.forEach(l => {
    console.log(l);
  });
}

await run();
