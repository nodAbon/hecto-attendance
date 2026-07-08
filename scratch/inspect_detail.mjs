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

const normalizeDeptLoose = (value = '') => String(value || '').trim().replace(/\s+/g, '');
const isNightTeamDept = (dept = '') => ['보안운영팀', '인프라보안팀'].some((d) => normalizeDeptLoose(dept).includes(d));
const isOvertimeTeamDept = (dept = '') => ['사업개발팀', '사업관리1팀', '사업관리2팀', '사업관리3팀'].some((d) => normalizeDeptLoose(dept).includes(d));

const getEarlyMorningCarryoverCutoffMinutes = (dept) => {
  const normalized = normalizeDeptLoose(dept);
  if (isNightTeamDept(normalized)) return 9 * 60;
  if (isOvertimeTeamDept(normalized)) return 6 * 60;
  return null;
};

const isOvernightSchedule = (schedule) =>
  !!schedule?.start && !!schedule?.end && toMinutes(schedule.end) <= toMinutes(schedule.start);

const getWorkWindowForDate = (workDate, schedule) => {
  if (!schedule?.start || !schedule?.end) {
    return null;
  }
  const start = new Date(`${workDate}T${normalizeTime(schedule.start, '08:00')}:00+09:00`);
  const end = new Date(`${workDate}T${normalizeTime(schedule.end, '17:00')}:00+09:00`);
  const overnight = toMinutes(schedule.end) <= toMinutes(schedule.start);
  if (overnight) {
    end.setDate(end.getDate() + 1);
  }
  return {
    start: new Date(start.getTime() - (overnight ? 3 : 0) * 60 * 60 * 1000),
    end: new Date(end.getTime() + 5 * 60 * 60 * 1000)
  };
};

const isLogWithinWindow = (logTime, workDate, schedule) => {
  const timestamp = new Date(`${String(logTime || '').replace(' ', 'T')}+09:00`).getTime();
  const window = getWorkWindowForDate(workDate, schedule);
  if (!window) return false;
  return timestamp >= window.start.getTime() && timestamp <= window.end.getTime();
};

const getWorkOrder = (logTime, schedule) => {
  const timeOnly = String(logTime || '').split(' ')[1] || '00:00:00';
  const minutes = toMinutes(timeOnly);
  if (!schedule || !schedule.end || toMinutes(schedule.end) > toMinutes(schedule.start)) {
    return minutes;
  }
  const hour = Math.floor(minutes / 60);
  if (hour >= 12) {
    return minutes;
  }
  return minutes + 24 * 60;
};

