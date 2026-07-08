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

async function inspect(name) {
  const { data: emp } = await supabase.from('sa_employees').select('emp_no, name').eq('name', name).single();
  console.log(`\n================= LOGS FOR ${emp.name} (${emp.emp_no}) =================`);
  const { data: logs, error: lErr } = await supabase
    .from('sa_attendance')
    .select('log_time, event_type, gate_name, flag1')
    .eq('emp_no', emp.emp_no)
    .order('log_time', { ascending: true });
  if (lErr) {
    console.error('Error fetching logs:', lErr);
    return;
  }
  logs.forEach(log => {
    const kstTime = new Date(log.log_time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    console.log(`${kstTime} | type: ${log.event_type} | gate: ${log.gate_name} | flag1: ${log.flag1 || '-'}`);
  });
}

await inspect('윤현필');
await inspect('이동규');
