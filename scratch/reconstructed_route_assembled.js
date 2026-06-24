import { NextResponse } from 'next/server';
import { fetchAttendanceLogs, getSettings, fetchOvertimeSettings } from '@/lib/supabaseDb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const settings = getSettings();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined; // YYYY-MM

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

    const overtimeSettings = await fetchOvertimeSettings();

    // Create override map: empNo_workDate -> schedule_start
    const overrideMap = new Map();
    overrides.forEach(o => {
      overrideMap.set(`${o.emp_no}_${o.work_date}`, o.schedule_start);
    });

    // Create correction map: empNo_workDate -> correctedOutTime
    const correctionMap = new Map();
    corrections.forEach(c => {
      correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time);
    });

    const TWO_HOUR_LEAVE_CODES = new Set(['19', '20', '21', '22', '23', '24', '25', '26', '27', '28']);

    const getShiftedLimit = (baseSchedule, hoursToAdd) => {
      const [schedH, schedM] = String(baseSchedule || '08:00').split(':').map(Number);
      const totalMinutes = (schedH * 60) + schedM + (hoursToAdd * 60);
      const endHour = Math.floor(totalMinutes / 60);
      const endMinute = totalMinutes % 60;
      return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:59`;
    };

    const getMorningHalfDayLimit = (baseSchedule) => {
      const [schedH] = String(baseSchedule || '08:00').split(':').map(Number);
      if (schedH >= 10) return getShiftedLimit(baseSchedule, 4);
      return '13:00:59';
    };

    const getTwoHourLeaveLimit = (baseSchedule) => {
      const schedule = String(baseSchedule || '08:00');
      const [schedH] = schedule.split(':').map(Number);
      if (schedH === 10) return '13:00:59';
      return getShiftedLimit(schedule, 2);
    };

    const getTwoHourLeaveEndTime = (leave) => {
      const rawName = String(leave?.leaveName || leave?.leave_name || '');
      const match = rawName.match(/\[(\d{2})(?::?(\d{2}))?[~-](\d{2})(?::?(\d{2}))?\]/);
      if (!match) return null;
      const endHour = match[3];
      const endMinute = match[4] || '00';
      return `${endHour}:${endMinute}:59`;
    };

    const getTwoHourLeaveDisplayLabel = (leave) => {
      const rawName = String(leave?.leaveName || leave?.leave_name || '');
      const match = rawName.match(/\[(\d{2})(?::?(\d{2}))?[~-](\d{2})(?::?(\d{2}))?\]/);
      if (!match) return leave?.leaveName || leave?.leave_name || '휴가';
      const startHour = parseInt(match[1], 10);
      return startHour < 12 ? '오전반반차' : '오후반반차';
    };

    // 1.5. 각 사원별/일자별 최초 출근 시간 추출 및 지각 판별 (야근 추정 룰 적용)
    // logs는 시간 역순(내림차순)으로 정렬되어 있으므로 그룹화 후 오름차순 정렬하여 처리합니다.
    const getEmployeeLeaveForDate = (empNo, dateStrCompat) => {
      return leaves.find(l =>
        l.empNo === empNo &&
        dateStrCompat >= l.startDate &&
        dateStrCompat <= l.endDate
      );
    };

    const logsByEmpAndDate = {}; // empNo -> dateStr -> [logs]
    logs.forEach(log => {
      const dateStr = log.logTime.split(' ')[0];
      if (!logsByEmpAndDate[log.empNo]) logsByEmpAndDate[log.empNo] = {};
      if (!logsByEmpAndDate[log.empNo][dateStr]) logsByEmpAndDate[log.empNo][dateStr] = [];
      logsByEmpAndDate[log.empNo][dateStr].push(log);
    });

    // 각 사원별로 루프를 돌며 일자별 첫 출근(입실) 시각을 판단
    Object.keys(logsByEmpAndDate).forEach(empNo => {
      const dateMap = logsByEmpAndDate[empNo];
      const dates = Object.keys(dateMap).sort(); // 날짜 오름차순

      dates.forEach((dateStr, idx) => {
        const dayLogs = dateMap[dateStr].sort((a, b) => a.logTime.localeCompare(b.logTime));
        let firstLog = dayLogs[0];
        let timeOnly = firstLog.logTime.split(' ')[1]; // "HH:MM:SS"

        // [야근 추정 룰] 07:00 이전 출입기록이 있고 전날 출입기록이 있다면 전날 새벽 야근으로 추정하여 패스
        if (timeOnly < '07:00:00' && idx > 0) {
          const prevDateStr = dates[idx - 1];
          const prevDayLogs = dateMap[prevDateStr];
          if (prevDayLogs && prevDayLogs.length > 0) {
            // 07:00 이후의 다음 기록이 있는지 찾음
            const nextLog = dayLogs.find(l => l.logTime.split(' ')[1] >= '07:00:00');
            if (nextLog) {
              firstLog = nextLog;
              timeOnly = nextLog.logTime.split(' ')[1];
            }
          }
        }

        // 지각 비교 기준 시각
        const overrideStart = overrideMap.get(`${empNo}_${dateStr}`);
        const defaultSchedule = settings.employeeSchedules?.[empNo] || '08:00';
        const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;
        const dayLeave = getEmployeeLeaveForDate(empNo, dateStr.replace(/-/g, ''));

        // 첫 출입 시간이 07시 이후일 때만 정식 출근으로 간주하고 지각 판별
        const isOfficialCheckin = timeOnly >= '07:00:00';
        let isLate = isOfficialCheckin && (timeOnly > `${scheduleTime}:59`);
        if (dayLeave) {
          if (dayLeave.leaveCode === '12' || dayLeave.leaveCode === '60' || parseFloat(dayLeave.leaveDays) === 1.0) {
            isLate = false;
          } else if (dayLeave.leaveCode === '16' || dayLeave.leaveCode === '61') {
            isLate = timeOnly > getMorningHalfDayLimit(scheduleTime);
          } else if (TWO_HOUR_LEAVE_CODES.has(String(dayLeave.leaveCode))) {
            isLate = timeOnly > getTwoHourLeaveLimit(scheduleTime);
          }
        }

        // 해당 일자의 모든 로그 중, 첫번째 출근 로그에 isLate 결과 기록
        dayLogs.forEach(l => {
          if (l.id === firstLog.id && isOfficialCheckin) {
            l.isLate = isLate;
          } else {
            l.isLate = false;
          }
        });
      });
    });

    // 1. 전체 직원 목록 기준 설정
    const allEmployeesMap = new Map();

    if (employees && employees.length > 0) {
      employees.forEach(emp => {
        allEmployeesMap.set(emp.empNo, {
          empNo: emp.empNo,
          name: emp.name,
          dept: emp.dept,
          cardNo: ''
        });
      });
    } else {
      logs.forEach(log => {
        allEmployeesMap.set(log.empNo, {
          empNo: log.empNo,
          name: log.name,
          dept: log.dept,
          cardNo: log.cardNo
        });
      });
    }

    const totalEmployeesCount = allEmployeesMap.size || 10;

    // Helper to get local date string YYYY-MM-DD
    const getLocalDateString = (date) => {
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().split('T')[0];
    };

    // 2. 오늘 날짜 기준 로그 필터
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const todayStrCompat = todayStr.replace(/-/g, '');

    const todayLogs = logs.filter(log => log.logTime.startsWith(todayStr));

    // 오늘 직원별 로그 그룹화
    const empTodayMap = new Map();
    todayLogs.forEach(log => {
      if (!empTodayMap.has(log.empNo)) {
        empTodayMap.set(log.empNo, []);
      }
      empTodayMap.get(log.empNo).push(log);
    });

    let presentCount = 0;
    let lateCount = 0;
    let workingNowCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    const employeeStatuses = [];

    // 3. 전체 직원 목록 기준으로 오늘 상태 계산
    allEmployeesMap.forEach((emp, empNo) => {
      const empLogs = empTodayMap.get(empNo) || [];
      const todayStr = getLocalDateString(now);
      const overrideStart = overrideMap.get(`${empNo}_${todayStr}`);
      const defaultSchedule = settings.employeeSchedules?.[empNo] || '08:00';
      const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;
      const todayLeave = getEmployeeLeaveForDate(empNo, todayStrCompat);

      if (todayLeave) {
        leaveCount++;
      }

      // 야근 추정 룰 적용하여 오늘 유효 출근 로그 필터링
      let officialLogs = [...empLogs].sort((a, b) => a.logTime.localeCompare(b.logTime));
      let firstLog = officialLogs[0];
      let hasValidTodayLog = officialLogs.length > 0;

      if (firstLog) {
        const timeOnly = firstLog.logTime.split(' ')[1];
        if (timeOnly < '07:00:00') {
          // 전날 출입기록이 있는지 판별
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = getLocalDateString(yesterday);
          
          const hasYesterdayLog = logs.some(l => l.empNo === empNo && l.logTime.startsWith(yesterdayStr));
          if (hasYesterdayLog) {
            // 07:00 이전 로그는 전날 새벽 야근으로 추정하여 패스
            const nextLog = officialLogs.find(l => l.logTime.split(' ')[1] >= '07:00:00');
            if (nextLog) {
              firstLog = nextLog;
              // 07:00 이후 로그들만 오늘 정식 로그로 취급
              officialLogs = officialLogs.filter(l => l.logTime.split(' ')[1] >= '07:00:00');
            } else {
              hasValidTodayLog = false;
            }
          }
        }
      }

      if (hasValidTodayLog && firstLog) {
        presentCount++;
        const lastLog = officialLogs[officialLogs.length - 1];

        // 지각 여부 계산
        const checkInTimeOnly = firstLog.logTime.split(' ')[1]; // "HH:MM:SS"
        let checkInLimit = `${scheduleTime}:59`;
        let isLate = false;

        if (todayLeave) {
          if (todayLeave.leaveCode === '12' || todayLeave.leaveCode === '60' || parseFloat(todayLeave.leaveDays) === 1.0) {
            isLate = false; // full day leave is never late
          } else if (todayLeave.leaveCode === '16' || todayLeave.leaveCode === '61') {
            checkInLimit = getMorningHalfDayLimit(scheduleTime); // morning leave grace: base 13:00:59, 10:00 teams => +4 hours
            isLate = checkInTimeOnly > checkInLimit;
          } else if (TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
            // 2-hour leave: default schedule + 2 hours, but 10:00 teams are allowed until 13:00:59
            checkInLimit = getTwoHourLeaveLimit(scheduleTime);
            isLate = checkInTimeOnly > checkInLimit;
          } else {
            isLate = checkInTimeOnly > checkInLimit;
          }
        } else {
          isLate = checkInTimeOnly > checkInLimit;
        }

        if (isLate) lateCount++;

        // 현재 근무 여부
        // 수정된 퇴근시간이 있으면 퇴근으로 처리
        const correctedOut = correctionMap.get(`${empNo}_${todayStr}`);
        const isCheckedOut = lastLog.eventType === '퇴근' || correctedOut !== undefined;
        let status = '근무중';

        if (isCheckedOut) {
          status = '퇴근';
        } else if (todayLeave && (todayLeave.leaveCode === '17' || todayLeave.leaveCode === '62')) {
          status = '오후반차';
        } else if (todayLeave && TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
          status = getTwoHourLeaveDisplayLabel(todayLeave);
        } else {
          status = '근무중';
          workingNowCount++;
        }

        let outTimeText = '-';
        if (correctedOut) {
          outTimeText = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (lastLog.eventType === '퇴근') {
          outTimeText = lastLog.logTime.split(' ')[1].substring(0, 5);
        }

        employeeStatuses.push({
          ...emp,
          status,
          checkIn: firstLog.logTime.split(' ')[1].substring(0, 5), // "HH:MM"
          checkOut: outTimeText,
          isLate,
          lastGate: lastLog.gateName,
          scheduleTime,
          todayLeave: todayLeave ? {
            leaveCode: todayLeave.leaveCode,
            leaveName: todayLeave.leaveName,
            leaveDays: todayLeave.leaveDays
          } : null
        });
      } else {
        // 로그 없음
        let status = '미출근';
        if (todayLeave) {
          if (todayLeave.leaveCode === '12' || todayLeave.leaveCode === '60' || parseFloat(todayLeave.leaveDays) === 1.0) {
            status = '연차';
          } else if (todayLeave.leaveCode === '16' || todayLeave.leaveCode === '61') {
            status = '오전반차';
          } else if (todayLeave.leaveCode === '17' || todayLeave.leaveCode === '62') {
            status = '오후반차';
          } else if (TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
            status = getTwoHourLeaveDisplayLabel(todayLeave);
          } else {
            status = todayLeave.leaveName || '휴가';
          }
        } else {
          status = '미출근';
          absentCount++;
        }

        employeeStatuses.push({
          ...emp,
          status,
          checkIn: '-',
          checkOut: '-',
          isLate: false,
          lastGate: '-',
          scheduleTime,
          todayLeave: todayLeave ? {
            leaveCode: todayLeave.leaveCode,
            leaveName: todayLeave.leaveName,
            leaveDays: todayLeave.leaveDays
          } : null
        });
      }
    });

    // 4. 주간 트렌드 (최근 7일) - 대시보드에서는 제거하지만 API 하위 호환성 유지
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dStr = getLocalDateString(d);
      const dayName = d.toLocaleDateString('ko-KR', { weekday: 'short' });

      const dayLogs = logs.filter(log => log.logTime.startsWith(dStr));
      const dayEmpNos = new Set(dayLogs.map(log => log.Sabun || log.empNo));

      if ((d.getDay() === 0 || d.getDay() === 6) && dayEmpNos.size === 0) continue;

      weeklyTrend.push({
        date: dStr.substring(5, 10).replace('-', '/'),
        dayName,
        count: dayEmpNos.size,
        rate: totalEmployeesCount > 0 ? Math.round((dayEmpNos.size / totalEmployeesCount) * 100) : 0
      });
    }

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
      const overrideStart = overrideMap.get(`${emp.empNo}_${todayStr}`);
      const defaultSchedule = settings.employeeSchedules?.[emp.empNo] || '08:00';
      const scheduleTime = overrideStart ? overrideStart.substring(0, 5) : defaultSchedule;
      return { ...emp, scheduleTime };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      success: true,
      let officialLogs = [...empLogs].sort((a, b) => (a.workOrder ?? 0) - (b.workOrder ?? 0) || a.logTime.localeCompare(b.logTime));
      error: error || null,
      mode: settings.appMode,
      stats: {
      if (false && firstLog) {
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        workingNow: workingNowCount,
        leave: leaveCount,
        attendanceRate: totalEmployeesCount > 0 ? Math.round((presentCount / totalEmployeesCount) * 100) : 0
      },
      weeklyTrend,
      deptData: formattedDeptData,
      employeeStatuses: employeeStatuses.sort((a, b) => {
        const statusPriority = { 
          '근무중': 1, 
          '오전반차': 2, 
          '오후반차': 3, 
          '연차': 4, 
          '퇴근': 5, 
          '미출근': 6 
        };
        return (statusPriority[a.status] || 9) - (statusPriority[b.status] || 9) || a.name.localeCompare(b.name);
      }),
      recentLogs: logs.slice(0, 15).map(log => ({
        ...log,
        timeOnly: log.logTime.split(' ')[1].substring(0, 5),
        dateOnly: log.logTime.split(' ')[0].substring(5, 10).replace('-', '/')
                const checkoutLogs = officialLogs.filter((log) => {
          const role = String(log.adjustedRole || log.eventType || '').trim().toLowerCase();
          return log.isCheckoutCandidate || log.isAdjustedCheckout || role.includes('퇴') || role.includes('checkout');
        });
        const lastCheckoutLog = checkoutLogs.reduce((best, current) => {
          if (!best) return current;
          const bestOrder = Number.isFinite(Number(best.workOrder)) ? Number(best.workOrder) : Number(best.logTime.split(' ')[1].substring(0, 5).replace(':', ''));
          const currentOrder = Number.isFinite(Number(current.workOrder)) ? Number(current.workOrder) : Number(current.logTime.split(' ')[1].substring(0, 5).replace(':', ''));
          if (currentOrder > bestOrder) return current;
          if (currentOrder === bestOrder && current.logTime > best.logTime) return current;
          return best;
        }, null);
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}

          if (todayLeave.leaveCode === '12' || todayLeave.leaveCode === '60' || parseFloat(todayLeave.leaveDays) === 1.0) {
            isLate = false; // full day leave is never late
          } else if (todayLeave.leaveCode === '16' || todayLeave.leaveCode === '61') {
            checkInLimit = getMorningHalfDayLimit(scheduleTime); // morning leave grace: base 13:00:59, 10:00 teams => +4 hours
            isLate = checkInTimeOnly > checkInLimit;
          } else if (TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
            // 2-hour leave: default schedule + 2 hours, but 10:00 teams are allowed until 13:00:59
            checkInLimit = getTwoHourLeaveLimit(scheduleTime);
            isLate = checkInTimeOnly > checkInLimit;
          } else {
            isLate = checkInTimeOnly > checkInLimit;
          }
// MISSING LINE 460
// MISSING LINE 461
// MISSING LINE 462
// MISSING LINE 463
// MISSING LINE 464
// MISSING LINE 465
// MISSING LINE 466
// MISSING LINE 467
// MISSING LINE 468
// MISSING LINE 469
// MISSING LINE 470
// MISSING LINE 471
        if (isCheckedOut) {
          status = '퇴근';
        } else if (todayLeave && (todayLeave.leaveCode === '17' || todayLeave.leaveCode === '62')) {
          status = '오후반차';
        } else if (todayLeave && TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
          status = getTwoHourLeaveDisplayLabel(todayLeave);
        } else {
          status = '근무중';
          workingNowCount++;
        }
// MISSING LINE 482
        let outTimeText = '-';
        if (correctedOut) {
          outTimeText = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (lastCheckoutLog) {
          outTimeText = lastCheckoutLog.logTime.split(' ')[1].substring(0, 5);
// MISSING LINE 488
// MISSING LINE 489
// MISSING LINE 490
// MISSING LINE 491
// MISSING LINE 492
// MISSING LINE 493
          checkOut: outTimeText,
          isLate,
          lastGate: lastCheckoutLog?.gateName || officialLogs[officialLogs.length - 1]?.gateName || '-',
          scheduleTime,
          scheduleEndTime: schedulePair.end,
          todayLeave: todayLeave ? {
            leaveCode: todayLeave.leaveCode,
            leaveName: todayLeave.leaveName,
// MISSING LINE 502
// MISSING LINE 503
// MISSING LINE 504
// MISSING LINE 505
// MISSING LINE 506
        let status = '미출근';
        if (todayLeave) {
          if (todayLeave.leaveCode === '12' || todayLeave.leaveCode === '60' || parseFloat(todayLeave.leaveDays) === 1.0) {
            status = '연차';
          } else if (todayLeave.leaveCode === '16' || todayLeave.leaveCode === '61') {
            status = '오전반차';
          } else if (todayLeave.leaveCode === '17' || todayLeave.leaveCode === '62') {
            status = '오후반차';
          } else if (TWO_HOUR_LEAVE_CODES.has(String(todayLeave.leaveCode))) {
            status = getTwoHourLeaveDisplayLabel(todayLeave);
          } else {
            status = todayLeave.leaveName || '휴가';
          }
        } else {
// MISSING LINE 521
// MISSING LINE 522
// MISSING LINE 523
// MISSING LINE 524
// MISSING LINE 525
// MISSING LINE 526
// MISSING LINE 527
// MISSING LINE 528
          checkOut: '-',
          isLate: false,
          lastGate: '-',
          scheduleTime,
          scheduleEndTime: getSchedulePairForDate(empNo, dept, todayStr).end,
          todayLeave: todayLeave ? {
            leaveCode: todayLeave.leaveCode,
            leaveName: todayLeave.leaveName,
// MISSING LINE 537
// MISSING LINE 538
// MISSING LINE 539
// MISSING LINE 540
// MISSING LINE 541
// MISSING LINE 542
// MISSING LINE 543
// MISSING LINE 544
// MISSING LINE 545
// MISSING LINE 546
// MISSING LINE 547
// MISSING LINE 548
// MISSING LINE 549
// MISSING LINE 550
      const dayLogs = logs.filter(log => (log.workDate || log.logTime.split(' ')[0]) === dStr);
// MISSING LINE 552
// MISSING LINE 553
// MISSING LINE 554
// MISSING LINE 555
// MISSING LINE 556
// MISSING LINE 557
// MISSING LINE 558
// MISSING LINE 559
// MISSING LINE 560
// MISSING LINE 561
// MISSING LINE 562
// MISSING LINE 563
// MISSING LINE 564
// MISSING LINE 565
// MISSING LINE 566
// MISSING LINE 567
// MISSING LINE 568
// MISSING LINE 569
// MISSING LINE 570
// MISSING LINE 571
// MISSING LINE 572
// MISSING LINE 573
// MISSING LINE 574
// MISSING LINE 575
// MISSING LINE 576
// MISSING LINE 577
// MISSING LINE 578
      const dayEmpNos = new Set(dayLogs.map(log => log.Sabun || log.empNo));

      if ((d.getDay() === 0 || d.getDay() === 6) && dayEmpNos.size === 0) continue;

      weeklyTrend.push({
        date: dStr.substring(5, 10).replace('-', '/'),
        dayName,
        count: dayEmpNos.size,
        rate: totalEmployeesCount > 0 ? Math.round((dayEmpNos.size / totalEmployeesCount) * 100) : 0
      });
    }

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
// MISSING LINE 620
// MISSING LINE 621
      mode: 'supabase',
// MISSING LINE 623
// MISSING LINE 624
// MISSING LINE 625
// MISSING LINE 626
      allEmployees: allEmployeesList,
      leaves: leaves,
      corrections,
      overrides,
      manualCheckins,
      overtimeSettings
    });
// MISSING LINE 634
// MISSING LINE 635
// MISSING LINE 636
// MISSING LINE 637
// MISSING LINE 638
// MISSING LINE 639
// MISSING LINE 640
// MISSING LINE 641
// MISSING LINE 642
// MISSING LINE 643

// MISSING LINE 645
// MISSING LINE 646
// MISSING LINE 647
// MISSING LINE 648
// MISSING LINE 649
      allEmployees: allEmployeesList,
      leaves: leaves,
      corrections,
      overrides,
      manualCheckins,
      overtimeSettings
    });
