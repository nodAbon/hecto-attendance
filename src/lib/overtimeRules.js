import { isExecutivePosition as isExecutivePositionRole } from './roleUtils';

const TEAM_DEPTS = ['사업개발팀', '사업관리 1팀', '사업관리 2팀', '사업관리 3팀'];

export const OVERTIME_TEAM_DEPTS = TEAM_DEPTS;

export const isOvertimeTeamDept = (dept = '') => TEAM_DEPTS.includes(String(dept).trim());

export const isExecutivePosition = (position = '') => isExecutivePositionRole(position);

export const canViewOvertimeMenu = ({ isAdmin = false, isLeader = false, position = '', dept = '' } = {}) => {
  if (isAdmin || isLeader) return true;
  if (isExecutivePosition(position)) return true;
  return isOvertimeTeamDept(dept);
};
