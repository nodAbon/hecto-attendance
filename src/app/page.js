'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw, Sun, Moon } from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import { getMainSidebarItems, sidebarActionIcons } from '../lib/sidebarConfig';
import { formatClockTime } from '../lib/clock';
import { usePersistentTheme } from '../lib/usePersistentTheme';
import { isLeaderPosition, isExecutivePosition } from '../lib/roleUtils';
import { getCurrentMonthKey, normalizeDeptName, normalizeEmpNoKey, matchesDeptFilter } from '../lib/dashboardUtils';
import { useDashboardAuth } from '../hooks/useDashboardAuth';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardViewModel } from '../hooks/useDashboardViewModel';
import DashboardShell from '../components/dashboard/DashboardShell';
import PushManager from '../components/PushManager';


function DashboardTabSync({ setActiveTab }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get('tab') || 'DASHBOARD';
    setActiveTab(tab);
  }, [searchParams, setActiveTab]);
  return null;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [viewDeptFilter, setViewDeptFilter] = useState('ALL');
  const [time, setTime] = useState('');
  const [theme, setTheme] = usePersistentTheme('dark');
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey());
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => getCurrentMonthKey());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [leaveCalendarDate, setLeaveCalendarDate] = useState(null);

  const {
    isAdmin,
    isLeader,
    myEmpNo,
    myName,
    myRank,
    myLoginId,
    myDept,
    myPosition,
    authChecking,
  } = useDashboardAuth({
    setActiveTab,
    setViewDeptFilter,
    setSelectedEmployee,
    setSelectedMonth,
  });

  const {
    data,
    loading,
    refreshing,
    monthlyData,
    monthlyLoading,
    calendarLeaves,
    fetchTodayData,
    refreshAllData,
    refreshEmployeeData,
  } = useDashboardData({
    activeTab,
    selectedEmployee,
    setSelectedEmployee,
    myEmpNo,
    isAdmin,
    selectedMonth,
    calendarMonth,
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(formatClockTime(now));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const {
    calendarEmployeeNameLookup,
    resolvedDeptFilterValue,
    deptOptions,
    visibleMonthlyEmployees,
    visibleTrackerEmployees,
    visibleScheduleEmployees,
    visibleLeaves,
    visibleDashboardLeaves,
    hasFullAccess,
  } = useDashboardViewModel({
    data,
    monthlyData,
    calendarLeaves,
    myDept,
    myPosition,
    isAdmin,
    activeTab,
    viewDeptFilter,
  });
  return (
    <DashboardShell
      authChecking={authChecking}
      loading={loading}
      data={data}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      theme={theme}
      toggleTheme={toggleTheme}
      time={time}
      refreshing={refreshing}
      fetchTodayData={fetchTodayData}
      viewDeptFilter={viewDeptFilter}
      setViewDeptFilter={setViewDeptFilter}
      hasFullAccess={hasFullAccess}
      resolvedDeptFilterValue={resolvedDeptFilterValue}
      deptOptions={deptOptions}
      myName={myName}
      myRank={myRank}
      myLoginId={myLoginId}
      myEmpNo={myEmpNo}
      myDept={myDept}
      isAdmin={isAdmin}
      isLeader={isLeader}
      myPosition={myPosition}
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      selectedEmployee={selectedEmployee}
      setSelectedEmployee={setSelectedEmployee}
      monthlyData={monthlyData}
      monthlyLoading={monthlyLoading}
      calendarMonth={calendarMonth}
      setCalendarMonth={setCalendarMonth}
      selectedCalendarDate={selectedCalendarDate}
      setSelectedCalendarDate={setSelectedCalendarDate}
      leaveCalendarDate={leaveCalendarDate}
      setLeaveCalendarDate={setLeaveCalendarDate}
      visibleDashboardLeaves={visibleDashboardLeaves}
      visibleMonthlyEmployees={visibleMonthlyEmployees}
      visibleTrackerEmployees={visibleTrackerEmployees}
      visibleScheduleEmployees={visibleScheduleEmployees}
      visibleLeaves={visibleLeaves}
      calendarEmployeeNameLookup={calendarEmployeeNameLookup}
      refreshAllData={refreshAllData}
      refreshEmployeeData={refreshEmployeeData}
    >
      {myEmpNo && <PushManager empNo={myEmpNo} />}
    </DashboardShell>
  );
}

