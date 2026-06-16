import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  Users,
  CheckCircle,
  Plus,
  Upload,
  Clock,
  CarTaxiFront,
  LogOut,
  Sun,
  Moon,
  User,
} from 'lucide-react';
import { uiText } from './uiText';
import { canViewOvertimeMenu, isExecutivePosition } from './overtimeRules';

const BASE_ITEMS = [
  { href: '/?tab=DASHBOARD', label: uiText.sidebar.dashboard, icon: LayoutDashboard },
  { href: '/?tab=TRACKER', label: uiText.sidebar.tracker, icon: Calendar },
];

const LEADER_AND_ADMIN_ITEMS = [
  { href: '/?tab=MONTHLY', label: uiText.sidebar.monthly, icon: CalendarDays },
  { href: '/?tab=EMPLOYEES', label: uiText.sidebar.employees, icon: Users },
  { href: '/attendance-records', label: uiText.sidebar.attendanceRecords, icon: Clock },
];

const LEAVE_ITEM = { href: '/?tab=LEAVES', label: uiText.sidebar.leaves, icon: CalendarDays, iconStyle: { color: 'var(--purple)' } };
const OVERTIME_ITEM = { href: '/?tab=OVERTIME', label: uiText.sidebar.overtime, icon: Clock, iconStyle: { color: 'var(--amber)' } };

const ADMIN_ONLY_ITEMS = [
  { href: '/?tab=MANUAL_APPROVAL', label: uiText.sidebar.manualApproval, icon: CheckCircle },
  { href: '/?tab=USER_REGISTER', label: uiText.sidebar.userRegister, icon: Plus },
  { href: '/?tab=CAPS_UPLOAD', label: uiText.sidebar.capsUpload, icon: Upload },
  { href: '/admin/ical-subscriptions', label: '비공개 iCal 구독', icon: CalendarDays },
  { href: '/admin/taxi-audit', label: '택시 이용내역', icon: CarTaxiFront, activeHref: '/admin/taxi-audit' },
];

export function getMainSidebarItems({ isAdmin = false, isLeader = false, dept = '', position = '' } = {}) {
  const items = [...BASE_ITEMS];
  const canViewAllTeams = isAdmin || isLeader || isExecutivePosition(position);

  if (canViewAllTeams) {
    items.push(...LEADER_AND_ADMIN_ITEMS);
  }

  items.push(LEAVE_ITEM);

  if (canViewOvertimeMenu({ isAdmin, isLeader, position, dept })) {
    items.push(OVERTIME_ITEM);
  }

  if (isAdmin) {
    items.push(
      { href: '/admin/employees', label: uiText.sidebar.employeeAdmin, icon: Users, activeHref: '/admin/employees' },
      ...ADMIN_ONLY_ITEMS,
    );
    return items;
  }

  return items;
}

export function getMyPageSidebarItems({ isAdmin = false, isLeader = false, dept = '', position = '' } = {}) {
  return getMainSidebarItems({ isAdmin, isLeader, dept, position });
}

export function getAdminEmployeeSidebarItems() {
  return [
    ...BASE_ITEMS,
    ...LEADER_AND_ADMIN_ITEMS,
    { href: '/admin/employees', label: uiText.sidebar.employeeAdmin, icon: Users, activeHref: '/admin/employees', active: true },
    ...ADMIN_ONLY_ITEMS,
    LEAVE_ITEM,
    OVERTIME_ITEM,
  ];
}

export const sidebarActionIcons = {
  logout: LogOut,
  light: Sun,
  dark: Moon,
  mypage: User,
};
