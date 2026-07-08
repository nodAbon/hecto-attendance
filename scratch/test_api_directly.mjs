import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
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

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeScheduleTime = (value = '', fallback = '') => {
  const text = String(value || fallback || '').trim();
  if (!text) return fallback;
  return text.length >= 5 ? text.substring(0, 5) : fallback;
};

const normalizeEmpNoKey = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

const toMinutes = (timeValue = '') => {
  const [hours = 0, minutes = 0] = String(timeValue).substring(0, 5).split(':').map((value) => Number(value) || 0);
  return (hours * 60) + minutes;
};

const normalizeTime = (timeStr, fallback = '') => {
  if (!timeStr) return fallback;
  const parts = String(timeStr).split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return fallback;
};

const isMonthlyScheduleNote = (note = '') => {
  const text = String(note || '').trim();
  return (
    text.includes('__MONTHLY_SCHEDULE__') ||
    text.includes('__MONTHLY_DEFAULT__') ||
    text.includes('__MONTHLY_SCHEDULE_RESTORE__') ||
    text.includes('월 근무일정') ||
    text.includes('일괄 반영') ||
    text.includes('복원')
  );
};

const buildScheduleOverrideMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const empNo = normalizeEmpNoKey(row?.emp_no || row?.empNo || '');
    const workDate = String(row?.work_date || row?.workDate || '').trim();
    if (!empNo || !workDate) return;
    const note = String(row?.note || '').trim();
    const derivedMonthly = isMonthlyScheduleNote(note);
    const allowOvertime = row?.allow_overtime !== false && row?.allowOvertime !== false;
    map.set(`${empNo}_${workDate}`, {
      scheduleStart: normalizeScheduleTime(row?.schedule_start || row?.scheduleStart || '', ''),
      scheduleEnd: normalizeScheduleTime(row?.schedule_end || row?.scheduleEnd || '', ''),
      allowOvertime,
      allow_overtime: allowOvertime,
      note,
      removed: note === '__SCHEDULE_REMOVED__',
      derivedMonthly,
      patternCode: row?.pattern_code || row?.patternCode || null,
      patternName: row?.pattern_name || row?.patternName || null,
    });
  });
  return map;
};

const getKstDayIndex = (dateStr = '') => {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
};

const isWeekendDate = (dateStr = '') => {
  const dayIndex = getKstDayIndex(dateStr);
  return dayIndex === 0 || dayIndex === 6;
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
    const start = normalizeScheduleTime(override.scheduleStart, '08:00');
    const end = normalizeScheduleTime(override.scheduleEnd || '17:00', '17:00');
    return { start, end };
  }
  if (isWeekendDate(dateStr)) return null;
  return { start: baseScheduleStart || '08:00', end: baseScheduleEnd || '17:00' };
};

async function run() {
  const empNo = '20230039';
  const targetDate = '2026-04-14';

  const { data: employees } = await supabase.from('sa_employees').select('*');
  const employeeDeptMap = new Map(employees.map(e => [normalizeEmpNoKey(e.emp_no), String(e.dept || '').trim()]));

  const { data: overrides } = await supabase.from('sa_schedule_overrides').select('*').eq('emp_no', empNo);
  const overrideMap = buildScheduleOverrideMap(overrides);

  const { data: logs } = await supabase.from('sa_attendance').select('*').eq('emp_no', empNo).gte('log_time', '2026-04-01T00:00:00+09:00').lte('log_time', '2026-04-30T23:59:59+09:00');

  const getSchedulePairForDate = (empNo, dept, dateStr) => {
    const empKey = normalizeEmpNoKey(empNo);
    const override = overrideMap.get(`${empKey}_${dateStr}`) || null;
    return resolveSchedulePairForDate({
      dept,
      dateStr,
      baseScheduleStart: '10:00',
      baseScheduleEnd: '19:00',
      override,
      teamPattern: null,
    });
  };

  const formatATime = (aTime) => {
    if (!aTime || aTime.length < 14) return '';
    return `${aTime.substring(0,4)}-${aTime.substring(4,6)}-${aTime.substring(6,8)} ` +
           `${aTime.substring(8,10)}:${aTime.substring(10,12)}:${aTime.substring(12,14)}`;
  };

  const dayLogs = logs
    .map(log => {
      let logTime = '';
      if (log.a_time && log.a_time.length >= 14) {
        logTime = formatATime(log.a_time);
      } else if (log.log_time) {
        const d = new Date(log.log_time);
        const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
        logTime = kst.toISOString().replace('T', ' ').substring(0, 19);
      }
      return {
        ...log,
        logTime,
        workDate: targetDate,
      };
    })
    .filter(l => l.logTime.startsWith(targetDate));

  const getLogPriority = (log) => Number.isFinite(Number(log.manualPriority)) ? Number(log.manualPriority) : 1;

  const normalized = dayLogs.map(log => {
    const timeOnly = log.logTime.split(' ')[1];
    const minutes = toMinutes(timeOnly);
    const isCheckout = log.isAdjustedCheckout || String(log.adjustedRole || log.event_type || '').includes('퇴근');
    const workOrder = isCheckout ? minutes + 24 * 60 : minutes;
    return {
      ...log,
      workOrder
    };
  });

  const sorted = normalized.sort((a, b) => 
    getLogPriority(a) - getLogPriority(b) ||
    a.workOrder - b.workOrder ||
    a.logTime.localeCompare(b.logTime)
  );

  const firstLog = sorted[0];
  const timeOnly = firstLog.logTime.split(' ')[1];
  const isOfficialCheckin = timeOnly >= '07:00:00';

  const dept = employeeDeptMap.get(normalizeEmpNoKey(empNo)) || '';
  const schedulePair = getSchedulePairForDate(empNo, dept, targetDate);
  const scheduleTime = schedulePair?.start || '';

  let isLate = false;
  let lateLimit = '';
  if (scheduleTime) {
    lateLimit = `${scheduleTime}:59`;
    if (scheduleTime === '12:00') {
      lateLimit = '13:00:59';
    }
    isLate = isOfficialCheckin && timeOnly > lateLimit;
  }

  console.log('Employee:', empNo, 'Name: 박덕수');
  console.log('Dept:', dept);
  console.log('Resolved scheduleTime:', scheduleTime);
  console.log('firstLog:', firstLog.logTime, firstLog.event_type, 'WorkOrder:', firstLog.workOrder);
  console.log('isOfficialCheckin:', isOfficialCheckin);
  console.log('timeOnly:', timeOnly, 'vs lateLimit:', lateLimit);
  console.log('isLate:', isLate);
}

run();
