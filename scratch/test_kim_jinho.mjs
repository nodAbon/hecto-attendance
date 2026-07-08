import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드
const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const idx = line.indexOf('=');
  const key = line.slice(0, idx).trim();
  let value = line.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 김진호 직원 조회
const { data: employees, error: empErr } = await supabase
  .from('sa_employees')
  .select('*')
  .eq('name', '김진호')
  .limit(1);

if (empErr || !employees?.length) {
  console.error('Failed to fetch employee Kim Jinho:', empErr);
  process.exit(1);
}

const emp = employees[0];
const empNo = emp.emp_no;
console.log(`Found Employee: ${emp.name} (${empNo}), Dept: ${emp.dept}`);

// 2026-04-01 ~ 2026-06-26 기간의 차수 정보 조회
const { data: rounds, error: roundErr } = await supabase
  .from('sa_employee_overtime_rounds')
  .select('*')
  .eq('emp_no', empNo)
  .limit(1);

let startDate = '2026-04-01';
let endDate = '2026-06-26';
console.log(`Forced Period for testing: ${startDate} ~ ${endDate}`);

// 해당 기간의 오버라이드 조회
const { data: overrides, error: ovrErr } = await supabase
  .from('sa_schedule_overrides')
  .select('*')
  .eq('emp_no', empNo)
  .gte('work_date', startDate)
  .lte('work_date', endDate);

if (ovrErr) {
  console.error('Overrides load error:', ovrErr);
}

// 팀 일정 패턴 조회 (공백 제거하여 조회 및 디버깅용 전체 조회)
const normalizedDeptName = String(emp.dept || '').trim().replace(/\s+/g, '');
const { data: teamPatterns, error: tpErr } = await supabase
  .from('sa_team_schedule_patterns')
  .select('*')
  .in('dept_name', [emp.dept, normalizedDeptName])
  .gte('work_date', startDate)
  .lte('work_date', endDate);

if (tpErr) {
  console.error('Team patterns load error:', tpErr);
}

const { data: allPatterns } = await supabase
  .from('sa_team_schedule_patterns')
  .select('dept_name');
const uniqueDepts = [...new Set(allPatterns?.map(p => p.dept_name) || [])];
console.log('Unique dept_names in sa_team_schedule_patterns:', uniqueDepts);

// 해당 기간의 출퇴근 보정 조회
const { data: corrections, error: corrErr } = await supabase
  .from('sa_attendance_corrections')
  .select('*')
  .eq('emp_no', empNo)
  .gte('work_date', startDate)
  .lte('work_date', endDate);

if (corrErr) {
  console.error('Corrections load error:', corrErr);
}

// 해당 기간의 출입로그 조회
const { data: logs, error: logErr } = await supabase
  .from('sa_attendance')
  .select('id, emp_no, log_time, gate_name, event_type')
  .eq('emp_no', empNo)
  .gte('log_time', `${startDate}T00:00:00+09:00`)
  .lte('log_time', `${endDate}T23:59:59+09:00`);

if (logErr) {
  console.error('Logs load error:', logErr);
}

console.log(`Loaded ${overrides?.length || 0} overrides, ${teamPatterns?.length || 0} team patterns, ${corrections?.length || 0} corrections, ${logs?.length || 0} logs.`);
if (logs?.length) {
  console.log('Sample Log Date Format:', logs[0]);
}

// 헬퍼 함수 정의
const toMinutes = (value = '') => {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const getScheduleDurationMinutes = (start = '', end = '') => {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  let duration = endMinutes - startMinutes;
  if (duration < 0) duration += 24 * 60;
  return Math.max(0, duration);
};

const getAdjustmentMinutes = ({ scheduleEnd = '', actualOut = '' } = {}) => {
  const endMinutes = toMinutes(scheduleEnd);
  const outMinutes = toMinutes(actualOut);
  if (!Number.isFinite(endMinutes) || !Number.isFinite(outMinutes)) return 0;
  if (outMinutes <= endMinutes) return 0;
  return outMinutes - endMinutes;
};

const clampToHalfHourSteps = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  return Math.floor(safeMinutes / 30) * 30;
};

// 캘린더 계산 시뮬레이션 (로컬 함수로 구현)
const buildScheduleOverrideMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const empNo = String(row?.emp_no || row?.empNo || '').replace(/\D/g, '').replace(/^0+/, '');
    const workDate = String(row?.work_date || row?.workDate || '').trim();
    if (!empNo || !workDate) return;
    const note = String(row?.note || '').trim();
    const allowOvertime = Boolean(row?.allow_overtime ?? row?.allowOvertime);
    map.set(`${empNo}_${workDate}`, {
      scheduleStart: row?.schedule_start || row?.scheduleStart || '',
      scheduleEnd: row?.schedule_end || row?.scheduleEnd || '',
      allowOvertime,
      note,
      removed: note === '__SCHEDULE_REMOVED__',
    });
  });
  return map;
};

