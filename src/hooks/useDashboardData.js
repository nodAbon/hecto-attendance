'use client';

import { useCallback, useEffect, useState } from 'react';

const getCookieValue = (name) => {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

export function useDashboardData({
  activeTab,
  selectedEmployee,
  setSelectedEmployee,
  myEmpNo,
  isAdmin,
  selectedMonth,
  calendarMonth,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyData, setMonthlyData] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [calendarLeaves, setCalendarLeaves] = useState([]);

  const fetchTodayData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/attendance');
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (!selectedEmployee && json.allEmployees && json.allEmployees.length > 0) {
          const adminVal = (getCookieValue('user-is-admin') || localStorage.getItem('user-is-admin')) === 'true';
          const empNoVal = getCookieValue('user-emp-no') || localStorage.getItem('user-emp-no') || '';
          setSelectedEmployee(adminVal ? json.allEmployees[0].empNo : (myEmpNo || empNoVal));
        }
      }
    } catch (e) {
      console.error('Fetch today data error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myEmpNo, selectedEmployee, setSelectedEmployee]);

  const fetchMonthlyData = useCallback(async (monthVal) => {
    if (!monthVal) return;
    setMonthlyLoading(true);
    try {
      const res = await fetch('/api/attendance?month=' + monthVal);
      const json = await res.json();
      if (json.success) {
        setMonthlyData(json);
      }
    } catch (e) {
      console.error('Fetch monthly data error:', e);
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  const fetchCalendarLeaves = useCallback(async (monthVal) => {
    if (!monthVal) return;
    try {
      const res = await fetch('/api/attendance?month=' + monthVal);
      const json = await res.json();
      if (json.success) {
        setCalendarLeaves(json.leaves || []);
      }
    } catch (e) {
      console.error('Calendar leaves fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchTodayData();
    const t = setInterval(() => fetchTodayData(true), 15000);
    return () => clearInterval(t);
  }, [fetchTodayData]);

  useEffect(() => {
    if (activeTab === 'MONTHLY' || activeTab === 'TRACKER' || activeTab === 'MY_PORTAL' || activeTab === 'LEAVES' || activeTab === 'EMPLOYEES' || activeTab === 'OVERTIME' || activeTab === 'MANUAL_APPROVAL' || activeTab === 'USER_REGISTER') {
      fetchMonthlyData(selectedMonth);
    }
  }, [activeTab, fetchMonthlyData, selectedMonth]);

  useEffect(() => {
    fetchCalendarLeaves(calendarMonth);
  }, [calendarMonth, fetchCalendarLeaves]);

  const refreshAllData = useCallback(async () => {
    await fetchTodayData(true);
    await fetchMonthlyData(selectedMonth);
    await fetchCalendarLeaves(calendarMonth);
  }, [calendarMonth, fetchCalendarLeaves, fetchMonthlyData, fetchTodayData, selectedMonth]);

  return {
    data,
    loading,
    refreshing,
    monthlyData,
    monthlyLoading,
    calendarLeaves,
    fetchTodayData,
    refreshAllData,
  };
}
