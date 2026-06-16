export const normalizeDeptName = (value) => String(value ?? '').trim();

export const normalizeEmpNoKey = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

export const getCurrentMonthKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const getMonthsList = (count = 6, baseDate = new Date()) => {
  const list = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    list.push(getCurrentMonthKey(d));
  }
  return list;
};

export const getTabFromLocation = () => {
  if (typeof window === 'undefined') return 'DASHBOARD';
  return new URLSearchParams(window.location.search).get('tab') || 'DASHBOARD';
};

export const matchesDeptFilter = (dept, filter) => {
  const normalizedFilter = normalizeDeptName(filter);
  return !normalizedFilter || normalizedFilter === 'ALL' || normalizeDeptName(dept) === normalizedFilter;
};
