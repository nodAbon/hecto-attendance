import { isExecutivePosition as isExecutivePositionRole } from './roleUtils';

const TEAM_DEPTS = ['사업개발팀', '사업관리 1팀', '사업관리 2팀', '사업관리 3팀'];

export const OVERTIME_TEAM_DEPTS = TEAM_DEPTS;

export const isOvertimeTeamDept = (dept = '') => {
  const cleanDept = String(dept || '').trim().replace(/\s+/g, '');
  return TEAM_DEPTS.some((d) => d.replace(/\s+/g, '') === cleanDept);
};

export const isExecutivePosition = (position = '') => isExecutivePositionRole(position);

export const canViewOvertimeMenu = ({ isAdmin = false, isLeader = false, position = '', dept = '' } = {}) => {
  if (isAdmin) return true;
  if (isExecutivePosition(position)) return true;
  if (isLeader && isOvertimeTeamDept(dept)) return true;
  return false;
};

export const canViewManualApprovalMenu = ({ isAdmin = false, isLeader = false, position = '', dept = '' } = {}) => {
  if (isAdmin) return true;
  if (isExecutivePosition(position)) return true;
  if (isLeader && isOvertimeTeamDept(dept)) return true;
  return false;
};


