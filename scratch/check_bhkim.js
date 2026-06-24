const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function checkBhkim() {
  // 1. Get user details from auth
  const { data: users } = await supabase.auth.admin.listUsers();
  const bhkimUser = users.users.find(u => u.email.includes('bhkim'));
  
  if (!bhkimUser) {
    console.log('bhkim user not found in auth');
    return;
  }
  
  console.log('=== AUTH bhkim USER ===');
  console.log(bhkimUser);

  // 2. Get profile details for this id
  const { data: profile } = await supabase
    .from('sa_profiles')
    .select('*')
    .eq('id', bhkimUser.id)
    .maybeSingle();

  console.log('\n=== sa_profiles for bhkim id ===');
  console.log(profile);

  if (profile) {
    // 3. Get employee details for this emp_no
    const { data: employee } = await supabase
      .from('sa_employees')
      .select('*')
      .eq('emp_no', profile.emp_no)
      .maybeSingle();

    console.log('\n=== sa_employees for profile.emp_no ===');
    console.log(employee);
  }
}

checkBhkim();
