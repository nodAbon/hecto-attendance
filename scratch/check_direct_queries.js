const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function checkBhkimDirectly() {
  const userId = '704f71b2-14d5-4e9b-b7f8-17e72a5e4fed';
  const fallbackEmpNo = 'bhkim';
  
  // 1. Check if profile exists with id
  const { data: profile1 } = await supabase
    .from('sa_profiles')
    .select('id, emp_no, dept, rank, position, must_change_password, is_admin')
    .eq('id', userId)
    .maybeSingle();
    
  console.log('Query by ID:', profile1);

  // 2. Check if profile exists with emp_no bhkim
  const { data: profile2 } = await supabase
    .from('sa_profiles')
    .select('id, emp_no, dept, rank, position, must_change_password, is_admin')
    .eq('emp_no', fallbackEmpNo)
    .maybeSingle();

  console.log('Query by emp_no bhkim:', profile2);

  // 3. Check if profile exists with emp_no 20240052
  const { data: profile3 } = await supabase
    .from('sa_profiles')
    .select('id, emp_no, dept, rank, position, must_change_password, is_admin')
    .eq('emp_no', '20240052')
    .maybeSingle();

  console.log('Query by emp_no 20240052:', profile3);
}

checkBhkimDirectly();
