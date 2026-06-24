const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gbfoempwoeurhhlxqxgy.supabase.co';
const supabaseService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZm9lbXB3b2V1cmhobHhxeGd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU1MDkzNiwiZXhwIjoyMDk0MTI2OTM2fQ.6Tm0XESSnrop7BYgcuS9bCgeMhOxTHSUB8wmpkUFQ3c';

const supabase = createClient(supabaseUrl, supabaseService);

const toMinutes = (timeValue = '') => {
  const [hours = 0, minutes = 0] = String(timeValue).substring(0, 5).split(':').map((value) => Number(value) || 0);
  return (hours * 60) + minutes;
};

async function main() {
  const { data: employeeRows, error: employeeErr } = await supabase
    .from('sa_employees')
    .select('emp_no, name, dept, is_active')
    .eq('is_active', true)
    .ilike('name', '%박영원%')
    .order('name', { ascending: true });

  if (employeeErr) {
    console.error('employee query failed:', employeeErr);
    process.exit(1);
  }

  console.log('=== TARGET EMPLOYEES ===');
  console.log(JSON.stringify(employeeRows, null, 2));

  const target = (employeeRows || [])[0];
  if (!target) {
    console.log('박영원 직원을 찾지 못했습니다.');
    return;
  }

  const empNo = String(target.emp_no);
  const from = '2026-06-03T00:00:00+09:00';
  const to = '2026-06-04T23:59:59+09:00';

  const [{ data: logs, error: logErr }, { data: adjustments, error: adjErr }] = await Promise.all([
    supabase
      .from('sa_attendance')
      .select('id, emp_no, a_time, log_time, gate_name, flag1, event_type, source')
      .eq('emp_no', empNo)
      .gte('log_time', from)
      .lte('log_time', to)
      .order('log_time', { ascending: true }),
    supabase
      .from('sa_attendance_log_adjustments')
      .select('attendance_id, emp_no, work_date, adjusted_role, note')
      .eq('emp_no', empNo),
  ]);

  if (logErr) {
    console.error('log query failed:', logErr);
    process.exit(1);
  }
  if (adjErr) {
    console.error('adjustment query failed:', adjErr);
    process.exit(1);
  }

  const adjustmentMap = new Map((adjustments || []).map((row) => [String(row.attendance_id), row]));

  const rows = (logs || []).map((row) => {
    const logTime = row.a_time && String(row.a_time).length >= 14
      ? `${row.a_time.substring(0, 4)}-${row.a_time.substring(4, 6)}-${row.a_time.substring(6, 8)} ${row.a_time.substring(8, 10)}:${row.a_time.substring(10, 12)}:${row.a_time.substring(12, 14)}`
      : new Date(row.log_time).toISOString().replace('T', ' ').substring(0, 19);
    const rawWorkDate = logTime.split(' ')[0];
    const adj = adjustmentMap.get(String(row.id));
    const adjustedRole = String(adj?.adjusted_role || '').trim();
    const workDate = adj?.work_date || rawWorkDate;
    const baseMinutes = toMinutes(logTime.split(' ')[1] || '00:00:00');
    const workOrder = adjustedRole === '퇴근'
      ? baseMinutes + (24 * 60)
      : adjustedRole === '출근'
        ? baseMinutes - (24 * 60)
        : baseMinutes;

    return {
      id: row.id,
      logTime,
      rawWorkDate,
      workDate,
      eventType: row.event_type,
      adjustedRole,
      workOrder,
      source: row.source,
      gateName: row.gate_name,
      note: adj?.note || '',
    };
  });

  console.log('\n=== RAW + ADJUSTED ROWS ===');
  console.log(JSON.stringify(rows, null, 2));

  const grouped = rows.reduce((acc, row) => {
    const key = row.workDate;
    acc[key] ||= [];
    acc[key].push(row);
    return acc;
  }, {});

  console.log('\n=== GROUPED BY WORK DATE ===');
  for (const [workDate, list] of Object.entries(grouped)) {
    const sorted = [...list].sort((a, b) => (a.workOrder - b.workOrder) || a.logTime.localeCompare(b.logTime));
    const checkoutEntries = sorted.filter((entry) => entry.adjustedRole === '퇴근' || entry.eventType === '퇴근');
    console.log(`\n[${workDate}]`);
    sorted.forEach((row) => {
      console.log(`- ${row.logTime} | raw=${row.rawWorkDate} | event=${row.eventType || '-'} | adjusted=${row.adjustedRole || '-'} | workOrder=${row.workOrder} | source=${row.source || '-'}`);
    });
    console.log(`  last checkout => ${checkoutEntries.length ? checkoutEntries[checkoutEntries.length - 1].logTime : 'none'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
