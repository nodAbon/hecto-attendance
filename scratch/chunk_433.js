    // 5. 부서별 분포
    const deptDistribution = {};
    employeeStatuses.forEach(emp => {
      if (!deptDistribution[emp.dept]) {
        deptDistribution[emp.dept] = { total: 0, present: 0, late: 0 };
      }
      deptDistribution[emp.dept].total++;
      if (emp.status !== '미출근' && emp.status !== '연차') {
        deptDistribution[emp.dept].present++;
        if (emp.isLate) deptDistribution[emp.dept].late++;
      }
    });

    const formattedDeptData = Object.keys(deptDistribution).map(dept => ({
      name: dept,
      total: deptDistribution[dept].total,
      present: deptDistribution[dept].present,
      late: deptDistribution[dept].late
    }));

    // 전체 직원 리스트 정렬본
    const allEmployeesList = Array.from(allEmployeesMap.values()).map(emp => {
      const todayStr = getLocalDateString(now);
      const baseStart = getDefaultSchedule(emp.empNo);
      const baseScheduleTime = normalizeTime(baseStart, '08:00');
      const baseScheduleEndTime = inferScheduleEnd(baseStart, emp.dept);
      const scheduleTime = resolveScheduleTimeForDate(emp.empNo, emp.dept, todayStr);
      return { ...emp, baseScheduleTime, baseScheduleEndTime, scheduleTime };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      isDemo,
      error: error || null,
      mode: 'supabase',
      stats: {
        totalEmployees: totalEmployeesCount,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        workingNow: workingNowCount,
        leave: leaveCount,
        attendanceRate: totalEmployeesCount > 0 ? Math.round((presentCount / totalEmployeesCount) * 100) : 0
      },
      weeklyTrend,
      deptData: formattedDeptData,