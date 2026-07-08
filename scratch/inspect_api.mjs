import fs from 'node:fs';

const envText = fs.readFileSync('c:/Users/Owner/Documents/Antigravity/agitated-raman/.env.local', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseFetch = async (path) => {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
};

const toMinutes = (timeStr = '') => {
  const [h = 0, m = 0] = String(timeStr).split(':').map(Number);
  return h * 60 + m;
};

const getScheduleDurationMinutes = (start, end) => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e < s) return (e + 24 * 60) - s;
  return e - s;
};

const getAdjustmentMinutes = ({ scheduleEnd = '', actualOut = '' } = {}) => {
  const sEnd = toMinutes(scheduleEnd);
  const aOut = toMinutes(actualOut);
  let adjustedOut = aOut;
  if (aOut < 6 * 60) {
    adjustedOut += 24 * 60;
  }
  if (adjustedOut <= sEnd) return 0;
  return adjustedOut - sEnd;
};

const clampToHalfHourSteps = (minutes = 0) => {
  const steps = Math.floor(minutes / 30);
  return steps * 30;
};

const isWeekendDate = (dateStr = '') => {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const normalizeTime = (value = '', fallback = '') => {
  const text = String(value || fallback || '').trim();
  if (!text) return fallback;
  return text.length >= 5 ? text.substring(0, 5) : fallback;
};

const normalizeScheduleTime = (value = '', fallback = '') => {
  return normalizeTime(value, fallback);
};

const inferScheduleEndTime = (startStr = '', deptName = '') => {
  const cleanDept = String(deptName || '').replace(/\s+/g, '');
  const startMin = toMinutes(startStr);
  const isShortTeam = ['사업개발팀', '사업관리1팀', '사업관리2팀', '사업관리3팀'].some(
    d => cleanDept.includes(d)
  );
  if (isShortTeam) {
    if (startStr === '09:30') return '18:30';
    if (startStr === '10:00') return '19:00';
    return formatTimePart(startMin + 9 * 60);
  }
  const isNightTeam = ['보안운영팀', '인프라보안팀'].some(d => cleanDept.includes(d));
  if (isNightTeam) {
    if (startStr === '18:00') return '09:00';
    if (startStr === '22:00') return '09:00';
  }
  return formatTimePart(startMin + 9 * 60);
};

const formatTimePart = (minutes = 0) => {
  const m = minutes % (24 * 60);
  const hour = Math.floor(m / 60);
  const min = m % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const resolveSchedulePairForDate = ({
  dept = '',
  dateStr = '',
  baseScheduleStart = '',
  baseScheduleEnd = '',
  override = null,
  teamPattern = null,
} = {}) => {
  if (override?.removed) return null;
  if (override?.scheduleStart) {
    const start = normalizeScheduleTime(override.scheduleStart, '08:00');
    const inferredEnd = inferScheduleEndTime(start, dept) || '';
    const end = normalizeScheduleTime(override.scheduleEnd || inferredEnd, inferredEnd);
    return { start, end, source: 'override' };
  }
  if (isWeekendDate(dateStr)) return null;
  if (teamPattern?.scheduleStart) {
    const patternStart = normalizeScheduleTime(teamPattern.scheduleStart, '08:00');
    const inferredEnd = inferScheduleEndTime(patternStart, dept) || '';
    const patternEnd = normalizeScheduleTime(teamPattern.scheduleEnd || inferredEnd, inferredEnd);
    return { start: patternStart, end: patternEnd, source: 'team-pattern' };
  }
  const cleanDept = String(dept || '').replace(/\s+/g, '');
  const isExternalTeam = ['오프라인사업팀', '기획팀'].some(d => cleanDept.includes(d));
  const defaultStart = isExternalTeam ? '08:00' : '';
  const start = normalizeScheduleTime(baseScheduleStart, defaultStart);
  if (start) {
    const end = normalizeScheduleTime(baseScheduleEnd || inferScheduleEndTime(start, dept) || '', '');
    if (!end) return null;
    return { start, end, source: 'base' };
  }
  return null;
};

const resolveAllowOvertimeForSchedule = ({
  resolvedSchedule = null,
  override = null,
  fallbackAllowOvertime = false,
} = {}) => {
  if (!resolvedSchedule) return null;
  if (override?.removed) return null;
  if (override) {
    return Boolean(override.allowOvertime ?? override.allow_overtime);
  }
  return Boolean(fallbackAllowOvertime);
};

const buildPeriodMonthList = (startStr, endStr) => {
  const months = [];
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  let current = new Date(start);
  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const key = `${y}-${m}`;
    if (!months.includes(key)) months.push(key);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
};

async function testFor(name) {
  const empList = await supabaseFetch(`sa_employees?select=*&name=eq.${encodeURIComponent(name)}`);
  if (!empList || empList.length === 0) {
    console.log(`${name} not found`);
    return;
  }
  const emp = empList[0];
  console.log(`\n================= API TEST FOR ${emp.name} (Dept: ${emp.dept}) =================`);

  const rounds = await supabaseFetch(`sa_employee_overtime_rounds?select=*&emp_no=eq.${emp.emp_no}`);
  if (!rounds || rounds.length === 0) return;
  const round = rounds[0];
  const startDate = round.start_date;
  const endDate = round.end_date;

  const roundMonths = buildPeriodMonthList(startDate, endDate);

  // Fetch all months from local API
  const allLogs = [];
  const allLeaves = [];
  const allCorrections = [];
  const allOverrides = [];
  const allPatterns = [];

  for (const m of roundMonths) {
    const res = await fetch(`http://localhost:3000/api/attendance?month=${m}&empNo=${emp.emp_no}`);
    const json = await res.json();
    if (json.success) {
      if (json.allLogs) allLogs.push(...json.allLogs);
      if (json.leaves) allLeaves.push(...json.leaves);
      if (json.corrections) allCorrections.push(...json.corrections);
      if (json.overrides) allOverrides.push(...json.overrides);
      if (json.teamSchedulePatterns) allPatterns.push(...json.teamSchedulePatterns);
    }
  }

  // Build maps
  const overrideMap = new Map();
  allOverrides.forEach((row) => {
    const workDate = String(row.work_date || row.workDate || '').trim();
    const allowOvertime = Boolean(row.allow_overtime ?? row.allowOvertime);
    overrideMap.set(`${emp.emp_no}_${workDate}`, {
      scheduleStart: normalizeScheduleTime(row.schedule_start || row.scheduleStart || '', ''),
      scheduleEnd: normalizeScheduleTime(row.schedule_end || row.scheduleEnd || '', ''),
      allowOvertime,
      note: row.note || '',
      removed: row.note === '__SCHEDULE_REMOVED__'
    });
  });

  const teamPatternMap = new Map();
  allPatterns.forEach((row) => {
    const deptName = String(row.dept_name || row.deptName || '').trim().replace(/\s+/g, '');
    const workDate = String(row.work_date || row.workDate || '').trim();
    teamPatternMap.set(`${deptName}_${workDate}`, {
      scheduleStart: normalizeScheduleTime(row.schedule_start || row.scheduleStart || '', ''),
      scheduleEnd: normalizeScheduleTime(row.schedule_end || row.scheduleEnd || '', '')
    });
  });

  const employeeScheduleMap = new Map();
  // Fetch employee schedule from DB
  const { data: dbScheds } = await supabaseFetch(`sa_employee_schedules?select=*&emp_no=eq.${emp.emp_no}`);
  if (dbScheds && dbScheds.length > 0) {
    const row = dbScheds[0];
    employeeScheduleMap.set(emp.emp_no, {
      start: normalizeScheduleTime(row.schedule_time || '08:00', '08:00'),
      end: normalizeScheduleTime(row.schedule_end_time || '', '')
    });
  }

  const correctionMap = new Map();
  allCorrections.forEach((c) => {
    correctionMap.set(`${emp.emp_no}_${c.work_date}`, c.corrected_out_time);
  });

  const dailyLogs = {};
  allLogs.forEach((log) => {
    if (log.workDate >= startDate && log.workDate <= endDate) {
      if (!dailyLogs[log.workDate]) dailyLogs[log.workDate] = [];
      dailyLogs[log.workDate].push(log);
    }
  });

  const getSchedulePairForDateLocal = (empNo, dept, dateStr) => {
    const override = overrideMap.get(`${empNo}_${dateStr}`) || null;
    const teamPattern = teamPatternMap.get(`${String(dept).replace(/\s+/g, '')}_${dateStr}`) || null;
    const baseSchedule = employeeScheduleMap.get(empNo) || {};
    return resolveSchedulePairForDate({
      dept,
      dateStr,
      baseScheduleStart: baseSchedule.start || '08:00',
      baseScheduleEnd: baseSchedule.end || '',
      override,
      teamPattern,
    });
  };

  const isManagedDept = true;

  // Simulate frontend loop
  const runLoop = (simTodayStr, rule) => {
    let totalAdjustmentMinutes = 0;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const dateStr = day.toISOString().split('T')[0];
      if (simTodayStr && dateStr > simTodayStr) {
        continue;
      }

      const override = overrideMap.get(`${emp.emp_no}_${dateStr}`) || null;
      const schedulePair = getSchedulePairForDateLocal(emp.emp_no, emp.dept, dateStr);

      const dateCompat = dateStr.replace(/-/g, '');
      const dayLeave = allLeaves.find((l) => {
        const leaveEmpNo = String(l.empNo || l.emp_no || '').trim();
        return leaveEmpNo === String(emp.emp_no).trim() && dateCompat >= String(l.startDate || l.start_date || '') && dateCompat <= String(l.endDate || l.end_date || '');
      });

      const isWeekend = isWeekendDate(dateStr);
      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
      });

      if (!schedulePair) {
        if (rule === 'A' || rule === 'B') {
          if (!isWeekend) {
            totalAdjustmentMinutes += -480;
          }
        }
        continue;
      }

      const allowOvertime = isManagedDept
        ? resolveAllowOvertimeForSchedule({
            resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
            override,
            fallbackAllowOvertime: schedulePair?.start === '10:00' && schedulePair?.end === '19:00',
          })
        : false;

      // Check if they didn't work (no logs)
      if (!isWeekend && dayLogs.length === 0) {
        if (!dayLeave) {
          if (rule === 'A' || rule === 'B') {
            totalAdjustmentMinutes += -480;
          }
        }
        continue;
      }

      const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
      const scheduleDeviation = scheduleMinutes - 480;

      let overtimeMinutes = 0;
      if (allowOvertime && dayLogs.length > 0) {
        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${emp.emp_no}_${dateStr}`);
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = lastLog.logTime ? lastLog.logTime.split(' ')[1]?.substring(0, 5) : '';
          }
        }

        if (outTime) {
          const rawOvertime = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          overtimeMinutes = clampToHalfHourSteps(rawOvertime);
        }
      }

      totalAdjustmentMinutes += (scheduleDeviation + overtimeMinutes);
    }

    return Math.round((totalAdjustmentMinutes / 60) * 2) / 2;
  };

  // Simulate old formula (weekly average deviation)
  const runOldFormula = (simTodayStr) => {
    const start = new Date(`2026-06-01T00:00:00Z`);
    const end = new Date(`2026-06-26T00:00:00Z`);

    const dayTotals = new Map();

    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const dateStr = day.toISOString().split('T')[0];

      const override = overrideMap.get(`${emp.emp_no}_${dateStr}`) || null;
      const schedulePair = getSchedulePairForDateLocal(emp.emp_no, emp.dept, dateStr);

      const dateCompat = dateStr.replace(/-/g, '');
      const dayLeave = allLeaves.find((l) => {
        const leaveEmpNo = String(l.empNo || l.emp_no || '').trim();
        return leaveEmpNo === String(emp.emp_no).trim() && dateCompat >= String(l.startDate || l.start_date || '') && dateCompat <= String(l.endDate || l.end_date || '');
      });

      const leaveWorkedMinutes = dayLeave ? getLeaveWorkedMinutes(dayLeave) : 0;
      const isWeekend = isWeekendDate(dateStr);
      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
      });

      const allowOvertime = isManagedDept
        ? resolveAllowOvertimeForSchedule({
            resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
            override,
            fallbackAllowOvertime: schedulePair?.start === '10:00' && schedulePair?.end === '19:00',
          })
        : false;

      const scheduleMinutes = schedulePair
        ? Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60)
        : 0;

      let dayTotalMinutes = 0;
      if (schedulePair) {
        dayTotalMinutes = scheduleMinutes;

        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${emp.emp_no}_${dateStr}`);
        const inTime = firstLog ? firstLog.logTime.split(' ')[1]?.substring(0, 5) : '';
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = lastLog.logTime ? lastLog.logTime.split(' ')[1]?.substring(0, 5) : '';
          }
        }

        if (inTime && outTime && allowOvertime) {
          const overtimeMinutes = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          dayTotalMinutes += clampToHalfHourSteps(overtimeMinutes);
        }

        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      } else {
        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      }

      dayTotals.set(dateStr, dayTotalMinutes);
      if (emp.name === '윤현필') {
        console.log(`  ${dateStr} | Sched: ${schedulePair ? `${schedulePair.start}-${schedulePair.end}` : 'None'} | logs: ${dayLogs.length} | leave: ${leaveWorkedMinutes} | totalMin: ${dayTotalMinutes}`);
      }
    }

    // Build weekly totals
    const weeklyTotalsMap = new Map();
    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const dateStr = day.toISOString().split('T')[0];
      const weekKey = getYearWeekStartKey(dateStr);
      weeklyTotalsMap.set(weekKey, Number(weeklyTotalsMap.get(weekKey) || 0) + Number(dayTotals.get(dateStr) || 0));
    }

    const weeklyTotals = Array.from(weeklyTotalsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, minutes]) => Number(minutes || 0));

    const totalWorkMinutes = weeklyTotals.reduce((sum, minutes) => sum + minutes, 0);
    const averageWeeklyMinutes = weeklyTotals.length > 0
      ? totalWorkMinutes / weeklyTotals.length
      : 0;

    const residualBaseMinutes = totalWorkMinutes - (40 * 60 * weeklyTotals.length);
    const residualMinutes = residualBaseMinutes === 0
      ? 0
      : Math.sign(residualBaseMinutes) * clampToHalfHourSteps(Math.abs(residualBaseMinutes));

    return residualMinutes / 60;
  };

  const getLeaveWorkedMinutes = (leave) => {
    if (!leave) return 0;
    const leaveDays = parseFloat(leave.leaveDays || leave.leave_days || '0');
    const leaveCode = leave.leaveCode || leave.leave_code;
    if (leaveCode === '12' || leaveCode === '60' || leaveDays >= 1.0) return 8 * 60;
    if (leaveCode === '16' || leaveCode === '17' || leaveCode === '61' || leaveCode === '62' || leaveDays === 0.5) return 4 * 60;
    return 2 * 60;
  };

  const getYearWeekStartKey = (dateStr) => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    // Find Sunday of the week
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day;
    const sunday = new Date(date);
    sunday.setUTCDate(diff);
    return sunday.toISOString().split('T')[0];
  };

  // Simulate the exact old scenario before the timeout fix
  const runExactOldScenario = () => {
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    const dayTotals = new Map();

    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const dateStr = day.toISOString().split('T')[0];
      
      // Before the fix, only June (2026-06-01 to 2026-06-30) data was loaded!
      const isJune = dateStr.startsWith('2026-06');
      
      const override = isJune ? (overrideMap.get(`${emp.emp_no}_${dateStr}`) || null) : null;
      const teamPattern = isJune ? (teamPatternMap.get(`${String(emp.dept).replace(/\s+/g, '')}_${dateStr}`) || null) : null;
      const schedulePair = resolveSchedulePairForDate({
        dept: emp.dept,
        dateStr,
        baseScheduleStart: employeeScheduleMap.get(emp.emp_no)?.start || '08:00',
        baseScheduleEnd: employeeScheduleMap.get(emp.emp_no)?.end || '',
        override,
        teamPattern,
      });

      const dateCompat = dateStr.replace(/-/g, '');
      const dayLeave = isJune ? allLeaves.find((l) => {
        const leaveEmpNo = String(l.empNo || l.emp_no || '').trim();
        return leaveEmpNo === String(emp.emp_no).trim() && dateCompat >= String(l.startDate || l.start_date || '') && dateCompat <= String(l.endDate || l.end_date || '');
      }) : null;

      const leaveWorkedMinutes = dayLeave ? getLeaveWorkedMinutes(dayLeave) : 0;
      const dayLogs = isJune ? (dailyLogs[dateStr] || []) : [];

      const allowOvertime = isManagedDept
        ? resolveAllowOvertimeForSchedule({
            resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
            override,
            fallbackAllowOvertime: schedulePair?.start === '10:00' && schedulePair?.end === '19:00',
          })
        : false;

      const scheduleMinutes = schedulePair
        ? Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60)
        : 0;

      let dayTotalMinutes = 0;
      if (schedulePair) {
        dayTotalMinutes = scheduleMinutes;

        const firstLog = dayLogs[0];
        const correctedOut = isJune ? correctionMap.get(`${emp.emp_no}_${dateStr}`) : null;
        const inTime = firstLog ? firstLog.logTime.split(' ')[1]?.substring(0, 5) : '';
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = lastLog.logTime ? lastLog.logTime.split(' ')[1]?.substring(0, 5) : '';
          }
        }

        if (inTime && outTime && allowOvertime) {
          const overtimeMinutes = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          dayTotalMinutes += clampToHalfHourSteps(overtimeMinutes);
        }

        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      } else {
        dayTotalMinutes = Math.min(24 * 60, dayTotalMinutes + leaveWorkedMinutes);
      }

      dayTotals.set(dateStr, dayTotalMinutes);
    }

    // Build weekly totals
    const weeklyTotalsMap = new Map();
    for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const dateStr = day.toISOString().split('T')[0];
      const weekKey = getYearWeekStartKey(dateStr);
      weeklyTotalsMap.set(weekKey, Number(weeklyTotalsMap.get(weekKey) || 0) + Number(dayTotals.get(dateStr) || 0));
    }

    const weeklyTotals = Array.from(weeklyTotalsMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, minutes]) => Number(minutes || 0));

    const totalWorkMinutes = weeklyTotals.reduce((sum, minutes) => sum + minutes, 0);
    const averageWeeklyMinutes = weeklyTotals.length > 0
      ? totalWorkMinutes / weeklyTotals.length
      : 0;

    const residualBaseMinutes = totalWorkMinutes - (40 * 60 * weeklyTotals.length);
    const residualMinutes = residualBaseMinutes === 0
      ? 0
      : Math.sign(residualBaseMinutes) * clampToHalfHourSteps(Math.abs(residualBaseMinutes));

    return residualMinutes / 60;
  };



  console.log('June Only:');
  console.log(`- Rule A/B: ${runLoop('2026-06-26', 'A')} (Deducts on empty days)`);
  console.log(`- Rule C  : ${runLoop('2026-06-26', 'C')} (No deduct)`);
  console.log(`- Old Formula: ${runOldFormula('2026-06-26')}`);
  console.log('All Period (up to today 2026-06-25):');
  console.log(`- Rule A/B: ${runLoop('2026-06-25', 'A')} (Deducts on empty days)`);
  console.log(`- Rule C  : ${runLoop('2026-06-25', 'C')} (No deduct)`);
  console.log(`- Old Formula: ${runOldFormula('2026-06-25')}`);
  console.log('All Period (full round including future):');
  console.log(`- Rule A/B: ${runLoop(null, 'A')} (Deducts on empty days)`);
  console.log(`- Rule C  : ${runLoop(null, 'C')} (No deduct)`);
  console.log(`- Old Formula: ${runOldFormula(null)}`);
  console.log(`- Exact Old Scenario (June loaded, past blank): ${runExactOldScenario()}`);
}

async function main() {
  await testFor('윤현필');
  await testFor('이동규');
}

main().catch(console.error);
