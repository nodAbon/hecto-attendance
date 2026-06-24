const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function checkBhkimDetailsFmt() {
  const userId = '704f71b2-14d5-4e9b-b7f8-17e72a5e4fed';
  
  // Try resolving profile manually WITHOUT dept
  const { data: profile, error } = await supabase
    .from('sa_profiles')
    .select('id, emp_no, rank, position, must_change_password, is_admin')
    .eq('id', userId)
    .maybeSingle();

  console.log('Resolved Profile:', profile);
  console.log('Error:', error);
  
  if (profile) {
    const { data: employee, error: empErr } = await supabase
      .from('sa_employees')
      .select('name, dept')
      .eq('emp_no', profile.emp_no)
      .maybeSingle();
      
    console.log('Employee Select Query:', { data: employee, error: empErr });
  }
}

checkBhkimDetailsFmt();
