const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

async function checkToken() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiI3MDRmNzFiMi0xNGQ1LTRlOWItYjdmOC0xN2U3MmE1ZTRmZWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiaWF0IjoxNzc4NTUwOTM2LCJleHAiOjIwOTQxMjY5MzZ9.MockSignaturePlaceholder';
  const { data, error } = await supabase.auth.getUser(token);
  console.log('GetUser direct result:');
  console.log('Error:', error);
  console.log('User:', data?.user);
}

checkToken();
