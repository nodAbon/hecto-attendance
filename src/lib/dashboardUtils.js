import { getKstMonthKey } from './kstDate.js';
import { isNightTeamDept } from './nightScheduleRules.js';


export const normalizeDeptName = (value) => String(value ?? '').trim();

export const MANAGED_ATTENDANCE_DEPTS = [
  '사업개발팀',
  '사업관리1팀',
  '사업관리2팀',
  '사업관리3팀',
  '사업관리 1팀',
  '사업관리 2팀',
  '사업관리 3팀',
];

export const EXTERNAL_BUSINESS_DEPTS = [
  '사업개발팀',
  '사업관리1팀',
  '사업관리2팀',
  '사업관리3팀',
  '사업관리 1팀',
  '사업관리 2팀',
  '사업관리 3팀',
];

export const normalizeDeptLoose = (value) => normalizeDeptName(value).replace(/\s+/g, '');

export const isManagedAttendanceDept = (dept) => {
  const normalized = normalizeDeptLoose(dept);
  return MANAGED_ATTENDANCE_DEPTS.some((item) => normalizeDeptLoose(item) === normalized);
};

export const isExternalBusinessDept = (dept) => {
  const normalized = normalizeDeptLoose(dept);
  return EXTERNAL_BUSINESS_DEPTS.some((item) => normalizeDeptLoose(item) === normalized);
};

export const clampToHalfHourSteps = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.floor(Number(minutes) || 0));
  return Math.floor(safeMinutes / 30) * 30;
};

export const formatHalfHourSteps = (minutes = 0) => {
  const halfHours = Math.floor(Math.max(0, Number(minutes) || 0) / 30) / 2;
  return Number.isInteger(halfHours) ? `${halfHours}.0` : `${halfHours}`;
};

export const inferScheduleEndTime = (start = '', dept = '') => {
  const normalizedStart = normalizeDeptName(start).substring(0, 5);
  const dayMap = {
    '08:00': '17:00',
    '09:00': '18:00',
    '10:00': '19:00',
    '18:00': '06:00',
    '20:00': '08:00',
  };

  if (isNightTeamDept(dept)) {
    if (normalizedStart === '18:00') return '06:00';
    if (normalizedStart === '20:00') return '08:00';
  }

  return dayMap[normalizedStart] || '';
};

export const normalizeEmpNoKey = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

export const getCurrentMonthKey = (date = new Date()) => {
  return getKstMonthKey(date);
};

export const getMonthsList = (count = 6, baseDate = new Date()) => {
  const list = [];
  const { year, month } = (() => {
    const [y, m] = getCurrentMonthKey(baseDate).split('-');
    return { year: Number(y), month: Number(m) };
  })();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    list.push(getCurrentMonthKey(d));
  }
  return list;
};

export const getYearMonthList = (baseDate = new Date()) => {
  const [year] = getCurrentMonthKey(baseDate).split('-').map(Number);
  if (!year) return [];
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
};

export const getMonthWindowList = (futureMonths = 6, baseDate = new Date()) => {
  const [year, month] = getCurrentMonthKey(baseDate).split('-').map(Number);
  if (!year || !month) return [];
  return Array.from({ length: Math.max(1, futureMonths + 1) }, (_, index) => {
    const d = new Date(Date.UTC(year, month - 1 + index, 1));
    return getCurrentMonthKey(d);
  });
};

export const getMonthRangeList = (monthsBefore = 24, monthsAfter = 24, baseDate = new Date()) => {
  const [year, month] = getCurrentMonthKey(baseDate).split('-').map(Number);
  if (!year || !month) return [];

  const before = Math.max(0, Number(monthsBefore) || 0);
  const after = Math.max(0, Number(monthsAfter) || 0);
  const list = [];

  for (let offset = -before; offset <= after; offset += 1) {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    list.push(getCurrentMonthKey(d));
  }

  return list;
};

const pad2 = (value) => String(value).padStart(2, '0');

const toUtcDateOnly = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;

export const getYearWeekStartKey = (dateStr = '') => {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return '';

  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date.getTime() - diff * 86400000);

  return toUtcDateOnly(monday);
};

export const getYearWeekNumber = (dateStr = '') => {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const year = date.getUTCFullYear();

  const getMondayOfJan1 = (y) => {
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const day = jan1.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    return new Date(jan1.getTime() - diff * 86400000);
  };

  const mNext = getMondayOfJan1(year + 1);
  const mCurr = getMondayOfJan1(year);
  const mPrev = getMondayOfJan1(year - 1);

  let targetYearStartWeek;
  if (date.getTime() >= mNext.getTime()) {
    targetYearStartWeek = mNext;
  } else if (date.getTime() >= mCurr.getTime()) {
    targetYearStartWeek = mCurr;
  } else {
    targetYearStartWeek = mPrev;
  }

  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(date.getTime() - diff * 86400000);

  return Math.floor((monday.getTime() - targetYearStartWeek.getTime()) / (7 * 86400000)) + 1;
};

export const getTabFromLocation = () => {
  if (typeof window === 'undefined') return 'DASHBOARD';
  return new URLSearchParams(window.location.search).get('tab') || 'DASHBOARD';
};

export const matchesDeptFilter = (dept, filter) => {
  const normalizedFilter = normalizeDeptLoose(filter);
  if (!normalizedFilter || normalizedFilter === 'ALL' || normalizedFilter === '전체' || normalizedFilter === '전체부서' || normalizedFilter === '전체부서보기') {
    return true;
  }
  return normalizeDeptLoose(dept) === normalizedFilter;
};