async function inspectDetail(name) {
  const empList = await supabaseFetch(`sa_employees?select=*&name=eq.${encodeURIComponent(name)}`);
  if (!empList || empList.length === 0) {
    console.log(`${name} not found`);
    return;
  }
  const emp = empList[0];
  console.log(`\n================= INSPECTING DETAILS FOR ${emp.name} (Dept: ${emp.dept}) =================`);

  const rounds = await supabaseFetch(`sa_employee_overtime_rounds?select=*&emp_no=eq.${emp.emp_no}`);
  if (!rounds || rounds.length === 0) return;
  const round = rounds[0];
  const startDate = round.start_date;
  const endDate = round.end_date;

  const logsRaw = await supabaseFetch(`sa_attendance?select=*&emp_no=eq.${emp.emp_no}&log_time=gte.${encodeURIComponent(startDate + 'T00:00:00+09:00')}&log_time=lte.${encodeURIComponent(endDate + 'T23:59:59+09:00')}`);
  const overrides = await supabaseFetch(`sa_schedule_overrides?select=*&emp_no=eq.${emp.emp_no}&work_date=gte.${startDate}&work_date=lte.${endDate}`);
  const corrections = await supabaseFetch(`sa_attendance_log_adjustments?select=*&emp_no=eq.${emp.emp_no}&work_date=gte.${startDate}&work_date=lte.${endDate}`);
  const patterns = await supabaseFetch(`sa_team_schedule_patterns?select=*&work_date=gte.${startDate}&work_date=lte.${endDate}`);
  const leaves = await supabaseFetch(`sa_leaves?select=*&emp_no=eq.${emp.emp_no}&status=eq.40`);

  const overrideMap = new Map();
  overrides.forEach((o) => {
    overrideMap.set(`${emp.emp_no}_${o.work_date}`, o);
  });
  const teamPatternMap = new Map();
  patterns.forEach((p) => {
    teamPatternMap.set(`${normalizeDeptLoose(p.dept_name)}_${p.work_date}`, p);
  });
  const employeeSchedulesRaw = await supabaseFetch(`sa_employee_schedules?select=*`);
  const employeeScheduleMap = new Map();
  employeeSchedulesRaw.forEach((row) => {
    const start = normalizeScheduleTime(row.schedule_time || '08:00', '08:00');
    const end = normalizeScheduleTime(row.schedule_end_time || '', '');
    employeeScheduleMap.set(String(row.emp_no || '').trim(), { start, end });
  });
  console.log('employeeScheduleMap keys:', Array.from(employeeScheduleMap.keys()));
  console.log('target emp_no:', emp.emp_no);

  const getSchedulePairForDateLocal = (empNo, dept, dateStr) => {
    const override = overrideMap.get(`${empNo}_${dateStr}`) || null;
    const teamPattern = teamPatternMap.get(`${normalizeDeptLoose(dept)}_${dateStr}`) || null;
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

  const assignWorkDateForLog = (log) => {
    const actualDate = String(log.log_time || '').split('T')[0];
    if (!actualDate) return null;
    const cutoffMinutes = getEarlyMorningCarryoverCutoffMinutes(emp.dept);
    if (cutoffMinutes !== null) {
      const timeOnly = String(log.log_time || '').split('T')[1]?.substring(0, 8) || '00:00:00';
      if (toMinutes(timeOnly) < cutoffMinutes) {
        const d = new Date(`${actualDate}T00:00:00+09:00`);
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
      }
    }
    const dPrev = new Date(`${actualDate}T00:00:00+09:00`);
    dPrev.setDate(dPrev.getDate() - 1);
    const prevDate = dPrev.toISOString().split('T')[0];
    const prevSchedule = getSchedulePairForDateLocal(emp.emp_no, emp.dept, prevDate);
    if (isOvernightSchedule(prevSchedule) && isLogWithinWindow(log.log_time, prevDate, prevSchedule)) {
      return prevDate;
    }
    const currentSchedule = getSchedulePairForDateLocal(emp.emp_no, emp.dept, actualDate);
    if (isOvernightSchedule(currentSchedule) && isLogWithinWindow(log.log_time, actualDate, currentSchedule)) {
      return actualDate;
    }
    return actualDate;
  };

  const baseLogs = logsRaw.map((log) => {
    const formattedLogTime = String(log.log_time).replace('T', ' ').substring(0, 19);
    const logWithFormattedTime = { ...log, logTime: formattedLogTime, empNo: log.emp_no };
    const actualDate = formattedLogTime.split(' ')[0];
    const workDate = assignWorkDateForLog(logWithFormattedTime);
    const schedulePair = getSchedulePairForDateLocal(emp.emp_no, emp.dept, workDate || actualDate);
    
    const roleText = String(log.adjusted_role || '').trim().toLowerCase();
    const isIgnored = roleText.includes('무시') || roleText.includes('ignore');
    const isAdjustedCheckout = Boolean(log.is_adjusted_checkout) || roleText.includes('퇴') || roleText.includes('checkout');
    const isAdjustedCheckin = Boolean(log.is_adjusted_checkin) || roleText.includes('출') || roleText.includes('checkin');
    const scheduledWorkOrder = getWorkOrder(formattedLogTime, schedulePair);
    const savedWorkOrder = Number.isFinite(Number(log.work_order)) ? Number(log.work_order) : null;
    const carriedOverFromNextDay = Boolean(workDate && actualDate && workDate !== actualDate);
    const needsCarryoverSortOffset = carriedOverFromNextDay && !isOvernightSchedule(schedulePair);
    const workOrder = isAdjustedCheckout || isAdjustedCheckin
      ? savedWorkOrder ?? (isAdjustedCheckout ? scheduledWorkOrder + 24 * 60 : scheduledWorkOrder - 24 * 60)
      : scheduledWorkOrder + (needsCarryoverSortOffset ? 24 * 60 : 0);

    return { ...logWithFormattedTime, workDate, workOrder, isAdjustedCheckout, isAdjustedCheckin, isIgnored };
  }).filter((log) => !log.isIgnored);

  const normalizeMonthlyReportLogs = (inputLogs) => {
    return [...(inputLogs || [])]
      .map((log) => {
        const actualDate = String(log.logTime || '').split(' ')[0];
        const timeOnly = String(log.logTime || '').split(' ')[1] || '00:00:00';
        const minutes = toMinutes(timeOnly);
        const workDate = log.workDate || actualDate;
        const workOrder = Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : minutes;
        return { ...log, workDate, workOrder };
      })
      .sort((a, b) => b.logTime.localeCompare(a.logTime));
  };

  const allRawLogs = normalizeMonthlyReportLogs(baseLogs);
  const logsByEmpAndDate = {};
  allRawLogs.forEach((log) => {
    const dateStr = log.workDate;
    if (!logsByEmpAndDate[log.empNo]) logsByEmpAndDate[log.empNo] = {};
    if (!logsByEmpAndDate[log.empNo][dateStr]) logsByEmpAndDate[log.empNo][dateStr] = [];
    logsByEmpAndDate[log.empNo][dateStr].push(log);
  });

  const filteredLogs = [];
  const todayStr = new Date().toISOString().split('T')[0];
  Object.keys(logsByEmpAndDate).forEach((empNo) => {
    const dateMap = logsByEmpAndDate[empNo];
    Object.keys(dateMap).forEach((dateStr) => {
      const dayLogs = dateMap[dateStr];
      const sortedDayLogs = dayLogs.sort((a, b) => (a.workOrder ?? 0) - (b.workOrder ?? 0) || a.logTime.localeCompare(b.logTime));
      if (dateStr === todayStr || sortedDayLogs.length <= 1) {
        filteredLogs.push(...sortedDayLogs);
      } else {
        const first = sortedDayLogs[0];
        const last = sortedDayLogs[sortedDayLogs.length - 1];
        filteredLogs.push(first);
        if (last.id !== first.id) filteredLogs.push(last);
      }
    });
  });

  const dailyLogs = {};
  filteredLogs.forEach((log) => {
    if (log.workDate >= startDate && log.workDate <= endDate) {
      if (!dailyLogs[log.workDate]) dailyLogs[log.workDate] = [];
      dailyLogs[log.workDate].push(log);
    }
  });

  const correctionMap = new Map();
  corrections.forEach((c) => {
    correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time);
  });

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  console.log(`Date | Schedule | Overrides/Note | Leaves | logsCount | diffC (No Deduct)`);
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const dateStr = day.toISOString().split('T')[0];
    const override = overrideMap.get(`${emp.emp_no}_${dateStr}`);
    const teamPattern = teamPatternMap.get(`${normalizeDeptLoose(emp.dept)}_${dateStr}`) || null;

    const schedulePair = getSchedulePairForDateLocal(emp.emp_no, emp.dept, dateStr);

    const dateCompat = dateStr.replace(/-/g, '');
    const dayLeave = leaves.find((l) => {
      const leaveEmpNo = String(l.emp_no || '').trim();
      return leaveEmpNo === String(emp.emp_no).trim() && dateCompat >= String(l.start_date || '') && dateCompat <= String(l.end_date || '');
    });

    const isWeekend = isWeekendDate(dateStr);
    const dayLogs = (dailyLogs[dateStr] || []);

    const allowOvertime = isOvertimeTeamDept(emp.dept)
      ? resolveAllowOvertimeForSchedule({
          resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
          override,
          fallbackAllowOvertime: schedulePair?.start === '10:00' && schedulePair?.end === '19:00',
        })
      : false;

    let overtimeMinutes = 0;
    let outTime = null;
    if (allowOvertime && dayLogs.length > 0) {
      const sortedDayLogs = dayLogs.sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
      });
      const firstLog = sortedDayLogs[0];
      const correctedOut = correctionMap.get(`${emp.emp_no}_${dateStr}`);

      if (correctedOut) {
        outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
      } else if (sortedDayLogs.length >= 2 && firstLog) {
        const lastLog = sortedDayLogs[sortedDayLogs.length - 1];
        if (lastLog && lastLog.logTime !== firstLog.logTime) {
          outTime = String(lastLog.logTime).split(' ')[1]?.substring(0, 5) || '';
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

    let diffC = 0;
    if (schedulePair) {
      const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
      const scheduleDeviation = scheduleMinutes - 480;
      diffC = (scheduleDeviation + overtimeMinutes);
    }

    const note = override ? (override.removed ? 'REMOVED' : `${override.scheduleStart}-${override.scheduleEnd} (${override.note || ''})`) : '-';
    const leaveText = dayLeave ? `LEAVE:${dayLeave.leave_code}` : '-';

    if (!isWeekend) {
      console.log(`${dateStr} | ${schedulePair ? `${schedulePair.start}-${schedulePair.end}` : 'NoSched'} | ${note} | ${leaveText} | logs: ${dayLogs.length} (out: ${outTime || '-'}) | diffC: ${diffC}`);
    }
  }
}

async function main() {
  await inspectDetail('윤현필');
}

main().catch(console.error);
