import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  const empNo = '20250055';
  
  // Fetch employee info
  const { data: emps } = await supabase
    .from('sa_employees')
    .select('*')
    .eq('emp_no', empNo);
  console.log('Employee info:', emps);

  // Fetch overrides
  const { data: overrides } = await supabase
    .from('sa_schedule_overrides')
    .select('*')
    .eq('emp_no', empNo);
  console.log('All overrides for 김유경:', overrides);

  // Fetch logs around 2026-04 or 2026-06
  const { data: logs } = await supabase
    .from('sa_attendance')
    .select('*')
    .eq('emp_no', empNo)
    .order('a_time', { ascending: true });
  
  console.log('Total logs count:', logs.length);
  // Log any records that match the times in the screenshot
  const matched = logs.filter(l => {
    const date = l.a_time.substring(0, 8);
    return date.endsWith('14') || date.endsWith('15') || date.endsWith('16') || date.endsWith('17');
  });
  console.log('Logs matching day 14-17:', matched.slice(0, 20));
}

main();
