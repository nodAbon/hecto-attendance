import { uiText } from './uiText';
import { isLeaderPosition } from './roleUtils';

const normalizeDept = (value = '') => String(value || '').trim().replace(/\s+/g, '');
const normalizeTime = (value = '', fallback = '00:00') => {
  const text = String(value || fallback).trim();
  return text.length >= 5 ? text.substring(0, 5) : fallback;
};

export const inferNightScheduleEndTime = ({ dept = '', start = '', end = '' } = {}) => {
  const normalizedStart = normalizeTime(start, '');
  const normalizedEnd = normalizeTime(end, '');

  if (normalizedEnd) return normalizedEnd;
  if (!isNightTeamDept(dept)) return normalizedEnd;
  if (normalizedStart === '18:00') return '06:00';
  if (normalizedStart === '20:00') return '08:00';
  return normalizedEnd;
};

const NIGHT_TEAM_DEPTS = new Set([
  '서비스관리2팀',
].map(normalizeDept));

const SPECIAL_DAY_TEAM_DEPTS = new Set([
  '사업개발팀',
  '사업관리1팀',
  '사업관리2팀',
  '사업관리3팀',
].map(normalizeDept));

export const isNightTeamDept = (dept = '') => NIGHT_TEAM_DEPTS.has(normalizeDept(dept));

export const isSpecialDayTeamDept = (dept = '') => SPECIAL_DAY_TEAM_DEPTS.has(normalizeDept(dept));

export const canManageTeamSchedule = ({ isAdmin = false, position = '' } = {}) => {
  if (isAdmin) return true;
  return isLeaderPosition(position);
};

export const canManageService2NightSchedule = ({ isAdmin = false, dept = '', position = '' } = {}) =>
  canManageTeamSchedule({ isAdmin, position }) && isNightTeamDept(dept);

export const getEmployeeDailyScheduleOptionsForDept = (dept = '') => {
  const copy = uiText.scheduleBatch;
  if (isNightTeamDept(dept)) {
    return [
      { code: 'N1', label: copy.optionNight1, start: '18:00', end: '06:00' },
      { code: 'N2', label: copy.optionNight2, start: '20:00', end: '08:00' },
    ];
  }

  if (isSpecialDayTeamDept(dept)) {
    return [
      { code: 'D10', label: copy.optionDay10, start: '10:00', end: '19:00' },
      { code: 'CUSTOM', label: copy.optionCustom, start: '', end: '' },
    ];
  }

  return [
    { code: 'D08', label: copy.optionDay08, start: '08:00', end: '17:00' },
    { code: 'D09', label: copy.optionDay09, start: '09:00', end: '18:00' },
    { code: 'CUSTOM', label: copy.optionCustom, start: '', end: '' },
  ];
};

export const getEmployeeDailyScheduleSummary = (dept = '', code = '') => {
  const options = getEmployeeDailyScheduleOptionsForDept(dept);
  return options.find((item) => item.code === code) || options[0] || null;
};

export const getScheduleBadgeLabel = ({ dept = '', start = '', end = '', isOverride = false } = {}) => {
  const normalizedStart = normalizeTime(start, '');
  const normalizedEnd = normalizeTime(end, '');
  if (!isOverride) return '기본';
  if (isNightTeamDept(dept)) {
    if (normalizedStart === '18:00' && normalizedEnd === '06:00') return 'N1';
    if (normalizedStart === '20:00' && normalizedEnd === '08:00') return 'N2';
  }
  if (normalizedStart === '09:00' && normalizedEnd === '18:00') return '9시';
  return '예외 적용';
};

export const formatScheduleDisplay = ({ dept = '', start = '', end = '' } = {}) => {
  const normalizedStart = normalizeTime(start, '');
  const normalizedEnd = inferNightScheduleEndTime({ dept, start, end });
  if (!normalizedStart && !normalizedEnd) return '';

  if (isNightTeamDept(dept)) {
    if (normalizedStart && normalizedEnd) {
      return `${normalizedStart} 출근 / ${normalizedEnd} 퇴근`;
    }
    return normalizedStart || normalizedEnd;
  }

  if (normalizedStart && normalizedEnd) {
    return `${normalizedStart} ~ ${normalizedEnd}`;
  }
  return normalizedStart || normalizedEnd;
};
