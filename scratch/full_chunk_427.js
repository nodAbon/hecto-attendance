    // 전체 직원 리스트 정렬본
    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {
      const todayStr = getLocalDateString(now);
      const baseStart = getDefaultSchedule(emp.empNo);
      const baseScheduleTime = normalizeTime(baseStart, '08:00');
      const baseScheduleEndTime = inferScheduleEnd(baseStart, emp.dept);
      const scheduleTime = resolveScheduleTimeForDate(emp.empNo, emp.dept, todayStr);
      return { ...emp, baseScheduleTime, baseScheduleEndTime, scheduleTime };
    }).sort((a, b) => a.name.localeCompare(b.name));