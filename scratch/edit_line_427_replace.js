{
  "AllowMultiple": false,
  "Description": "Fix baseScheduleTime to represent pure default schedule in route.js",
  "EndLine": 593,
  "Instruction": "Calculate baseScheduleTime and baseScheduleEndTime using getDefaultSchedule and inferScheduleEnd instead of getSchedulePairForDate",
  "ReplacementContent": "    // 전체 직원 리스트 정렬본\n    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {\n      const todayStr = getLocalDateString(now);\n      const baseStart = getDefaultSchedule(emp.empNo);\n      const baseScheduleTime = normalizeTime(baseStart, '08:00');\n      const baseScheduleEndTime = inferScheduleEnd(baseStart, emp.dept);\n      const scheduleTime = resolveScheduleTimeForDate(emp.empNo, emp.dept, todayStr);\n      return { ...emp, baseScheduleTime, baseScheduleEndTime, scheduleTime };\n    }).sort((a, b) => a.name.localeCompare(b.name));",
  "StartLine": 584,
  "TargetContent": "    // 전체 직원 리스트 정렬본\n    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {\n      const todayStr = getLocalDateString(now);\n      const baseSchedulePair = getSchedulePairForDate(emp.empNo, emp.dept, todayStr);\n      const baseScheduleTime = baseSchedulePair.start;\n      const baseScheduleEndTime = baseSchedulePair.end;\n      const scheduleTime = resolveScheduleTimeForDate(emp.empNo, emp.dept, todayStr);\n      return { ...emp, baseScheduleTime, baseScheduleEndTime, scheduleTime };\n    }).sort((a, b) => a.name.localeCompare(b.name));",
  "TargetFile": "C:/Users/Owner/Documents/antigravity/agitated-raman/src/app/api/attendance/route.js",
  "toolAction": "Fixing baseScheduleTime definition in route.js",
  "toolSummary": "Replace file content in route.js"
}