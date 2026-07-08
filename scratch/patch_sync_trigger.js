import fs from 'fs';

const filePath = 'src/app/api/sync/trigger/route.js';
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `    if (empRows.length > 0) {
      const records = empRows.map(r => ({
        emp_no:       r.emp_no,
        name:         r.name,
        dept:         r.dept,
        email:        extractEmployeeEmail(r) || null,
        login_id:     extractEmployeeLoginId(r) || null,
        company_code: MY_COMPANY_CODE,
        is_active:    true,
        synced_at:    new Date().toISOString(),
      }));
      await supabase.from('sa_employees').upsert(records, { onConflict: 'emp_no' });
    }`;

const replacementStr = `    if (empRows.length > 0) {
      const { data: existingEmps } = await supabase
        .from('sa_employees')
        .select('emp_no, is_active, status');
      const existingMap = new Map((existingEmps || []).map(e => [e.emp_no, e]));

      const records = empRows.map(r => {
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
      await supabase.from('sa_employees').upsert(records, { onConflict: 'emp_no' });
    }`;

// Normalize line endings to do search
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = targetStr.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedTarget)) {
  console.error("Target string not found in trigger route.js!");
  process.exit(1);
}

const updatedContent = normalizedContent.replace(normalizedTarget, replacementStr);
fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log("Successfully patched trigger route.js!");
