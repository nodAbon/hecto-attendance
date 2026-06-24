// toMinutes: null-safe 버전 (스케줄/초과근무 계산용)
// note: attendanceCalculations의 toMinutes와 달리 유효하지 않은 입력에 null 반환
export const toMinutes = (value = '') => {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

export const normalizeTime = (value, fallback = '') => {
  const text = String(value ?? fallback).trim();
  if (!text) return fallback;
  return text.length >= 5 ? text.slice(0, 5) : fallback || text;
};

export const getAdjustmentMinutes = ({ scheduleEnd = '', actualOut = '' } = {}) => {
  const endMinutes = toMinutes(scheduleEnd);
  const outMinutes = toMinutes(actualOut);
  if (!Number.isFinite(endMinutes) || !Number.isFinite(outMinutes)) return 0;
  if (outMinutes <= endMinutes) return 0;
  return outMinutes - endMinutes;
};

export const getScheduleDurationMinutes = (start = '', end = '') => {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  let duration = endMinutes - startMinutes;
  if (duration < 0) duration += 24 * 60;
  return Math.max(0, duration);
};

export const formatWeekTotalLabel = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (!safeMinutes) return '0시간';
  const hours = safeMinutes / 60;
  return Number.isInteger(hours) ? `${hours}시간` : `${hours.toFixed(1)}시간`;
};

export const formatMonthDayLabel = (dateStr = '') => {
  const parts = String(dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[1] || !parts[2]) return String(dateStr || '');
  return `${parts[1]}/${parts[2]}`;
};

export const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0');
  const minute = index % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});
