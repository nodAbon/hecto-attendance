import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  // Find employee 이동규
  const { data: emps, error: empErr } = await supabase
    .from('sa_employees')
    .select('*')
    .ilike('name', '%박덕수%');

  if (empErr) {
    console.error('Emp error:', empErr);
    return;
  }
  console.log('Employees found:', emps);

  const empNo = emps[0]?.emp_no;
  if (!empNo) {
    console.log('이동규 not found');
    return;
  }

  // Get overrides for 2026-04-14
  const { data: overrides, error: overErr } = await supabase
    .from('sa_schedule_overrides')
    .select('*')
    .eq('emp_no', empNo)
    .eq('work_date', '2026-05-19');
  console.log('Overrides for 2026-05-19:', overrides);

  // Get attendance logs for 2026-05-19
  const { data: logs, error: logErr } = await supabase
    .from('sa_attendance')
    .select('*')
    .eq('emp_no', empNo)
    .gte('log_time', '2026-05-19T00:00:00+09:00')
    .lte('log_time', '2026-05-19T23:59:59+09:00');
  console.log('Logs for 2026-05-19:', logs);

  // Get base schedule
  const { data: baseSchedules } = await supabase
    .from('SA_employee_schedules')
    .select('*')
    .eq('emp_no', empNo);
  console.log('Base schedules:', baseSchedules);
}

main();
