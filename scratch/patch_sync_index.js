import fs from 'fs';

const filePath = 'sync/index.js';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `  const records = rows.map(r => ({
    emp_no:       r.emp_no,
    name:         r.name,
    dept:         r.dept,
    email:        extractEmployeeEmail(r) || null,
    login_id:     extractEmployeeLoginId(r) || null,
    company_code: MY_COMPANY_CODE,
    is_active:    true,
    synced_at:    new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('sa_employees')
    .upsert(records, { onConflict: 'emp_no' });`;

const replacementStr = `  const { data: existingEmps, error: fetchErr } = await supabase
    .from('sa_employees')
    .select('emp_no, is_active, status');
  if (fetchErr) throw new Error(\`기존 직원 조회 실패: \${fetchErr.message}\`);
  const existingMap = new Map((existingEmps || []).map(e => [e.emp_no, e]));

  const records = rows.map(r => {
    const existing = existingMap.get(r.emp_no);
    return {
      emp_no:       r.emp_no,
      name:         r.name,
      dept:         r.dept,
      email:        extractEmployeeEmail(r) || null,
      login_id:     extractEmployeeLoginId(r) || null,
      company_code: MY_COMPANY_CODE,
      is_active:    existing ? existing.is_active : true,
      status:       existing ? (existing.status || 'active') : 'active',
      synced_at:    new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('sa_employees')
    .upsert(records, { onConflict: 'emp_no' });`;

// Normalize line endings to do search
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = targetStr.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedTarget)) {
  console.error("Target string not found in sync/index.js!");
  process.exit(1);
}

const updatedContent = normalizedContent.replace(normalizedTarget, replacementStr);
fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log("Successfully patched sync/index.js!");
