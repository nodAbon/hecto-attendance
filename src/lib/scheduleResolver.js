import { inferScheduleEndTime, normalizeEmpNoKey, isExternalBusinessDept } from './dashboardUtils';
import { isNightTeamDept } from './nightScheduleRules';
import { getHolidayName } from './leaveRules';

export const normalizeScheduleTime = (value = '', fallback = '') => {
  const text = String(value || fallback || '').trim();
  if (!text) return fallback;
  return text.length >= 5 ? text.substring(0, 5) : fallback;
};

export const MONTHLY_SCHEDULE_NOTE = '__MONTHLY_SCHEDULE__';
export const MONTHLY_DEFAULT_NOTE = '__MONTHLY_DEFAULT__';
export const MONTHLY_SCHEDULE_RESTORE_NOTE = '__MONTHLY_SCHEDULE_RESTORE__';

export const isMonthlyScheduleNote = (note = '') => {
  const text = String(note || '').trim();
  return (
    text.includes(MONTHLY_SCHEDULE_NOTE)
    || text.includes(MONTHLY_DEFAULT_NOTE)
    || text.includes(MONTHLY_SCHEDULE_RESTORE_NOTE)
    || text.includes('\uC6D4 \uADFC\uBB34\uC77C\uC815')
    || text.includes('\uC77C\uAD04 \uBC18\uC601')
    || text.includes('\uBCF5\uC6D0')
  );
};

const normalizeDeptKey = (value = '') => String(value || '').trim().replace(/\s+/g, '');

export const getKstDayIndex = (dateStr = '') => {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
};

export const isWeekendDate = (dateStr = '') => {
  const dayIndex = getKstDayIndex(dateStr);
  return dayIndex === 0 || dayIndex === 6;
};

export const buildEmployeeScheduleMap = (rows = []) => new Map(
  (rows || [])
    .slice()
    .sort((a, b) => {
      const aUpdated = new Date(a?.updated_at || a?.updatedAt || 0).getTime();
      const bUpdated = new Date(b?.updated_at || b?.updatedAt || 0).getTime();
      return aUpdated - bUpdated;
    })
    .map((row) => {
      const empNo = normalizeEmpNoKey(row?.emp_no || row?.empNo || '');
      if (!empNo) return null;
      const start = normalizeScheduleTime(row?.schedule_time || row?.scheduleTime || '08:00', '08:00');
      const end = normalizeScheduleTime(
        row?.schedule_end_time || row?.scheduleEndTime || '',
        '',
      );
      return [empNo, { start, end, updatedAt: row?.updated_at || row?.updatedAt || null }];
    })
    .filter(Boolean)
);

export const buildScheduleOverrideMap = (rows = []) => {
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

export const buildTeamSchedulePatternMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const deptName = normalizeDeptKey(row?.dept_name || row?.deptName || '');
    const workDate = String(row?.work_date || row?.workDate || '').trim();
    if (!deptName || !workDate) return;
    map.set(`${deptName}_${workDate}`, {
      scheduleStart: normalizeScheduleTime(row?.schedule_start || row?.scheduleStart || '', ''),
      scheduleEnd: normalizeScheduleTime(row?.schedule_end || row?.scheduleEnd || '', ''),
      patternCode: row?.pattern_code || row?.patternCode || null,
      patternName: row?.pattern_name || row?.patternName || null,
      note: String(row?.note || '').trim(),
    });
  });
  return map;
};

export const resolveSchedulePairForDate = ({
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

  // 1. 오버라이드가 있으면 최우선 적용 (일괄 반영 여부와 무관하게 실제 설정된 일정 기준)
  if (override?.scheduleStart) {
    const start = normalizeScheduleTime(override.scheduleStart, '08:00');
    const inferredEnd = inferScheduleEndTime(start, dept) || '';
    const end = normalizeScheduleTime(override.scheduleEnd || inferredEnd, inferredEnd);
    return {
      start,
      end,
      source: 'override',
      isWeekend: isWeekendDate(dateStr),
      explicit: true,
    };
  }

  // 주말인 경우 기본 근무일정이 없음
  if (isWeekendDate(dateStr)) {
    return null;
  }

  // 2. 팀 패턴이 있으면 기본 스케줄보다 우선 적용
  if (teamPattern?.scheduleStart) {
    const patternStart = normalizeScheduleTime(teamPattern.scheduleStart, '08:00');
    const inferredEnd = inferScheduleEndTime(patternStart, dept) || '';
    const patternEnd = normalizeScheduleTime(teamPattern.scheduleEnd || inferredEnd, inferredEnd);
    return {
      start: patternStart,
      end: patternEnd,
      source: 'team-pattern',
      isWeekend: false,
      explicit: true,
    };
  }

  // 3. 마지막으로 기본(베이스) 스케줄 적용
  const isExternalTeam = isExternalBusinessDept(dept);
  const rawBaseStart = normalizeScheduleTime(baseScheduleStart, '');
  const rawBaseEnd = normalizeScheduleTime(baseScheduleEnd || '', '');
  const shouldUseExternalDefault = isExternalTeam
    && (
      !rawBaseStart
      || (rawBaseStart === '08:00' && (!rawBaseEnd || rawBaseEnd === '17:00'))
    );
  const start = shouldUseExternalDefault
    ? '10:00'
    : normalizeScheduleTime(baseScheduleStart, isExternalTeam ? '10:00' : '');
  if (start) {
    const inferredEnd = inferScheduleEndTime(start, dept) || '';
    const defaultEnd = shouldUseExternalDefault ? '19:00' : inferredEnd;
    const end = normalizeScheduleTime(
      shouldUseExternalDefault ? defaultEnd : baseScheduleEnd || defaultEnd || '',
      defaultEnd
    );
    if (!end) return null;

    return {
      start,
      end,
      source: 'base',
      isWeekend: false,
      explicit: false,
    };
  }

  return null;
};

export const resolveAllowOvertimeForSchedule = ({
  resolvedSchedule = null,
  override = null,
  fallbackAllowOvertime = false,
} = {}) => {
  if (!resolvedSchedule) return null;
  if (override?.removed) return null;
  if (override && !override?.derivedMonthly) {
    return Boolean(override.allowOvertime ?? override.allow_overtime ?? fallbackAllowOvertime);
  }
  return Boolean(fallbackAllowOvertime);
};
