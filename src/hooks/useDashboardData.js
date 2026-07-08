'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCookieValue } from '../lib/authStorage';
import { getCurrentMonthKey } from '../lib/dashboardUtils';
import { shiftMonthKey } from '../lib/kstDate';


const buildMonthScopeKeys = (monthKey) => {
  const prev = shiftMonthKey(monthKey, -1);
  const next = shiftMonthKey(monthKey, 1);
  return [prev, monthKey, next].map((value) => String(value || '').trim()).filter(Boolean);
};

const mergeUnique = (items = [], keyFn) => {
  const seen = new Set();
  const result = [];
  (items || []).forEach((item) => {
    const key = String(keyFn(item) || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const mergeMonthlyResponses = (responses = []) => {
  const succeeded = responses.filter((entry) => entry?.success && entry?.json);
  if (succeeded.length === 0) return null;

  const pickFirst = (key) => {
    for (const entry of succeeded) {
      const value = entry.json?.[key];
      if (Array.isArray(value) && value.length > 0) return value;
      if (value && !Array.isArray(value) && typeof value === 'object') return value;
    }
    return Array.isArray(succeeded[0].json?.[key]) ? [] : null;
  };

  const merged = { ...succeeded[0].json };
  const arrays = {
    allLogs: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.allLogs) ? entry.json.allLogs : [])),
    ],
    leaves: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.leaves) ? entry.json.leaves : [])),
    ],
    corrections: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.corrections) ? entry.json.corrections : [])),
    ],
    overrides: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.overrides) ? entry.json.overrides : [])),
    ],
    teamSchedulePatterns: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.teamSchedulePatterns) ? entry.json.teamSchedulePatterns : [])),
    ],
    manualCheckins: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.manualCheckins) ? entry.json.manualCheckins : [])),
    ],
    overtimeRounds: [
      ...(succeeded.flatMap((entry) => Array.isArray(entry.json?.overtimeRounds) ? entry.json.overtimeRounds : [])),
    ],
  };

  merged.allLogs = mergeUnique(arrays.allLogs, (row) => [
    row?.id,
    row?.empNo || row?.emp_no || '',
    row?.logTime || row?.log_time || '',
    row?.workDate || row?.work_date || '',
    row?.eventType || row?.event_type || '',
    row?.checkType || row?.check_type || '',
  ].join('|'));
  merged.leaves = mergeUnique(arrays.leaves, (row) => [
    row?.id,
    row?.empNo || row?.emp_no || '',
    row?.startDate || row?.start_date || '',
    row?.endDate || row?.end_date || '',
    row?.leaveName || row?.leave_name || '',
  ].join('|'));
  merged.corrections = mergeUnique(arrays.corrections, (row) => [
    row?.id,
    row?.emp_no || '',
    row?.work_date || '',
    row?.corrected_out_time || '',
  ].join('|'));
  merged.overrides = mergeUnique(arrays.overrides, (row) => [
    row?.id,
    row?.emp_no || '',
    row?.work_date || '',
    row?.schedule_start || '',
    row?.schedule_end || '',
    row?.note || '',
  ].join('|'));
  merged.teamSchedulePatterns = mergeUnique(arrays.teamSchedulePatterns, (row) => [
    row?.id,
    row?.dept || '',
    row?.work_date || '',
    row?.schedule_start || '',
    row?.schedule_end || '',
  ].join('|'));
  merged.manualCheckins = mergeUnique(arrays.manualCheckins, (row) => [
    row?.id,
    row?.empNo || row?.emp_no || '',
    row?.workDate || row?.work_date || '',
    row?.checkTime || row?.check_time || '',
    row?.checkType || row?.check_type || '',
  ].join('|'));
  merged.overtimeRounds = mergeUnique(arrays.overtimeRounds, (row) => row?.emp_no || '');

  merged.employees = pickFirst('employees') || [];
  merged.isDemo = succeeded.some((entry) => entry.json?.isDemo);
  merged.error = null;

  return merged;
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
  const monthDataCacheRef = useRef(new Map());
  const calendarLeavesCacheRef = useRef(new Map());
  const currentMonthKey = getCurrentMonthKey();

  const fetchTodayData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/attendance', { cache: 'no-store' });
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

  const fetchMonthlyData = useCallback(async (monthVal, empNoFilter = null) => {
    if (!monthVal) return;
    setMonthlyLoading(true);
    try {
      const cacheKey = empNoFilter ? `${monthVal}_${empNoFilter}` : monthVal;
      const cachedTarget = monthDataCacheRef.current.get(cacheKey);
      let targetPayload = cachedTarget;

      if (!targetPayload) {
        const url = empNoFilter ? `/api/attendance?month=${monthVal}&empNo=${empNoFilter}` : `/api/attendance?month=${monthVal}`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();
        targetPayload = { success: res.ok && json?.success, json, monthKey: monthVal };
        if (targetPayload.success) {
          monthDataCacheRef.current.set(cacheKey, targetPayload);
        }
      }

      // target month 데이터로 우선 화면 갱신
      if (targetPayload && targetPayload.success) {
        const merged = mergeMonthlyResponses([targetPayload]);
        if (merged) {
          setMonthlyData(merged);
          setCalendarLeaves(merged.leaves || []);
        }
      }

      // 백그라운드 프리페치 (단일 사번 조회가 아닌 전체 부서 조회 시에만)
      if (!empNoFilter) {
        const prevMonth = shiftMonthKey(monthVal, -1);
        const nextMonth = shiftMonthKey(monthVal, 1);
        [prevMonth, nextMonth].forEach((m) => {
          if (!monthDataCacheRef.current.has(m)) {
            fetch(`/api/attendance?month=${m}`, { cache: 'no-store' })
              .then(res => res.json())
              .then(json => {
                if (json.success) {
                  monthDataCacheRef.current.set(m, { success: true, json, monthKey: m });
                }
              })
              .catch(e => console.error('Prefetch error:', e));
          }
        });
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
      const cacheKey = String(monthVal || '').trim();
      const cached = calendarLeavesCacheRef.current.get(cacheKey);
      if (cached) {
        setCalendarLeaves(cached);
        return;
      }

      const res = await fetch('/api/attendance?month=' + monthVal + '&excludeLogs=true', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const leaves = json.leaves || [];
        calendarLeavesCacheRef.current.set(cacheKey, leaves);
        setCalendarLeaves(leaves);
      }
    } catch (e) {
      console.error('Calendar leaves fetch error:', e);
    }
  }, []);

  useEffect(() => {
    let delay = 60000;
    let timeoutId;

    const schedule = () => {
      timeoutId = setTimeout(async () => {
        try {
          await fetchTodayData(true);
          delay = 60000; // 성공 시 정상 간격 복구
        } catch {
          delay = Math.min(delay * 2, 120000); // 실패 시 최대 2분까지 지수 증가
        }
        schedule();
      }, delay);
    };

    fetchTodayData();
    schedule();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTodayData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchTodayData]);

  useEffect(() => {
    const isSingleEmpTab = activeTab === 'TRACKER' || activeTab === 'MY_PORTAL';
    const empNoFilter = isSingleEmpTab ? (selectedEmployee || myEmpNo) : null;

    if (activeTab === 'MONTHLY' || activeTab === 'TRACKER' || activeTab === 'MY_PORTAL' || activeTab === 'LEAVES' || activeTab === 'EMPLOYEES' || activeTab === 'OVERTIME' || activeTab === 'MANUAL_APPROVAL' || activeTab === 'USER_REGISTER') {
      if (isSingleEmpTab && !empNoFilter) return; // Wait for empNo
      fetchMonthlyData(selectedMonth, empNoFilter);
    }
  }, [activeTab, fetchMonthlyData, selectedMonth, myEmpNo, selectedEmployee]);

  useEffect(() => {
    fetchCalendarLeaves(calendarMonth);
  }, [calendarMonth, fetchCalendarLeaves]);

  const refreshEmployeeData = useCallback(async (empNo, targetMonth = selectedMonth) => {
    if (!empNo) return;
    try {
      const monthVal = targetMonth || selectedMonth;
      if (!monthVal) return;

      const url = `/api/attendance?month=${monthVal}&empNo=${empNo}`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.success) return;

      const updateDataset = (prevData) => {
        if (!prevData) return prevData;

        const otherLogs = (prevData.allLogs || []).filter(row => row.empNo !== empNo && row.emp_no !== empNo);
        const otherLeaves = (prevData.leaves || []).filter(row => row.empNo !== empNo && row.emp_no !== empNo);
        const otherCorrections = (prevData.corrections || []).filter(row => row.emp_no !== empNo);
        const otherOverrides = (prevData.overrides || []).filter(row => row.emp_no !== empNo);
        const otherManualCheckins = (prevData.manualCheckins || []).filter(row => row.empNo !== empNo && row.emp_no !== empNo);
        const otherOvertimeRounds = (prevData.overtimeRounds || []).filter(row => row.emp_no !== empNo);

        const newLogs = json.allLogs || [];
        const newLeaves = json.leaves || [];
        const newCorrections = json.corrections || [];
        const newOverrides = json.overrides || [];
        const newManualCheckins = json.manualCheckins || [];
        const newOvertimeRounds = json.overtimeRounds || [];

        const mergedLogs = mergeUnique([...otherLogs, ...newLogs], (row) => [
          row?.id,
          row?.empNo || row?.emp_no || '',
          row?.logTime || row?.log_time || '',
          row?.workDate || row?.work_date || '',
          row?.eventType || row?.event_type || '',
          row?.checkType || row?.check_type || '',
        ].join('|'));

        const mergedLeaves = mergeUnique([...otherLeaves, ...newLeaves], (row) => [
          row?.id,
          row?.empNo || row?.emp_no || '',
          row?.startDate || row?.start_date || '',
          row?.endDate || row?.end_date || '',
          row?.leaveName || row?.leave_name || '',
        ].join('|'));

        const mergedCorrections = mergeUnique([...otherCorrections, ...newCorrections], (row) => [
          row?.id,
          row?.emp_no || '',
          row?.work_date || '',
          row?.corrected_out_time || '',
        ].join('|'));

        const mergedOverrides = mergeUnique([...otherOverrides, ...newOverrides], (row) => [
          row?.id,
          row?.emp_no || '',
          row?.work_date || '',
          row?.schedule_start || '',
          row?.schedule_end || '',
          row?.note || '',
        ].join('|'));

        const mergedManualCheckins = mergeUnique([...otherManualCheckins, ...newManualCheckins], (row) => [
          row?.id,
          row?.empNo || row?.emp_no || '',
          row?.workDate || row?.work_date || '',
          row?.checkTime || row?.check_time || '',
          row?.checkType || row?.check_type || '',
        ].join('|'));

        const mergedOvertimeRounds = mergeUnique([...otherOvertimeRounds, ...newOvertimeRounds], (row) => row?.emp_no || '');

        return {
          ...prevData,
          allLogs: mergedLogs,
          leaves: mergedLeaves,
          corrections: mergedCorrections,
          overrides: mergedOverrides,
          manualCheckins: mergedManualCheckins,
          overtimeRounds: mergedOvertimeRounds,
        };
      };

      // 1. Update cache for the full month if it exists
      const cachedFullMonth = monthDataCacheRef.current.get(monthVal);
      if (cachedFullMonth && cachedFullMonth.json) {
        cachedFullMonth.json = updateDataset(cachedFullMonth.json);
      }

      // 2. Set/update employee-specific cache
      const empCacheKey = `${monthVal}_${empNo}`;
      monthDataCacheRef.current.set(empCacheKey, { success: true, json, monthKey: monthVal });

      // 3. Update monthlyData state (only if it matches the current active month)
      if (monthVal === selectedMonth) {
        setMonthlyData((prev) => {
          if (!prev) return null;
          const isSingleEmpTab = activeTab === 'TRACKER' || activeTab === 'MY_PORTAL';
          if (isSingleEmpTab) {
            return mergeMonthlyResponses([{ success: true, json, monthKey: monthVal }]);
          }
          return updateDataset(prev);
        });
      }

      // 4. Update calendar leaves cache (always update cache using target month key)
      const calendarKey = String(monthVal || '').trim();
      const cachedCalendarLeaves = calendarLeavesCacheRef.current.get(calendarKey);
      if (cachedCalendarLeaves) {
        const otherLeaves = cachedCalendarLeaves.filter(row => row.empNo !== empNo && row.emp_no !== empNo);
        const newLeaves = json.leaves || [];
        const mergedCalendarLeaves = mergeUnique([...otherLeaves, ...newLeaves], (row) => [
          row?.id,
          row?.empNo || row?.emp_no || '',
          row?.startDate || row?.start_date || '',
          row?.endDate || row?.end_date || '',
          row?.leaveName || row?.leave_name || '',
        ].join('|'));
        calendarLeavesCacheRef.current.set(calendarKey, mergedCalendarLeaves);
      }

      // Update calendar leaves state (only if it matches the current active month)
      if (monthVal === selectedMonth) {
        setCalendarLeaves((prev) => {
          if (!prev) return [];
          const otherLeaves = prev.filter(row => row.empNo !== empNo && row.emp_no !== empNo);
          const newLeaves = json.leaves || [];
          return mergeUnique([...otherLeaves, ...newLeaves], (row) => [
            row?.id,
            row?.empNo || row?.emp_no || '',
            row?.startDate || row?.start_date || '',
            row?.endDate || row?.end_date || '',
            row?.leaveName || row?.leave_name || '',
          ].join('|'));
        });
      }

      // 5. Silently update today's data
      await fetchTodayData(true);
    } catch (e) {
      console.error('refreshEmployeeData error:', e);
    }
  }, [selectedMonth, activeTab, fetchTodayData]);

  const refreshAllData = useCallback(async () => {
    monthDataCacheRef.current.clear();
    calendarLeavesCacheRef.current.clear();
    const isSingleEmpTab = activeTab === 'TRACKER' || activeTab === 'MY_PORTAL';
    const empNoFilter = isSingleEmpTab ? (selectedEmployee || myEmpNo) : null;
    await Promise.all([
      fetchTodayData(true),
      fetchMonthlyData(selectedMonth, empNoFilter),
      fetchCalendarLeaves(calendarMonth),
    ]);
  }, [calendarMonth, fetchCalendarLeaves, fetchMonthlyData, fetchTodayData, selectedMonth, activeTab, selectedEmployee, myEmpNo]);

  return {
    data,
    loading,
    refreshing,
    monthlyData,
    monthlyLoading,
    calendarLeaves,
    fetchTodayData,
    refreshAllData,
    refreshEmployeeData,
  };
}

