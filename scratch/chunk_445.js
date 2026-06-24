    // 전체 직원 리스트 정렬본
    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {
      const todayStr = getLocalDateString(now);
      const overrideStart = overrideMap.get(`${emp.empNo}_${todayStr}`);
      const defaultSchedule = settings.employeeSchedules?.[emp.empNo] || '08:00';
      const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;
      const baseScheduleTime = defaultSchedule;
      return { ...emp, scheduleTime, baseScheduleTime };
    }).sort((a, b) => a.name.localeCompare(b.name));