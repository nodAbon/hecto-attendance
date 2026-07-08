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
  const { data: emp, error: eErr } = await supabase.from('sa_employees').select('*').eq('name', name).single();
  if (eErr) {
    console.error(eErr);
    return;
  }
  console.log(`\n================= RAW DATA FOR ${emp.name} (${emp.emp_no}) =================`);

  const { data: round } = await supabase.from('sa_employee_overtime_rounds').select('*').eq('emp_no', emp.emp_no).single();
  console.log('Round:', round);

  const { data: scheds } = await supabase.from('sa_employee_schedules').select('*').eq('emp_no', emp.emp_no);
  console.log('Employee schedules:', scheds);

  const { data: overrides } = await supabase.from('sa_schedule_overrides').select('*').eq('emp_no', emp.emp_no).gte('work_date', round.start_date).lte('work_date', round.end_date);
  console.log(`Overrides (${overrides.length}):`, overrides);

  const { data: adjustments } = await supabase.from('sa_attendance_log_adjustments').select('*').eq('emp_no', emp.emp_no).gte('work_date', round.start_date).lte('work_date', round.end_date);
  console.log(`Adjustments (${adjustments.length}):`, adjustments);

  const { data: leaves } = await supabase.from('sa_leaves').select('*').eq('emp_no', emp.emp_no).eq('status', '40');
  console.log(`Leaves (${leaves.length}):`, leaves);
}

await inspect('윤현필');
await inspect('이동규');
