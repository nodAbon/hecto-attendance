import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables.');
}

const TARGET_DEPTS = new Set([
  '플랫폼서비스실',
  '사업개발팀',
  '사업관리 1팀',
  '사업관리 2팀',
  '사업관리 3팀',
]);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const chunk = (items, size = 500) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function main() {
  const { data: employees, error: empError } = await supabase
    .from('sa_employees')
    .select('emp_no, dept')
    .eq('is_active', true);

  if (empError) throw empError;

  const targetEmpNos = (employees || [])
    .filter((row) => TARGET_DEPTS.has(String(row.dept || '').trim()))
    .map((row) => String(row.emp_no || '').trim())
    .filter(Boolean);

  const uniqueTargetEmpNos = [...new Set(targetEmpNos)];

  if (uniqueTargetEmpNos.length === 0) {
    console.log('No target employees found. Nothing to update.');
    return;
  }

  let updatedCount = 0;
  for (const batch of chunk(uniqueTargetEmpNos, 500)) {
    const { data, error } = await supabase
      .from('sa_attendance')
      .update({ source: 'secom' })
      .in('emp_no', batch)
      .select('id');

    if (error) throw error;
    updatedCount += data?.length || 0;
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from('sa_attendance')
    .delete()
    .not('emp_no', 'in', `(${uniqueTargetEmpNos.join(',')})`)
    .select('id');

  if (deleteError) throw deleteError;

  console.log(JSON.stringify({
    targetEmployees: uniqueTargetEmpNos.length,
    updatedRows: updatedCount,
    deletedRows: deletedRows?.length || 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
