import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  const { data: logs, error } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, log_time, event_type')
    .limit(10000);

  if (error) {
    console.error(error);
    return;
  }

  const matchingLogs = logs.filter(log => {
    // a_time is YYYYMMDDHHMMSS format
    const timeStr = String(log.a_time || '');
    return timeStr.substring(8, 12) === '1121' || timeStr.substring(8, 12) === '1712';
  });

  console.log('Matching logs:', matchingLogs.slice(0, 10));

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
