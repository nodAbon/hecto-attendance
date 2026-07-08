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
  const { data: emp } = await supabase.from('sa_employees').select('emp_no, name').eq('name', '이동규').single();
  const { data: logs } = await supabase.from('sa_attendance').select('log_time, event_type, gate_name').eq('emp_no', emp.emp_no).order('log_time', { ascending: true });
  console.log('Total logs:', logs.length);
  logs.forEach(l => {
    const kst = new Date(new Date(l.log_time).getTime() + 9*60*60*1000).toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${kst} | ${l.event_type} | ${l.gate_name}`);
  });
}

await run();
