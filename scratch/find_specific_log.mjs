import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  // Query using wildcard pattern like '______141121%' to match YYYYMM141121...
  // Or simply '%141121%' since it's unique enough.
  const { data: logs, error } = await supabase
    .from('sa_attendance')
    .select('emp_no, a_time, log_time, event_type')
    .like('a_time', '%141121%');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Wildcard matched logs:', logs);

  const empNos = Array.from(new Set(logs.map(l => l.emp_no)));
  if (empNos.length > 0) {
    const { data: emps } = await supabase
      .from('sa_employees')
      .select('emp_no, name, dept')
      .in('emp_no', empNos);
    console.log('Employees:', emps);
  }
}

main();
