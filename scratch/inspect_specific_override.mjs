import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  const empNos = ['20260001', '20250087', '20260005', '20230039', '20240048', '20250063', '20230044'];

  const { data: overrides } = await supabase
    .from('sa_schedule_overrides')
    .select('*')
    .in('emp_no', empNos)
    .eq('work_date', '2026-04-14');

  console.log('Overrides on 2026-04-14:', overrides);

  // For the empNo that has the override, query all logs on that day
  if (overrides && overrides.length > 0) {
    const targetEmpNo = overrides[0].emp_no;
    const { data: logs } = await supabase
      .from('sa_attendance')
      .select('*')
      .eq('emp_no', targetEmpNo)
      .gte('log_time', '2026-04-14T00:00:00+09:00')
      .lte('log_time', '2026-04-14T23:59:59+09:00');
    console.log(`Logs for target employee ${targetEmpNo}:`, logs);
  }
}

main();
