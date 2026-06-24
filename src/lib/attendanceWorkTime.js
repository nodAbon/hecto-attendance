import { clampToHalfHourSteps } from './dashboardUtils';
import { toMinutes } from './attendanceCalculations';

const normalizeTime = (value = '', fallback = '') => {
  const text = String(value || fallback).trim();
  if (!text) return fallback;
  return text.substring(0, 5);
};

const normalizeDayScheduleEnd = (start, end) => {
  const startMinutes = toMinutes(start);
  let endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return endMinutes;
};

export const calculateOvertimeMinutes = ({
  inTime = '',
  outTime = '',
  scheduleStart = '',
  scheduleEnd = '',
  allowOvertime = false,
} = {}) => {
  const normalizedStart = normalizeTime(scheduleStart);
  const normalizedEnd = normalizeTime(scheduleEnd);
  const actualIn = normalizeTime(inTime);
  const actualOut = normalizeTime(outTime);

  if (!normalizedStart || !normalizedEnd || !actualIn || !actualOut) return 0;
  if (!allowOvertime) return 0;

  const inMinutes = toMinutes(actualIn);
  let outMinutes = toMinutes(actualOut);
  if (outMinutes < inMinutes) {
    outMinutes += 24 * 60;
  }

  const scheduleEndMinutes = normalizeDayScheduleEnd(normalizedStart, normalizedEnd);
  if (outMinutes <= scheduleEndMinutes) return 0;

  return clampToHalfHourSteps(outMinutes - scheduleEndMinutes);
};

export const formatOvertimeMinutes = (minutes = 0) => {
  const safe = Math.max(0, Math.floor(Number(minutes) || 0));
  if (safe <= 0) return '';
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours > 0) {
    return `\uCD08\uACFC\uADFC\uBB34 ${hours}\uC2DC\uAC04 ${String(mins).padStart(2, '0')}\uBD84`;
  }
  return `\uCD08\uACFC\uADFC\uBB34 ${String(mins).padStart(2, '0')}\uBD84`;
};
