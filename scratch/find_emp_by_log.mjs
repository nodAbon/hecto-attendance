import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  const { data: logs, error } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, log_time, event_type')
    .gte('log_time', '2026-04-14T00:00:00+09:00')
    .lte('log_time', '2026-04-14T23:59:59+09:00');

  if (error) {
    console.error(error);
    return;
  }

  // Filter logs that are around 11:21 or 17:12 KST
  const matchingLogs = logs.filter(log => {
    const timeKst = new Date(log.log_time).toLocaleTimeString('ko-KR', { hour12: false });
    return timeKst.startsWith('11:21') || timeKst.startsWith('17:12') || timeKst.startsWith('11:25') || timeKst.startsWith('17:35');
  });

  console.log('Matching logs:', matchingLogs);

  // Fetch names for these emp_nos
  const empNos = Array.from(new Set(matchingLogs.map(l => l.emp_no)));
  if (empNos.length > 0) {
    const { data: emps } = await supabase
      .from('sa_employees')
      .select('emp_no, name, dept')
      .in('emp_no', empNos);
    console.log('Employees:', emps);
  }
}

main();
