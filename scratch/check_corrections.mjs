import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function main() {
  const empNo = '20260002';
  const { data: corrections, error } = await supabase
    .from('sa_attendance_corrections')
    .select('*')
    .eq('emp_no', empNo)
    .eq('work_date', '2026-04-14');

  if (error) {
    console.error(error);
  } else {
    console.log('Corrections for 2026-04-14:', corrections);
  }
}

main();
