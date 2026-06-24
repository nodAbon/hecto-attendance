export async function GET(request) {
  try {
    const settings = getSettings();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined; // YYYY-MM

    const employeeSchedules = await fetchEmployeeSchedules();
    const employeeScheduleMap = new Map(
      (employeeSchedules || []).map((row) => [String(row.emp_no || '').trim(), String(row.schedule_time || '08:00').substring(0, 5)])
    );
    const getDefaultSchedule = (empNo) => employeeScheduleMap.get(String(empNo || '').trim()) || '08:00';

    const { 
      logs, 
      employees, 
      leaves = [], 
      corrections = [], 
      overrides = [], 
      manualCheckins = [], 
      isDemo, 
      error 
    } = await fetchAttendanceLogs(month);