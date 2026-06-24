{
  "AllowMultiple": false,
  "Description": "Remove duplicated, malformed lines in route.js",
  "EndLine": 603,
  "Instruction": "Delete the malformed formattedDeptData block and the duplicated deptDistribution block",
  "ReplacementContent": "",
  "StartLine": 577,
  "TargetContent": "    const formattedDeptData = Object.keys(deptDistribution).map(dept => ({\n      name: dept,\n      const dayEmpNos = new Set(dayLogs.map(log => log.Sabun || log.empNo));\n\n      if ((d.getDay() === 0 || d.getDay() === 6) && dayEmpNos.size === 0) continue;\n\n      weeklyTrend.push({\n        date: dStr.substring(5, 10).replace('-', '/'),\n        dayName,\n        count: dayEmpNos.size,\n        rate: totalEmployeesCount > 0 ? Math.round((dayEmpNos.size / totalEmployeesCount) * 100) : 0\n      });\n    }\n\n    // 5. 부서별 분포\n    const deptDistribution = {};\n    employeeStatuses.forEach(emp => {\n      if (!deptDistribution[emp.dept]) {\n        deptDistribution[emp.dept] = { total: 0, present: 0, late: 0 };\n      }\n      deptDistribution[emp.dept].total++;\n      if (emp.status !== '미출근' && emp.status !== '연차') {\n        deptDistribution[emp.dept].present++;\n        if (emp.isLate) deptDistribution[emp.dept].late++;\n      }\n    });",
  "TargetFile": "C:/Users/Owner/Documents/antigravity/agitated-raman/src/app/api/attendance/route.js",
  "toolAction": "Removing duplicates from route.js",
  "toolSummary": "Replace file content in route.js"
}