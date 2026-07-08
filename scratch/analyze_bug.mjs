import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Read env
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

const getYearWeekNumber = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${target.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
};

// Fetch data
const { data: employees } = await supabase.from('sa_employees').select('*').eq('name', '김진호').limit(1);
const emp = employees[0];
const empNo = emp.emp_no;

const startDate = '2026-01-12';
const endDate = '2026-07-04';

const { data: overrides } = await supabase.from('sa_schedule_overrides').select('*').eq('emp_no', empNo).gte('work_date', startDate).lte('work_date', endDate);
const { data: corrections } = await supabase.from('sa_attendance_corrections').select('*').eq('emp_no', empNo).gte('work_date', startDate).lte('work_date', endDate);
const { data: logs } = await supabase.from('sa_attendance').select('*').eq('emp_no', empNo).gte('log_time', `${startDate}T00:00:00+09:00`).lte('log_time', `${endDate}T23:59:59+09:00`);

const overrideMap = new Map();
(overrides || []).forEach(row => {
  overrideMap.set(row.work_date, {
    scheduleStart: row.schedule_start || '',
    scheduleEnd: row.schedule_end || '',
    allowOvertime: Boolean(row.allow_overtime),
    note: row.note || '',
    removed: row.note === '__SCHEDULE_REMOVED__',
  });
});

const correctionMap = new Map();
(corrections || []).forEach(c => {
  correctionMap.set(c.work_date, c.corrected_out_time);
});

const dailyLogs = {};
(logs || []).forEach(log => {
  const d = new Date(log.log_time);
  const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
  const logTimeStr = kst.toISOString().replace('T', ' ').substring(0, 19);
  const workDate = logTimeStr.split(' ')[0];
  if (!dailyLogs[workDate]) dailyLogs[workDate] = [];
  dailyLogs[workDate].push({ logTime: logTimeStr });
});

const baseStart = emp.schedule_time || '10:00';
const baseEnd = emp.schedule_end_time || '19:00';

const weeklyData = {};

const start = new Date(`${startDate}T00:00:00+09:00`);
const end = new Date(`${endDate}T00:00:00+09:00`);

for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
  const dateStr = day.toISOString().split('T')[0];
  const override = overrideMap.get(dateStr) || null;
  
  let schedulePair = null;
  if (override?.removed) {
    schedulePair = null;
  } else if (override?.scheduleStart) {
    schedulePair = { start: override.scheduleStart, end: override.scheduleEnd || '17:00' };
  } else if (!isWeekendDate(dateStr)) {
    schedulePair = { start: baseStart, end: baseEnd };
  }
  
  const weekKey = getYearWeekNumber(dateStr);
  if (!weeklyData[weekKey]) {
    weeklyData[weekKey] = {
      weekKey,
      deviationSum: 0,
      overtimeSum: 0,
      adjSum: 0,
      days: [],
    };
  }

  // If no schedule resolved
  if (!schedulePair) {
    const isWeekend = isWeekendDate(dateStr);
    if (!isWeekend) {
      // Subtract 8 hours for weekday empty schedule (adjustment consumption)
      weeklyData[weekKey].deviationSum += -480;
      weeklyData[weekKey].adjSum += -480;
      weeklyData[weekKey].days.push({
        date: dateStr,
        schedule: '삭제됨',
        deviation: -8.0,
        overtime: 0,
        adj: -8.0,
        note: override?.note || '',
      });
    }
    continue;
  }

  const allowOvertime = override ? Boolean(override.allowOvertime) : (schedulePair.start === '10:00' && schedulePair.end === '19:00');
  const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => a.logTime.localeCompare(b.logTime));
  const firstLog = dayLogs[0];
  const correctedOut = correctionMap.get(dateStr);
  let outTime = null;

  if (correctedOut) {
    outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
  } else if (dayLogs.length >= 2 && firstLog) {
    const lastLog = dayLogs[dayLogs.length - 1];
    if (lastLog && lastLog.logTime !== firstLog.logTime) {
      outTime = lastLog.logTime.split(' ')[1].substring(0, 5);
    }
  }

  const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(schedulePair.start, schedulePair.end) - 60);
  const scheduleDeviation = scheduleMinutes - 480;

  let overtimeMinutes = 0;
  if (outTime && allowOvertime) {
    const rawOvertime = getAdjustmentMinutes({ scheduleEnd: schedulePair.end, actualOut: outTime });
    overtimeMinutes = clampToHalfHourSteps(rawOvertime);
  }

  const dayAdj = scheduleDeviation + overtimeMinutes;

  weeklyData[weekKey].deviationSum += scheduleDeviation;
  weeklyData[weekKey].overtimeSum += overtimeMinutes;
  weeklyData[weekKey].adjSum += dayAdj;
  
  if (dayAdj !== 0 || override) {
    weeklyData[weekKey].days.push({
      date: dateStr,
      schedule: `${schedulePair.start}-${schedulePair.end}`,
      deviation: scheduleDeviation / 60,
      overtime: overtimeMinutes / 60,
      adj: dayAdj / 60,
      note: override?.note || '',
    });
  }
}

// Print results in structured text
console.log('=== WEEKLY SUMMARY WITH CORRECTION ===');
let totalOverall = 0;
Object.values(weeklyData).forEach(w => {
  const totalAdj = Math.round((w.adjSum / 60) * 2) / 2;
  totalOverall += totalAdj;
  const devHours = w.deviationSum / 60;
  const otHours = w.overtimeSum / 60;
  console.log(`[Week ${w.weekKey}] Dev: ${devHours.toFixed(1)}h, Overtime: ${otHours.toFixed(1)}h => Total Adj: ${totalAdj.toFixed(1)}개`);
  w.days.forEach(d => {
    console.log(`  - ${d.date} | Schedule: ${d.schedule} (Dev: ${d.deviation.toFixed(1)}h) | Overtime: ${d.overtime.toFixed(1)}h | Adj: ${d.adj.toFixed(1)}개 | Note: ${d.note}`);
  });
});
console.log(`OVERALL_TOTAL: ${totalOverall}`);
