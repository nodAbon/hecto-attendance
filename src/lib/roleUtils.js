const normalizeRoleText = (value = '') => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const includesAny = (value, keywords = []) => {
  const text = normalizeRoleText(value);
  return keywords.some((keyword) => text.includes(normalizeRoleText(keyword)));
};

const ADMIN_KEYWORDS = [
  '관리자',
  '최고관리자',
  '시스템 관리자',
  '운영 관리자',
  'admin',
  'administrator',
  'super admin',
  'root',
];

const LEADER_KEYWORDS = [
  '팀장',
  '리더',
  '실장',
  '부서장',
  '센터장',
  '파트장',
  '파트 리더',
];

const EXECUTIVE_KEYWORDS = [
  '대표',
  '사장',
  '부사장',
  '전무',
  '상무',
  '이사',
  '본부장',
  '임원',
];

export const isAdminRole = ({ isAdmin = false, is_admin = false, position = '', rank = '' } = {}) => {
  if (isAdmin || is_admin) return true;
  return includesAny(`${position} ${rank}`, ADMIN_KEYWORDS);
};

export const isLeaderPosition = (position = '') => includesAny(position, LEADER_KEYWORDS);

export const isExecutivePosition = (position = '') => includesAny(position, EXECUTIVE_KEYWORDS);
