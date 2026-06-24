{
  "AllowMultiple": false,
  "Description": "Fetch employee schedules and define getDefaultSchedule in route.js GET handler",
  "EndLine": 25,
  "Instruction": "Fetch employeeSchedules, create employeeScheduleMap and define getDefaultSchedule in the GET handler",
  "ReplacementContent": "export async function GET(request) {\n  try {\n    const settings = getSettings();\n    const { searchParams } = new URL(request.url);\n    const month = searchParams.get('month') || undefined; // YYYY-MM\n\n    const employeeSchedules = await fetchEmployeeSchedules();\n    const employeeScheduleMap = new Map(\n      (employeeSchedules || []).map((row) => [String(row.emp_no || '').trim(), String(row.schedule_time || '08:00').substring(0, 5)])\n    );\n    const getDefaultSchedule = (empNo) => employeeScheduleMap.get(String(empNo || '').trim()) || '08:00';\n\n    const { \n      logs, \n      employees, \n      leaves = [], \n      corrections = [], \n      overrides = [], \n      manualCheckins = [], \n      isDemo, \n      error \n    } = await fetchAttendanceLogs(month);",
  "StartLine": 6,
  "TargetContent": "export async function GET(request) {\n  try {\n    const settings = getSettings();\n    const { searchParams } = new URL(request.url);\n    const month = searchParams.get('month') || undefined; // YYYY-MM\n\n    const { \n      logs, \n      employees, \n      leaves = [], \n      corrections = [], \n      overrides = [], \n      manualCheckins = [], \n      isDemo, \n      error \n    } = await fetchAttendanceLogs(month);",
  "TargetFile": "C:/Users/Owner/Documents/antigravity/agitated-raman/src/app/api/attendance/route.js",
  "toolAction": "Injecting employee schedules logic in route.js GET handler",
  "toolSummary": "Replace file content in route.js"
}