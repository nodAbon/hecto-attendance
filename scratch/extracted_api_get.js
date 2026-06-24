async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month') || undefined; // YYYY-MM
        const employeeSchedules = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabaseDb$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchEmployeeSchedules"])();
        const employeeScheduleMap = new Map((employeeSchedules || []).map((row)=>[
                String(row.emp_no || '').trim(),
                String(row.schedule_time || '08:00').substring(0, 5)
            ]));
        const getDefaultSchedule = (empNo)=>employeeScheduleMap.get(String(empNo || '').trim()) || '08:00';
        const appSettings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$secomDb$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSettings"])();
        const nightCheckinGraceHours = Number(appSettings?.nightCheckinGraceHours ?? 3) || 3;
        const { logs: rawLogs, employees, leaves = [], corrections = [], overrides = [], manualCheckins = [], isDemo, error } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabaseDb$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchAttendanceLogs"])(month);
        const overtimeSettings = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$supabaseDb$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["fetchOvertimeSettings"])();
        // Create override map: empNo_workDate -> schedule_start
        const overrideMap = new Map();
        overrides.forEach((o)=>{
            overrideMap.set(`${o.emp_no}_${o.work_date}`, {
                scheduleStart: String(o.schedule_start || '').substring(0, 5),
                scheduleEnd: String(o.schedule_end || '').substring(0, 5)
            });
        });
        // Create correction map: empNo_workDate -> correctedOutTime
        const correctionMap = new Map();
        corrections.forEach((c)=>{
            correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time);
        });
        const TWO_HOUR_LEAVE_CODES = new Set([
            '19',
            '20',
            '21',
            '22',
            '23',
            '24',
            '25',
            '26',
            '27',
            '28'
        ]);
        const getShiftedLimit = (baseSchedule, hoursToAdd)=>{
            const [schedH, schedM] = String(baseSchedule || '08:00').split(':').map(Number);
            const totalMinutes = schedH * 60 + schedM + hoursToAdd * 60;
            const endHour = Math.floor(totalMinutes / 60);
            const endMinute = totalMinutes % 60;
            return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:59`;
        };
        const getMorningHalfDayLimit = (baseSchedule)=>{
            const [schedH] = String(baseSchedule || '08:00').split(':').map(Number);
            if (schedH >= 10) return getShiftedLimit(baseSchedule, 4);
            return '13:00:59';
        };
        const getTwoHourLeaveLimit = (baseSchedule)=>{
            const schedule = String(baseSchedule || '08:00');
            const [schedH] = schedule.split(':').map(Number);
            if (schedH === 10) return '13:00:59';
            return getShiftedLimit(schedule, 2);
        };
        const getTwoHourLeaveEndTime = (leave)=>{
            const rawName = String(leave?.leaveName || leave?.leave_name || '');
            const match = rawName.match(/\[(\d{2})(?::?(\d{2}))?[~-](\d{2})(?::?(\d{2}))?\]/);
            if (!match) return null;
            const endHour = match[3];
            const endMinute = match[4] || '00';
            return `${endHour}:${endMinute}:59`;
        };
        const getTwoHourLeaveDisplayLabel = (leave)=>{
            const rawName = String(leave?.leaveName || leave?.leave_name || '');
            const match = rawName.match(/\[(\d{2})(?::?(\d{2}))?[~-](\d{2})(?::?(\d{2}))?\]/);
            if (!match) return leave?.leaveName || leave?.leave_name || '휴가';
            const startHour = parseInt(match[1], 10);
            return startHour < 12 ? '오전반반차' : '오후반반차';
        };
        // 1.5. 각 사원별/일자별 최초 출근 시간 추출 및 지각 판별 (야근 추정 룰 적용)
        // logs는 시간 역순(내림차순)으로 정렬되어 있으므로 그룹화 후 오름차순 정렬하여 처리합니다.
        const getEmployeeLeaveForDate = (empNo, dateStrCompat)=>{
            return leaves.find((l)=>l.empNo === empNo && dateStrCompat >= l.startDate && dateStrCompat <= l.endDate);
        };
        const formatDateLocal = (date)=>{
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - offset * 60 * 1000);
            return localDate.toISOString().split('T')[0];
        };
        const shiftDate = (dateStr, days)=>{
            const next = new Date(`${dateStr}T00:00:00+09:00`);
            next.setDate(next.getDate() + days);
            return formatDateLocal(next);
        };
        const toMinutes = (timeValue)=>{
            const [hours = 0, minutes = 0] = String(timeValue || '00:00').substring(0, 5).split(':').map((value)=>Number(value) || 0);
            return hours * 60 + minutes;
        };
        const normalizeTime = (timeValue, fallback = '00:00')=>{
            const value = String(timeValue || fallback).trim();
            if (!value) return fallback;
            return value.length >= 5 ? value.substring(0, 5) : fallback;
        };
        const inferScheduleEnd = (scheduleStart, dept)=>{
            const start = normalizeTime(scheduleStart, '08:00');
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nightScheduleRules$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isNightTeamDept"])(dept)) {
                return start === '20:00' ? '08:00' : '06:00';
            }
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$nightScheduleRules$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isSpecialDayTeamDept"])(dept)) {
                return '19:00';
            }
            return start === '10:00' ? '19:00' : '17:00';
        };
        const getSchedulePairForDate = (empNo, dept, dateStr)=>{
            const override = overrideMap.get(`${empNo}_${dateStr}`);
            if (override?.scheduleStart) {
                const start = normalizeTime(override.scheduleStart, '08:00');
                return {
                    start,
                    end: normalizeTime(override.scheduleEnd || inferScheduleEnd(start, dept), inferScheduleEnd(start, dept))
                };
            }
            const baseStart = getDefaultSchedule(empNo);
            return {
                start: normalizeTime(baseStart, '08:00'),
                end: inferScheduleEnd(baseStart, dept)
            };
        };
        const isOvernightSchedule = (schedule)=>toMinutes(schedule?.end) <= toMinutes(schedule?.start);
        const getWorkWindowForDate = (workDate, schedule)=>{
            const start = new Date(`${workDate}T${normalizeTime(schedule.start, '08:00')}:00+09:00`);
            const end = new Date(`${workDate}T${normalizeTime(schedule.end, '17:00')}:00+09:00`);
            const overnight = toMinutes(schedule.end) <= toMinutes(schedule.start);
            if (overnight) {
                end.setDate(end.getDate() + 1);
            }
            return {
                start: new Date(start.getTime() - (overnight ? nightCheckinGraceHours : 0) * 60 * 60 * 1000),
                end: new Date(end.getTime() + 5 * 60 * 60 * 1000)
            };
        };
        const isLogWithinWindow = (logTime, workDate, schedule)=>{
            const timestamp = new Date(`${String(logTime || '').replace(' ', 'T')}+09:00`).getTime();
            const window = getWorkWindowForDate(workDate, schedule);
            return timestamp >= window.start.getTime() && timestamp <= window.end.getTime();
        };
        const getWorkOrder = (logTime, schedule)=>{
            const timeOnly = String(logTime || '').split(' ')[1] || '00:00:00';
            const minutes = toMinutes(timeOnly);
            if (!schedule || toMinutes(schedule.end) > toMinutes(schedule.start)) {
                return minutes;
            }
            const hour = Math.floor(minutes / 60);
            if (hour >= 12) {
                return minutes;
            }
            return minutes + 24 * 60;
        };
        const isAfternoonHalfLeave = (leave)=>{
            const leaveCode = String(leave?.leaveCode || leave?.leave_code || '');
            const leaveName = String(leave?.leaveName || leave?.leave_name || '');
            return leaveCode === '17' || leaveCode === '62' || /오후/.test(leaveName);
        };
        const getCheckoutThreshold = (workDate, schedule, dayLeave = null)=>{
            if (!workDate || !schedule) return null;
            if (dayLeave && isAfternoonHalfLeave(dayLeave)) {
                const start = new Date(`${workDate}T${normalizeTime(schedule.start, '08:00')}:00+09:00`);
                start.setHours(start.getHours() + 4);
                return start;
            }
            const end = new Date(`${workDate}T${normalizeTime(schedule.end, '17:00')}:00+09:00`);
            if (toMinutes(schedule.end) <= toMinutes(schedule.start)) {
                end.setDate(end.getDate() + 1);
            }
            end.setHours(end.getHours() - 3);
            return end;
        };
        const isCheckoutCandidateForLog = (logTime, workDate, schedule, dayLeave = null)=>{
            const threshold = getCheckoutThreshold(workDate, schedule, dayLeave);
            if (!threshold) return true;
            const timestamp = new Date(`${String(logTime || '').replace(' ', 'T')}+09:00`).getTime();
            return timestamp >= threshold.getTime();
        };
        const assignWorkDateForLog = (log)=>{
            const actualDate = String(log.logTime || '').split(' ')[0];
            if (!actualDate) return null;
            if (log.workDate && log.workDate !== actualDate) {
                return log.workDate;
            }
            const dept = employeeDeptMap.get(String(log.empNo || '').trim()) || '';
            const prevDate = shiftDate(actualDate, -1);
            const prevSchedule = getSchedulePairForDate(log.empNo, dept, prevDate);
            if (isOvernightSchedule(prevSchedule) && isLogWithinWindow(log.logTime, prevDate, prevSchedule)) {
                return prevDate;
            }
            const currentSchedule = getSchedulePairForDate(log.empNo, dept, actualDate);
            if (isOvernightSchedule(currentSchedule) && isLogWithinWindow(log.logTime, actualDate, currentSchedule)) {
                return actualDate;
            }
            return actualDate;
        };
        const resolveScheduleTimeForDate = (empNo, dept, dateStr)=>{
            return getSchedulePairForDate(empNo, dept, dateStr).start;
        };
        const employeeDeptMap = new Map((employees || []).map((emp)=>[
                String(emp.empNo || '').trim(),
                String(emp.dept || '').trim()
            ]));
        const logs = (rawLogs || []).map((log)=>{
            const workDate = assignWorkDateForLog(log);
            const dept = employeeDeptMap.get(String(log.empNo || '').trim()) || '';
            const schedulePair = getSchedulePairForDate(log.empNo, dept, workDate || String(log.logTime || '').split(' ')[0]);
            const dayLeave = getEmployeeLeaveForDate(log.empNo, String(workDate || String(log.logTime || '').split(' ')[0]).replace(/-/g, ''));
            const roleText = String(log.adjustedRole || '').trim().toLowerCase();
            const isIgnored = roleText.includes('무시') || roleText.includes('ignore');
            const isAdjustedCheckout = Boolean(log.isAdjustedCheckout) || roleText.includes('퇴') || roleText.includes('checkout');
            const isAdjustedCheckin = Boolean(log.isAdjustedCheckin) || roleText.includes('출근') || roleText.includes('checkin');
            const scheduledWorkOrder = getWorkOrder(log.logTime, schedulePair);
            const savedWorkOrder = Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null;
            const workOrder = isAdjustedCheckout || isAdjustedCheckin ? savedWorkOrder ?? (isAdjustedCheckout ? scheduledWorkOrder + 24 * 60 : scheduledWorkOrder - 24 * 60) : scheduledWorkOrder;
            return {
                ...log,
                workDate,
                workOrder,
                isCheckoutCandidate: isCheckoutCandidateForLog(log.logTime, workDate || String(log.logTime || '').split(' ')[0], schedulePair, dayLeave),
                isAdjustedCheckout,
                isAdjustedCheckin,
                isIgnored
            };
        }).filter((log)=>!log.isIgnored);
        const logsByEmpAndDate = {}; // empNo -> workDate -> [logs]
        logs.forEach((log)=>{
            const dateStr = log.workDate || log.logTime.split(' ')[0];
            if (!logsByEmpAndDate[log.empNo]) logsByEmpAndDate[log.empNo] = {};
            if (!logsByEmpAndDate[log.empNo][dateStr]) logsByEmpAndDate[log.empNo][dateStr] = [];
            logsByEmpAndDate[log.empNo][dateStr].push(log);
        });
        // 각 사원별로 루프를 돌며 일자별 첫 출근(입실) 시각을 판단
        Object.keys(logsByEmpAndDate).forEach((empNo)=>{
            const dateMap = logsByEmpAndDate[empNo];
            const dates = Object.keys(dateMap).sort(); // 날짜 오름차순
            dates.forEach((dateStr, idx)=>{
                const dayLogs = dateMap[dateStr].sort((a, b)=>(a.workOrder ?? 0) - (b.workOrder ?? 0) || a.logTime.localeCompare(b.logTime));
                let firstLog = dayLogs[0];
                let timeOnly = firstLog.logTime.split(' ')[1]; // "HH:MM:SS"
                // [야근 추정 룰] 07:00 이전 출입기록이 있고 전날 출입기록이 있다면 전날 새벽 야근으로 추정하여 패스
                if (false && timeOnly < '07:00:00' && idx > 0) //TURBOPACK unreachable
                ;
                // 지각 비교 기준 시각
                const dept = employeeDeptMap.get(empNo) || '';
                const schedulePair = getSchedulePairForDate(empNo, dept, dateStr);
                const scheduleTime = schedulePair.start;
                const dayLeave = getEmployeeLeaveForDate(empNo, dateStr.replace(/-/g, ''));
                // 첫 출입 시간이 07시 이후일 때만 정식 출근으로 간주하고 지각 판별
                const isOfficialCheckin = timeOnly >= '07:00:00';
                let isLate = isOfficialCheckin && timeOnly > `${scheduleTime}:59`;
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
                dayLogs.forEach((l)=>{
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
            employees.forEach((emp)=>{
                allEmployeesMap.set(emp.empNo, {
                    empNo: emp.empNo,
                    name: emp.name,
                    dept: emp.dept,
                    cardNo: ''
                });
            });
        } else {
            logs.forEach((log)=>{
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
        const getLocalDateString = (date)=>{
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - offset * 60 * 1000);
            return localDate.toISOString().split('T')[0];
        };
        // 2. 오늘 날짜 기준 로그 필터
        const now = new Date();
        const todayStr = getLocalDateString(now);
        const todayStrCompat = todayStr.replace(/-/g, '');
        const todayLogs = logs.filter((log)=>(log.workDate || log.logTime.split(' ')[0]) === todayStr);
        // 오늘 직원별 로그 그룹화
        const empTodayMap = new Map();
        todayLogs.forEach((log)=>{
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
        allEmployeesMap.forEach((emp, empNo)=>{
            const empLogs = empTodayMap.get(empNo) || [];
            const todayStr = getLocalDateString(now);
            const dept = employeeDeptMap.get(empNo) || '';
            const schedulePair = getSchedulePairForDate(empNo, dept, todayStr);
            const scheduleTime = schedulePair.start;
            const todayLeave = getEmployeeLeaveForDate(empNo, todayStrCompat);
            if (todayLeave) {
                leaveCount++;
            }
            // 야근 추정 룰 적용하여 오늘 유효 출근 로그 필터링
            let officialLogs = [
                ...empLogs
            ].sort((a, b)=>(a.workOrder ?? 0) - (b.workOrder ?? 0) || a.logTime.localeCompare(b.logTime));
            let firstLog = officialLogs[0];
            let hasValidTodayLog = officialLogs.length > 0;
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            if (hasValidTodayLog && firstLog) {
                presentCount++;
                const checkoutLogs = officialLogs.filter((log)=>{
                    const role = String(log.adjustedRole || log.eventType || '').trim().toLowerCase();
                    return log.isCheckoutCandidate || log.isAdjustedCheckout || role.includes('퇴') || role.includes('checkout');
                });
                const lastCheckoutLog = checkoutLogs.reduce((best, current)=>{
                    if (!best) return current;
                    const bestOrder = Number.isFinite(Number(best.workOrder)) ? Number(best.workOrder) : Number(best.logTime.split(' ')[1].substring(0, 5).replace(':', ''));
                    const currentOrder = Number.isFinite(Number(current.workOrder)) ? Number(current.workOrder) : Number(current.logTime.split(' ')[1].substring(0, 5).replace(':', ''));
                    if (currentOrder > bestOrder) return current;
                    if (currentOrder === bestOrder && current.logTime > best.logTime) return current;
                    return best;
                }, null);
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
                const isCheckedOut = correctedOut !== undefined || !!lastCheckoutLog;
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
                    outTimeText = new Date(correctedOut).toLocaleTimeString('ko-KR', {
                        hour12: false
                    }).substring(0, 5);
                } else if (lastCheckoutLog) {
                    outTimeText = lastCheckoutLog.logTime.split(' ')[1].substring(0, 5);
                }
                employeeStatuses.push({
                    ...emp,
                    status,
                    checkIn: firstLog.logTime.split(' ')[1].substring(0, 5),
                    checkOut: outTimeText,
                    isLate,
                    lastGate: lastCheckoutLog?.gateName || officialLogs[officialLogs.length - 1]?.gateName || '-',
                    scheduleTime,
                    scheduleEndTime: schedulePair.end,
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
                    scheduleEndTime: getSchedulePairForDate(empNo, dept, todayStr).end,
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
        for(let i = 6; i >= 0; i--){
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dStr = getLocalDateString(d);
            const dayName = d.toLocaleDateString('ko-KR', {
                weekday: 'short'
            });
            const dayLogs = logs.filter((log)=>(log.workDate || log.logTime.split(' ')[0]) === dStr);
            const dayEmpNos = new Set(dayLogs.map((log)=>log.Sabun || log.empNo));
            if ((d.getDay() === 0 || d.getDay() === 6) && dayEmpNos.size === 0) continue;
            weeklyTrend.push({
                date: dStr.substring(5, 10).replace('-', '/'),
                dayName,
                count: dayEmpNos.size,
                rate: totalEmployeesCount > 0 ? Math.round(dayEmpNos.size / totalEmployeesCount * 100) : 0
            });
        }
        // 5. 부서별 분포
        const deptDistribution = {};
        employeeStatuses.forEach((emp)=>{
            if (!deptDistribution[emp.dept]) {
                deptDistribution[emp.dept] = {
                    total: 0,
                    present: 0,
                    late: 0
                };
            }
            deptDistribution[emp.dept].total++;
            if (emp.status !== '미출근' && emp.status !== '연차') {
                deptDistribution[emp.dept].present++;
                if (emp.isLate) deptDistribution[emp.dept].late++;
            }
        });
        const formattedDeptData = Object.keys(deptDistribution).map((dept)=>({
                name: dept,
                total: deptDistribution[dept].total,
                present: deptDistribution[dept].present,
                late: deptDistribution[dept].late
            }));
        // 전체 직원 리스트 정렬본
        const allEmployeesList = Array.from(allEmployeesMap.values()).map((emp)=>{
            const todayStr = getLocalDateString(now);
            const baseSchedulePair = getSchedulePairForDate(emp.empNo, emp.dept, todayStr);
            const baseScheduleTime = baseSchedulePair.start;
            const baseScheduleEndTime = baseSchedulePair.end;
            const scheduleTime = resolveScheduleTimeForDate(emp.empNo, emp.dept, todayStr);
            return {
                ...emp,
                baseScheduleTime,
                baseScheduleEndTime,
                scheduleTime
            };
        }).sort((a, b)=>a.name.localeCompare(b.name));
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
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
                attendanceRate: totalEmployeesCount > 0 ? Math.round(presentCount / totalEmployeesCount * 100) : 0
            },
            weeklyTrend,
            deptData: formattedDeptData,
            employeeStatuses: employeeStatuses.sort((a, b)=>{
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
            recentLogs: logs.slice(0, 15).map((log)=>({
                    ...log,
                    timeOnly: log.logTime.split(' ')[1].substring(0, 5),
                    dateOnly: log.logTime.split(' ')[0].substring(5, 10).replace('-', '/')
                })),
            allLogs: logs,
            allEmployees: allEmployeesList,
            leaves: leaves,
            corrections,
            overrides,
            manualCheckins,
            overtimeSettings
        });
    } catch (err) {
        console.error('API attendance error:', err);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: false,
            error: err.message
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0~lyj_p._.js.map