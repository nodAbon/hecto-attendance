{
  "AllowMultiple": false,
  "Description": "Add baseScheduleTime to allEmployees mapping in route.js",
  "EndLine": 397,
  "Instruction": "Define baseScheduleTime as defaultSchedule and include it in the returned employee object",
  "ReplacementContent": "    // 전체 직원 리스트 정렬본\n    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {\n      const todayStr = getLocalDateString(now);\n      const overrideStart = overrideMap.get(`${emp.empNo}_${todayStr}`);\n      const defaultSchedule = settings.employeeSchedules?.[emp.empNo] || '08:00';\n      const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;\n      const baseScheduleTime = defaultSchedule;\n      return { ...emp, scheduleTime, baseScheduleTime };\n    }).sort((a, b) => a.name.localeCompare(b.name));",
  "StartLine": 389,
  "TargetContent": "    // 전체 직원 리스트 정렬본\n    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {\n      const todayStr = getLocalDateString(now);\n      const overrideStart = overrideMap.get(`${emp.empNo}_${todayStr}`);\n      const defaultSchedule = settings.employeeSchedules?.[emp.empNo] || '08:00';\n      const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;\n      return { ...emp, scheduleTime };\n    }).sort((a, b) => a.name.localeCompare(b.name));",
  "TargetFile": "C:/Users/Owner/Documents/antigravity/agitated-raman/src/app/api/attendance/route.js",
  "toolAction": "Adding baseScheduleTime property in route.js",
  "toolSummary": "Replace file content in route.js"
}