const resolveSchedulePairForDate = ({
  dept = '',
  dateStr = '',
  baseScheduleStart = '',
  baseScheduleEnd = '',
  override = null,
  teamPattern = null,
} = {}) => {
  if (override?.removed) {
    return null;
  }
  if (override?.scheduleStart) {
    const start = override.scheduleStart;
    const end = override.scheduleEnd || '17:00';
    return {
      start,
      end,
      source: 'override',
    };
  }

  if (teamPattern?.scheduleStart) {
    return {
      start: teamPattern.scheduleStart,
      end: teamPattern.scheduleEnd || '17:00',
      source: 'team-pattern',
    };
  }

  // 주말은 캘린더 계산에서 생략(null)
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  const day = date.getDay();
  if (day === 0 || day === 6) return null;

  const start = baseScheduleStart;
  const end = baseScheduleEnd || '17:00';
  return {
    start,
    end,
    source: 'base',
  };
};

const buildTeamSchedulePatternMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const deptName = String(row?.dept_name || row?.deptName || '').trim().replace(/\s+/g, '');
    const workDate = String(row?.work_date || row?.workDate || '').trim();
    if (!deptName || !workDate) return;
    map.set(`${deptName}_${workDate}`, {
      scheduleStart: row?.schedule_start || row?.scheduleStart || '',
      scheduleEnd: row?.schedule_end || row?.scheduleEnd || '',
    });
  });
  return map;
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

const scheduleOverrideMap = buildScheduleOverrideMap(overrides || []);
const teamPatternMap = buildTeamSchedulePatternMap(teamPatterns || []);

const correctionMap = new Map();
(corrections || []).forEach((c) => {
  correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time || c.correctedOutTime);
});

const dailyLogs = {};
(logs || []).forEach((log) => {
  const rawLogTime = log.log_time || log.logTime;
  if (!rawLogTime) return;
  
  const d = new Date(rawLogTime);
  const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
  const logTimeStr = kst.toISOString().replace('T', ' ').substring(0, 19);
  
  const workDate = logTimeStr.split(' ')[0];
  if (!dailyLogs[workDate]) dailyLogs[workDate] = [];
  dailyLogs[workDate].push({
    logTime: logTimeStr,
    workOrder: 0,
  });
});

const getLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00+09:00`);
const toDateOnly = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
};

let totalAdjustmentMinutes = 0;
let totalWorkMinutes = 0;
let scheduledDaysCount = 0;

const start = getLocalDate(startDate);
const end = getLocalDate(endDate);

const baseStart = emp.schedule_time || emp.scheduleTime || '08:00';
const baseEnd = emp.schedule_end_time || emp.scheduleEndTime || '17:00';

console.log(`Base Schedule: ${baseStart} ~ ${baseEnd}`);

for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
  const dateStr = toDateOnly(day);
  const override = scheduleOverrideMap.get(`${empNo}_${dateStr}`);
  const teamPattern = teamPatternMap.get(`${String(emp.dept).replace(/\s+/g, '')}_${dateStr}`) || null;
  
  const schedulePair = resolveSchedulePairForDate({
    dept: emp.dept,
    dateStr,
    baseScheduleStart: baseStart,
    baseScheduleEnd: baseEnd,
    override,
    teamPattern,
  });

  if (!schedulePair) {
    continue;
  }

  scheduledDaysCount++;

  const allowOvertime = resolveAllowOvertimeForSchedule({
    resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
    override,
    fallbackAllowOvertime: schedulePair?.start === '10:00' && schedulePair?.end === '19:00',
  });

  const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => {
    return String(a.logTime || '').localeCompare(String(b.logTime || ''));
  });

  const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
  const scheduleDeviation = scheduleMinutes - 480;

  let overtimeMinutes = 0;
  let outTime = null;
  const firstLog = dayLogs[0];
  const correctedOut = correctionMap.get(`${empNo}_${dateStr}`);

  if (correctedOut) {
    outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
  } else if (dayLogs.length >= 2 && firstLog) {
    const lastLog = dayLogs[dayLogs.length - 1];
    if (lastLog && lastLog.logTime !== firstLog.logTime) {
      outTime = String(lastLog.logTime).split(' ')[1]?.substring(0, 5) || null;
    }
  }

  if (outTime && allowOvertime) {
    const rawOvertime = getAdjustmentMinutes({
      scheduleEnd: schedulePair.end,
      actualOut: outTime,
    });
    overtimeMinutes = clampToHalfHourSteps(rawOvertime);
  }

  const dayAdj = scheduleDeviation + overtimeMinutes;
  totalAdjustmentMinutes += dayAdj;
  totalWorkMinutes += (scheduleMinutes + overtimeMinutes);

  if (dayAdj !== 0) {
    console.log(`Date: ${dateStr} | Schedule: ${schedulePair.start}-${schedulePair.end} (${scheduleMinutes}m) | Out: ${outTime || 'N/A'} | Overtime: ${overtimeMinutes}m | Day Adjustment: ${(dayAdj/60).toFixed(1)}`);
  }
}

const totalAdjustments = Math.round((totalAdjustmentMinutes / 60) * 2) / 2;
const averageWeeklyMinutes = scheduledDaysCount > 0
  ? Math.round((totalWorkMinutes / scheduledDaysCount) * 5)
  : 0;

console.log('--------------------------------------------------');
console.log(`Calculated Total Adjustments: ${totalAdjustments.toFixed(1)}`);
console.log(`Calculated Average Weekly Hours: ${(averageWeeklyMinutes/60).toFixed(1)} hours`);
console.log(`Total Scheduled Days: ${scheduledDaysCount}`);
