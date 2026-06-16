'use client';

import { useMemo } from 'react';
import { isExecutivePosition } from '../lib/roleUtils';
import { matchesDeptFilter, normalizeDeptName, normalizeEmpNoKey } from '../lib/dashboardUtils';

export function useDashboardViewModel({
  data,
  monthlyData,
  calendarLeaves,
  myDept,
  myPosition,
  isAdmin,
  activeTab,
  viewDeptFilter,
}) {
  const calendarEmployeeNameLookup = useMemo(() => {
    const lookup = new Map();
    [...(data?.allEmployees || []), ...(monthlyData?.allEmployees || [])].forEach((emp) => {
      const key = normalizeEmpNoKey(emp?.empNo || emp?.emp_no);
      if (!key) return;
      const name = String(emp?.name || '').trim();
      if (name && !lookup.has(key)) {
        lookup.set(key, name);
      }
    });
    return lookup;
  }, [data?.allEmployees, monthlyData?.allEmployees]);

  const employeeDeptLookup = useMemo(() => {
    const lookup = new Map();
    [...(data?.allEmployees || []), ...(monthlyData?.allEmployees || [])].forEach((emp) => {
      const key = normalizeEmpNoKey(emp?.empNo || emp?.emp_no);
      if (!key) return;
      const dept = String(emp?.dept || emp?.team || '').trim();
      if (dept && !lookup.has(key)) {
        lookup.set(key, dept);
      }
    });
    return lookup;
  }, [data?.allEmployees, monthlyData?.allEmployees]);

  const isExecutive = useMemo(() => isExecutivePosition(myPosition), [myPosition]);
  const hasFullAccess = useMemo(() => isAdmin || isExecutive, [isAdmin, isExecutive]);

  const resolvedDeptFilterValue = useMemo(() => {
    return (!hasFullAccess && activeTab !== 'LEAVES')
      ? (normalizeDeptName(myDept) || 'ALL')
      : (normalizeDeptName(viewDeptFilter) || 'ALL');
  }, [activeTab, hasFullAccess, myDept, viewDeptFilter]);

  const deptOptions = useMemo(() => {
    return Array.from(new Set([
      'ALL',
      myDept,
      ...(data?.allEmployees || []).map((emp) => emp?.dept),
      ...(monthlyData?.allEmployees || []).map((emp) => emp?.dept),
    ].map(normalizeDeptName).filter(Boolean))).sort((a, b) => {
      if (a === 'ALL') return -1;
      if (b === 'ALL') return 1;
      return a.localeCompare(b, 'ko-KR');
    });
  }, [data?.allEmployees, monthlyData?.allEmployees, myDept]);

  const filterLeavesByDept = (leaves = [], filter = 'ALL') => {
    const normalizedFilter = normalizeDeptName(filter);
    if (!normalizedFilter || normalizedFilter === 'ALL') return leaves;
    return (leaves || []).filter((leave) => matchesDeptFilter(employeeDeptLookup.get(normalizeEmpNoKey(leave?.empNo)), normalizedFilter));
  };

  const filterEmployeesByDept = (employees = [], filter = 'ALL') => {
    if (!Array.isArray(employees)) return [];
    const normalizedFilter = normalizeDeptName(filter);
    if (!normalizedFilter || normalizedFilter === 'ALL') return employees;
    return employees.filter((emp) => matchesDeptFilter(normalizeDeptName(emp?.dept || emp?.team), normalizedFilter));
  };

  const visibleMonthlyEmployees = useMemo(() => {
    return filterEmployeesByDept(monthlyData?.allEmployees || [], resolvedDeptFilterValue);
  }, [monthlyData?.allEmployees, resolvedDeptFilterValue]);

  const visibleTrackerEmployees = useMemo(() => {
    return filterEmployeesByDept(monthlyData?.allEmployees || data?.allEmployees || [], resolvedDeptFilterValue);
  }, [monthlyData?.allEmployees, data?.allEmployees, resolvedDeptFilterValue]);

  const visibleScheduleEmployees = useMemo(() => {
    return filterEmployeesByDept(monthlyData?.allEmployees || data?.allEmployees || [], resolvedDeptFilterValue);
  }, [monthlyData?.allEmployees, data?.allEmployees, resolvedDeptFilterValue]);

  const visibleLeaves = useMemo(() => {
    const filter = !hasFullAccess ? 'ALL' : resolvedDeptFilterValue;
    return filterLeavesByDept(monthlyData?.leaves || [], filter);
  }, [monthlyData?.leaves, resolvedDeptFilterValue, employeeDeptLookup, hasFullAccess]);

  const visibleDashboardLeaves = useMemo(() => {
    const filter = !hasFullAccess ? 'ALL' : resolvedDeptFilterValue;
    return filterLeavesByDept(calendarLeaves || [], filter);
  }, [calendarLeaves, resolvedDeptFilterValue, employeeDeptLookup, hasFullAccess]);

  return {
    calendarEmployeeNameLookup,
    employeeDeptLookup,
    isExecutive,
    hasFullAccess,
    resolvedDeptFilterValue,
    deptOptions,
    visibleMonthlyEmployees,
    visibleTrackerEmployees,
    visibleScheduleEmployees,
    visibleLeaves,
    visibleDashboardLeaves,
  };
}
