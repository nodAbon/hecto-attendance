'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ScheduleCalendarPanel from '../ScheduleCalendarPanel';
import MonthSearchPicker from '../MonthSearchPicker';
import { getHolidayName, getLeaveMeta } from '../../lib/leaveRules';
import { clampToHalfHourSteps, formatHalfHourSteps, getMonthRangeList, isExternalBusinessDept, isManagedAttendanceDept, normalizeDeptName, normalizeEmpNoKey } from '../../lib/dashboardUtils';
import { inferNightScheduleEndTime } from '../../lib/nightScheduleRules';
import { MONTHLY_DEFAULT_NOTE, buildScheduleOverrideMap, buildTeamSchedulePatternMap, resolveSchedulePairForDate } from '../../lib/scheduleResolver';
import useHolidayCalendar from '../../lib/useHolidayCalendar';
import { getKstDateKey, shiftMonthKey } from '../../lib/kstDate';
import { toMinutes, getAdjustmentMinutes, TIME_OPTIONS } from '../../lib/scheduleUtils';

const getLeaveVariantClass = (meta) => {
  return String(meta?.variantClassName || '').trim();
};

const getDaysInMonth = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const days = [];
  while (date.getMonth() === month - 1) {
    const dayNum = date.getDate();
    const dayOfWeek = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    days.push({
      dateStr: year + '-' + String(month).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0'),
      formatted: month + '/' + dayNum + '(' + dayOfWeek + ')',
      dayOfWeek,
      dayNum
    });
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getAttendanceTimePart = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const timeText = text.includes(' ')
    ? text.split(' ')[1]
    : text.includes('T')
      ? text.split('T')[1]
      : text;
  return timeText.substring(0, 5);
};


function MonthlyTab({
  monthlyLoading,
  selectedMonth,
  setSelectedMonth,
  visibleMonthlyEmployees,
  monthlyData,
  refreshData,
}) {
  const monthOptions = useMemo(() => getMonthRangeList(240, 240), []);
  useHolidayCalendar(selectedMonth);
  useHolidayCalendar(shiftMonthKey(selectedMonth, -1));
  useHolidayCalendar(shiftMonthKey(selectedMonth, 1));
  const days = getDaysInMonth(selectedMonth);
  const todayStr = getKstDateKey();
  const tableScrollRef = useRef(null);
  const todayHeaderRef = useRef(null);
  const allEmps = visibleMonthlyEmployees;
  const logs = monthlyData?.allLogs || [];
  const overrideLookup = useMemo(() => buildScheduleOverrideMap(monthlyData?.overrides || []), [monthlyData?.overrides]);
  const teamPatternLookup = useMemo(
    () => buildTeamSchedulePatternMap(monthlyData?.teamSchedulePatterns || []),
    [monthlyData?.teamSchedulePatterns]
  );
  const [modalEmployeeEmpNo, setModalEmployeeEmpNo] = useState('');
  const [modalMonth, setModalMonth] = useState('');
  const [modalData, setModalData] = useState(null);
  const [modalDataLoading, setModalDataLoading] = useState(false);
  const [modalSelectedDate, setModalSelectedDate] = useState('');
  const [modalSelectedDates, setModalSelectedDates] = useState([]);
  const [modalBatchMode, setModalBatchMode] = useState(false);
  const [modalOverrideStart, setModalOverrideStart] = useState('08:00');
  const [modalOverrideEnd, setModalOverrideEnd] = useState('17:00');
  const [modalAllowOvertime, setModalAllowOvertime] = useState(true);
  const [modalOverrideNote, setModalOverrideNote] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [localMonthlyBaseSchedules, setLocalMonthlyBaseSchedules] = useState({});

  useHolidayCalendar(modalMonth);

  useEffect(() => {
    if (!modalEmployeeEmpNo || !modalMonth) return;
    if (modalMonth === selectedMonth) {
      setModalData(null);
      return;
    }
    let cancelled = false;
    const fetchModalData = async () => {
      setModalDataLoading(true);
      try {
        const res = await fetch(`/api/attendance?month=${modalMonth}&empNo=${modalEmployeeEmpNo}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json.success) setModalData(json);
      } catch (err) {
        console.error('[MonthlyTab] Modal data fetch error:', err);
      } finally {
        if (!cancelled) setModalDataLoading(false);
      }
    };
    fetchModalData();
    return () => { cancelled = true; };
  }, [modalEmployeeEmpNo, modalMonth, selectedMonth]);

  const scrollToTodayColumn = () => {
    const target = todayHeaderRef.current;
    const wrapper = tableScrollRef.current;
    if (!target || !wrapper || !wrapper.scrollWidth || !wrapper.clientWidth) return;
    const targetLeft = Math.max(0, (target.offsetLeft || 0) - 180);
    wrapper.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };

  const scheduleScrollToTodayColumn = (retries = 20) => {
    const attempt = (remaining) => {
      const target = todayHeaderRef.current;
      const wrapper = tableScrollRef.current;
      if (target && wrapper && wrapper.scrollWidth > wrapper.clientWidth) {
        const targetLeft = Math.max(0, (target.offsetLeft || 0) - 180);
        wrapper.scrollTo({ left: targetLeft, behavior: 'smooth' });
        return;
      }
      if (remaining <= 0) return;
      window.requestAnimationFrame(() => attempt(remaining - 1));
    };
    attempt(retries);
  };

  const scrollTableByDays = (direction = 1) => {
    const wrapper = tableScrollRef.current;
    if (!wrapper) return;
    const dayColWidth = 110;
    const nextLeft = wrapper.scrollLeft + (dayColWidth * 5 * direction);
    wrapper.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' });
  };

  useEffect(() => {
    scheduleScrollToTodayColumn();
  }, [selectedMonth, todayStr, monthlyLoading, days.length, allEmps.length, logs.length]);

  useEffect(() => {
    if (monthlyLoading) return undefined;
    const timer = window.setTimeout(() => {
      scheduleScrollToTodayColumn();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selectedMonth, todayStr, monthlyLoading, days.length, allEmps.length, logs.length]);

  useEffect(() => {
    const onWindowKeyDown = (e) => {
      const tagName = String(e.target?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || e.altKey || e.metaKey || e.ctrlKey) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollTableByDays(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollTableByDays(1);
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [selectedMonth, todayStr]);

  // 일자별 집계는 조정된 workDate 기준으로 묶고, 무시하기는 제외한다.
  const gridData = {}; // {empNo: {YYYY-MM-DD: {in: 'HH:MM', out: 'HH:MM', count: N}}}

  logs
    .filter(log => !String(log.adjustedRole || log.eventType || '').includes('무시'))
    .forEach(log => {
      const dateStr = log.workDate || log.logTime.split(' ')[0];
      const rawTimeStr = getAttendanceTimePart(log.logTime);
      const checkoutTimeStr = log.correctedOutTime
        ? getAttendanceTimePart(log.correctedOutTime)
        : rawTimeStr;
      
      const logOrder = Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null;
      const timeOrder = (() => {
        const [h = 0, m = 0] = rawTimeStr.split(':').map((value) => Number(value) || 0);
        return (h * 60) + m;
      })();
      const orderValue = logOrder ?? timeOrder;

      if (!gridData[log.empNo]) gridData[log.empNo] = {};
      if (!gridData[log.empNo][dateStr]) gridData[log.empNo][dateStr] = { in: null, out: null, count: 0, inOrder: null, outOrder: null };

      const day = gridData[log.empNo][dateStr];
      day.count++;
      if (log.isLate) day.isLate = true;
      if (!day.in || day.inOrder === null || orderValue < day.inOrder) {
        day.in = rawTimeStr;
        day.inOrder = orderValue;
      }
      if (!day.out || day.outOrder === null || orderValue > day.outOrder) {
        day.out = checkoutTimeStr;
        day.outOrder = orderValue;
      }
    });

  // 단일 로그(출근만)인 경우 퇴근 제거
  Object.values(gridData).forEach(empData =>
    Object.values(empData).forEach(day => {
      if (day.count <= 1 || day.in === day.out) day.out = null;
    })
  );

  const selectedModalEmployee = useMemo(() => {
    const empNo = String(modalEmployeeEmpNo || '').trim();
    if (!empNo) return null;
    return allEmps.find((emp) => String(emp.empNo || '').trim() === empNo) || null;
  }, [allEmps, modalEmployeeEmpNo]);

  const selectedModalEmployeeWithLocalBase = useMemo(() => {
    if (!selectedModalEmployee) return null;
    const empNo = String(selectedModalEmployee.empNo || '').trim();
    const localBase = localMonthlyBaseSchedules[empNo] || null;
    if (!localBase) return selectedModalEmployee;
    return {
      ...selectedModalEmployee,
      baseScheduleTime: localBase.baseScheduleTime || selectedModalEmployee.baseScheduleTime,
      baseScheduleEndTime: localBase.baseScheduleEndTime || selectedModalEmployee.baseScheduleEndTime,
      scheduleTime: localBase.scheduleTime || selectedModalEmployee.scheduleTime,
      scheduleEndTime: localBase.scheduleEndTime || selectedModalEmployee.scheduleEndTime,
    };
  }, [localMonthlyBaseSchedules, selectedModalEmployee]);

  const activeModalData = modalMonth === selectedMonth ? monthlyData : modalData;

  const selectedModalOverrides = useMemo(() => {
    if (!selectedModalEmployee) return [];
    const monthScope = new Set([
      shiftMonthKey(modalMonth || selectedMonth, -1),
      modalMonth || selectedMonth,
      shiftMonthKey(modalMonth || selectedMonth, 1),
    ].filter(Boolean));
    return (activeModalData?.overrides || [])
      .filter((row) => String(row.emp_no || '').trim() === String(selectedModalEmployee.empNo || '').trim())
      .filter((row) => monthScope.size === 0 || monthScope.has(String(row.work_date || '').slice(0, 7)))
      .sort((a, b) => String(a.work_date || '').localeCompare(String(b.work_date || '')));
  }, [activeModalData?.overrides, selectedModalEmployee, modalMonth, selectedMonth]);

  const selectedModalEmployeeLogs = useMemo(() => {
    if (!selectedModalEmployee) return [];
    const empNo = String(selectedModalEmployee.empNo || '').trim();
    const monthScope = new Set([
      shiftMonthKey(modalMonth || selectedMonth, -1),
      modalMonth || selectedMonth,
      shiftMonthKey(modalMonth || selectedMonth, 1),
    ].filter(Boolean));
    return (activeModalData?.allLogs || [])
      .filter((log) => String(log.empNo || log.emp_no || '').trim() === empNo)
      .filter((log) => monthScope.has(String(log.workDate || log.work_date || '').slice(0, 7)))
      .sort((a, b) => String(a.workDate || a.work_date || '').localeCompare(String(b.workDate || b.work_date || '')) || String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || '')));
  }, [activeModalData?.allLogs, selectedModalEmployee, modalMonth, selectedMonth]);

  const selectedModalEmployeeBaseSchedule = useMemo(() => {
    if (!selectedModalEmployeeWithLocalBase) return '08:00';
    return String(
      selectedModalEmployeeWithLocalBase.baseScheduleTime
      || selectedModalEmployeeWithLocalBase.scheduleTime
      || '08:00'
    ).substring(0, 5) || '08:00';
  }, [selectedModalEmployeeWithLocalBase]);

  const modalGridData = useMemo(() => {
    const data = {};
    if (!selectedModalEmployee?.empNo) return data;
    
    selectedModalEmployeeLogs
      .filter(log => !String(log.adjustedRole || log.eventType || '').includes('무시'))
      .forEach(log => {
        const empNo = log.empNo || log.emp_no;
        if (!empNo) return;
        const dateStr = log.workDate || log.logTime.split(' ')[0];
        const rawTimeStr = getAttendanceTimePart(log.logTime);
        const checkoutTimeStr = log.correctedOutTime
          ? getAttendanceTimePart(log.correctedOutTime)
          : rawTimeStr;
        
        const logOrder = Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null;
        const timeOrder = (() => {
          const [h = 0, m = 0] = rawTimeStr.split(':').map((value) => Number(value) || 0);
          return (h * 60) + m;
        })();
        const orderValue = logOrder ?? timeOrder;

        if (!data[empNo]) data[empNo] = {};
        if (!data[empNo][dateStr]) data[empNo][dateStr] = { in: null, out: null, count: 0, inOrder: null, outOrder: null };

        const day = data[empNo][dateStr];
        day.count++;
        if (log.isLate) day.isLate = true;
        if (!day.in || day.inOrder === null || orderValue < day.inOrder) {
          day.in = rawTimeStr;
          day.inOrder = orderValue;
        }
        if (!day.out || day.outOrder === null || orderValue > day.outOrder) {
          day.out = checkoutTimeStr;
          day.outOrder = orderValue;
        }
      });

    Object.values(data).forEach(empData =>
      Object.values(empData).forEach(day => {
        if (day.count <= 1 || day.in === day.out) day.out = null;
      })
    );
    return data;
  }, [selectedModalEmployeeLogs, selectedModalEmployee?.empNo]);

  const selectedModalEmployeeBaseScheduleLabel = useMemo(() => {
    if (!selectedModalEmployeeWithLocalBase) return '08:00';
    const start = String(
      selectedModalEmployeeWithLocalBase.baseScheduleTime
      || selectedModalEmployeeWithLocalBase.scheduleTime
      || '08:00'
    ).substring(0, 5) || '08:00';
    const end = String(
      selectedModalEmployeeWithLocalBase.baseScheduleEndTime
      || selectedModalEmployeeWithLocalBase.scheduleEndTime
      || inferNightScheduleEndTime({ dept: selectedModalEmployeeWithLocalBase.dept || '', start, end: '' })
      || ''
    ).substring(0, 5);
    return end ? `${start} - ${end}` : start;
  }, [selectedModalEmployeeWithLocalBase]);
  const [modalBaseStart, setModalBaseStart] = useState('08:00');
  const [modalBaseEnd, setModalBaseEnd] = useState('17:00');

  useEffect(() => {
    if (!selectedModalEmployeeWithLocalBase) return;
    const start = String(
      selectedModalEmployeeWithLocalBase.baseScheduleTime
      || selectedModalEmployeeWithLocalBase.scheduleTime
      || '08:00'
    ).substring(0, 5) || '08:00';
    const end = String(
      selectedModalEmployeeWithLocalBase.baseScheduleEndTime
      || selectedModalEmployeeWithLocalBase.scheduleEndTime
      || inferNightScheduleEndTime({ dept: selectedModalEmployeeWithLocalBase.dept || '', start, end: '' })
      || '17:00'
    ).substring(0, 5) || '17:00';
    setModalBaseStart(start);
    setModalBaseEnd(end);
  }, [selectedModalEmployeeWithLocalBase]);

  const clearMonthlyModalForm = () => {
    setModalSelectedDate('');
    setModalSelectedDates([]);
    setModalBatchMode(false);
    setModalOverrideStart('08:00');
    setModalOverrideEnd('17:00');
    setModalAllowOvertime(true);
    setModalOverrideNote('');
  };

  const handleMonthlySaveBaseSchedule = async () => {
    if (!selectedModalEmployee?.empNo) return;
    setModalSaving(true);
    try {
      const res = await fetch('/api/employees/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: selectedModalEmployee.empNo,
          scheduleStart: modalBaseStart,
          scheduleEnd: modalBaseEnd,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || '월 기본 근무일정 저장에 실패했습니다.');
      const empNoKey = String(selectedModalEmployee.empNo || '').trim();
      const savedSchedule = json?.schedules?.[empNoKey] || null;
      const nextStart = String(savedSchedule?.scheduleStart || modalBaseStart || '08:00').substring(0, 5);
      const nextEnd = String(savedSchedule?.scheduleEnd || modalBaseEnd || '17:00').substring(0, 5);
      setLocalMonthlyBaseSchedules((prev) => ({
        ...prev,
        [empNoKey]: {
          baseScheduleTime: nextStart,
          baseScheduleEndTime: nextEnd,
          scheduleTime: nextStart,
          scheduleEndTime: nextEnd,
        },
      }));
      alert('월 기본 근무일정이 저장되었습니다.');
      if (refreshData) await refreshData({ empNo: selectedModalEmployee.empNo });
    } catch (err) {
      alert(err.message || '월 기본 근무일정 저장 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  const openMonthlyModal = (empNo) => {
    setModalEmployeeEmpNo(String(empNo || '').trim());
    setModalMonth(selectedMonth);
    setModalData(null);
    clearMonthlyModalForm();
  };

  const closeMonthlyModal = () => {
    setModalEmployeeEmpNo('');
    setModalMonth('');
    setModalData(null);
    clearMonthlyModalForm();
  };

  const handleMonthlyPickDate = (dateStr, override) => {
    if (!selectedModalEmployeeWithLocalBase) return;
    const nextStart = String(
      override?.scheduleStart
      || override?.schedule_start
      || selectedModalEmployeeWithLocalBase.baseScheduleTime
      || selectedModalEmployeeWithLocalBase.scheduleTime
      || '08:00'
    ).substring(0, 5);
    const nextEnd = String(
      override?.scheduleEnd
      || override?.schedule_end
      || inferNightScheduleEndTime({ dept: selectedModalEmployeeWithLocalBase.dept || '', start: nextStart, end: '' })
      || selectedModalEmployeeWithLocalBase.baseScheduleEndTime
      || selectedModalEmployeeWithLocalBase.scheduleEndTime
      || ''
    ).substring(0, 5);
    setModalSelectedDate(dateStr);
    setModalSelectedDates(dateStr ? [dateStr] : []);
    setModalOverrideStart(nextStart || '08:00');
    setModalOverrideEnd(nextEnd || '17:00');
    setModalAllowOvertime(override?.allowOvertime !== false && override?.allow_overtime !== false);
    setModalOverrideNote(String(override?.note || '').trim());
  };

  const handleMonthlyToggleBatchMode = (checked) => {
    setModalBatchMode(Boolean(checked));
    if (!checked && modalSelectedDates.length > 1) {
      const firstDate = modalSelectedDates[0] || modalSelectedDate || '';
      setModalSelectedDates(firstDate ? [firstDate] : []);
      setModalSelectedDate(firstDate);
    }
  };

  const handleMonthlyToggleBatchDate = (dateStr, override) => {
    if (!dateStr) return;
    const normalized = String(dateStr).trim();
    const exists = modalSelectedDates.includes(normalized);
    const nextDates = exists
      ? modalSelectedDates.filter((date) => date !== normalized)
      : [...modalSelectedDates, normalized].sort();
    const fallbackStart = String(
      override?.scheduleStart
      || override?.schedule_start
      || selectedModalEmployeeWithLocalBase?.baseScheduleTime
      || selectedModalEmployeeWithLocalBase?.scheduleTime
      || '08:00'
    ).substring(0, 5);
    const fallbackEnd = String(
      override?.scheduleEnd
      || override?.schedule_end
      || inferNightScheduleEndTime({ dept: selectedModalEmployeeWithLocalBase?.dept || '', start: fallbackStart, end: '' })
      || selectedModalEmployeeWithLocalBase?.baseScheduleEndTime
      || selectedModalEmployeeWithLocalBase?.scheduleEndTime
      || '17:00'
    ).substring(0, 5);
    setModalSelectedDate(normalized);
    setModalSelectedDates(nextDates);
    setModalOverrideStart(fallbackStart || '08:00');
    setModalOverrideEnd(fallbackEnd || '17:00');
    setModalAllowOvertime(override?.allowOvertime !== false && override?.allow_overtime !== false);
    setModalOverrideNote(String(override?.note || '').trim());
  };

  const handleMonthlyChangeOverrideDate = (dateStr, override) => {
    if (!dateStr) return;
    setModalSelectedDate(dateStr);
    if (!modalBatchMode) {
      setModalSelectedDates([dateStr]);
    }
    const fallbackStart = String(
      override?.scheduleStart
      || override?.schedule_start
      || selectedModalEmployeeWithLocalBase?.baseScheduleTime
      || selectedModalEmployeeWithLocalBase?.scheduleTime
      || '08:00'
    ).substring(0, 5);
    const fallbackEnd = String(
      override?.scheduleEnd
      || override?.schedule_end
      || inferNightScheduleEndTime({ dept: selectedModalEmployeeWithLocalBase?.dept || '', start: fallbackStart, end: '' })
      || selectedModalEmployeeWithLocalBase?.baseScheduleEndTime
      || selectedModalEmployeeWithLocalBase?.scheduleEndTime
      || '17:00'
    ).substring(0, 5);
    setModalOverrideStart(fallbackStart || '08:00');
    setModalOverrideEnd(fallbackEnd || '17:00');
    setModalAllowOvertime(override?.allowOvertime !== false && override?.allow_overtime !== false);
    setModalOverrideNote(String(override?.note || '').trim());
  };

  const handleMonthlySubmitOverride = async (e) => {
    e.preventDefault();
    const targetDates = modalSelectedDates.length > 0 ? modalSelectedDates : (modalSelectedDate ? [modalSelectedDate] : []);
    if (!selectedModalEmployee || targetDates.length === 0) return;
    setModalSaving(true);
    try {
      const baseStart = String(modalBaseStart || '08:00').substring(0, 5);
      const baseEnd = String(modalBaseEnd || '17:00').substring(0, 5);
      const normalizedStart = String(modalOverrideStart || '').substring(0, 5);
      const normalizedEnd = String(modalOverrideEnd || '').substring(0, 5);
      const saveDates = targetDates.filter(Boolean);

      const res = await fetch('/api/employees/schedule-override/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: selectedModalEmployee.empNo,
          workDate: saveDates[0],
          workDates: saveDates,
          scheduleStart: normalizedStart || baseStart,
          scheduleEnd: normalizedEnd || baseEnd,
          allowOvertime: modalAllowOvertime,
          note: modalOverrideNote,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || '근무일정 저장에 실패했습니다.');
      if (refreshData) await refreshData({ empNo: selectedModalEmployee.empNo });
      alert('근무일정이 저장되었습니다.');
    } catch (err) {
      alert(err.message || '근무일정 저장 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleMonthlyDeleteOverride = async ({ empNo, workDate }) => {
    if (!empNo || !workDate) return;
    if (!window.confirm('해당 날짜의 근무일정을 삭제할까요?')) return;
    setModalSaving(true);
    try {
      const res = await fetch('/api/employees/schedule-override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo, workDate }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || '근무일정 삭제에 실패했습니다.');
      if (refreshData) await refreshData({ empNo });
      if (String(workDate || '') === modalSelectedDate) {
        setModalSelectedDate('');
        setModalSelectedDates([]);
        setModalOverrideNote('');
        setModalOverrideEnd('17:00');
      }
    } catch (err) {
      alert(err.message || '근무일정 삭제 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  const getMonthlyModalTargetDates = () => (
    modalSelectedDates.length > 0
      ? modalSelectedDates
      : (modalSelectedDate ? [modalSelectedDate] : [])
  );

  const handleMonthlyRemoveSchedule = async (dates = []) => {
    const targetDates = Array.isArray(dates) && dates.length > 0 ? dates : getMonthlyModalTargetDates();
    if (!selectedModalEmployee || targetDates.length === 0) return;
    if (!window.confirm('선택한 날짜를 근무일정 없음으로 바꿀까요?')) return;
    setModalSaving(true);
    try {
      const results = await Promise.all(targetDates.map(async (workDate) => {
        const res = await fetch('/api/employees/schedule-override', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empNo: selectedModalEmployee.empNo,
            workDate,
          }),
        });
        return res.json();
      }));
      const failed = results.find((json) => !json.success);
      if (failed) throw new Error(failed.error || '근무일정 없음 처리에 실패했습니다.');
      if (refreshData) await refreshData({ empNo: selectedModalEmployee.empNo });
    } catch (err) {
      alert(err.message || '근무일정 없음 처리 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  const handleMonthlyRestoreOverride = async (dates = []) => {
    const targetDates = Array.isArray(dates) && dates.length > 0 ? dates : getMonthlyModalTargetDates();
    if (!selectedModalEmployee || targetDates.length === 0) return;
    if (!window.confirm('선택한 날짜를 월 기본 근무일정으로 복원할까요?')) return;
    setModalSaving(true);
    try {
      const results = await Promise.all(targetDates.map(async (workDate) => {
        const res = await fetch('/api/employees/schedule-override/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empNo: selectedModalEmployee.empNo,
            workDates: [workDate],
            scheduleStart: modalBaseStart,
            scheduleEnd: modalBaseEnd,
            allowOvertime: true,
            note: MONTHLY_DEFAULT_NOTE,
          }),
        });
        return res.json();
      }));
      const failed = results.find((json) => !json.success);
      if (failed) throw new Error(failed.error || '복원에 실패했습니다.');
      if (refreshData) await refreshData({ empNo: selectedModalEmployee.empNo });
    } catch (err) {
      alert(err.message || '복원 중 오류가 발생했습니다.');
    } finally {
      setModalSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 className="card-title">월간 출근 현황표</h3>
          <p className="card-subtitle">선택 월의 일자별 임직원 출퇴근 상세 데이터 그리드</p>
        </div>

        {/* Month selector */}
        <MonthSearchPicker
          label="선택 월"
          value={selectedMonth}
          onChange={setSelectedMonth}
          monthOptions={monthOptions}
          onPrev={() => {
            const idx = monthOptions.indexOf(selectedMonth);
            setSelectedMonth(monthOptions[Math.max(idx - 1, 0)] || selectedMonth);
          }}
          onNext={() => {
            const idx = monthOptions.indexOf(selectedMonth);
            setSelectedMonth(monthOptions[Math.min(idx + 1, monthOptions.length - 1)] || selectedMonth);
          }}
          placeholder="YYYY-MM 검색"
        />
      </div>

      {monthlyLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: '10px' }}>
          <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>월간 보고서를 구성 중입니다...</span>
        </div>
      ) : (
        <div
          className="table-wrapper"
          ref={tableScrollRef}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              scrollTableByDays(-1);
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              scrollTableByDays(1);
            }
          }}
          style={{ maxHeight: '600px', overflow: 'auto', outline: 'none' }}
        >
          <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '128px' }} />
              {days.map((d) => (
                <col key={d.dateStr} style={{ width: '110px' }} />
              ))}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-card)' }}>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    top: 0,
                    left: 0,
                    background: 'var(--bg-card)',
                    zIndex: 30,
                    minWidth: '128px',
                    width: '128px',
                    textAlign: 'center',
                    boxShadow: '6px 0 14px -14px rgba(15, 23, 42, 0.28)',
                    borderRight: '1px solid var(--border)',
                  }}
                >
                  임직원
                </th>
                {days.map(d => {
                  const holidayName = getHolidayName(d.dateStr);
                  const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                  const isTodayColumn = d.dateStr === todayStr;
                  return (
                    <th
                      key={d.dateStr}
                      ref={isTodayColumn ? todayHeaderRef : null}
                      style={{ 
                      minWidth: '110px',
                      textAlign: 'center',
                      color: d.dayOfWeek === '일' || !!holidayName ? 'var(--red)' : d.dayOfWeek === '토' ? 'var(--blue)' : 'var(--text-1)',
                      background: isTodayColumn
                        ? 'linear-gradient(180deg, rgba(91, 136, 214, 0.18), rgba(91, 136, 214, 0.08))'
                        : isWE
                          ? 'rgba(239, 68, 68, 0.04)'
                          : 'transparent',
                      position: 'sticky',
                      top: 0,
                      zIndex: isTodayColumn ? 24 : 21,
                      boxShadow: isTodayColumn ? 'inset 0 0 0 1px rgba(91, 136, 214, 0.38)' : undefined,
                      borderRadius: isTodayColumn ? '12px 12px 0 0' : undefined
                    }}
                    >
                      {d.formatted.split('(')[0]}<br/>
                      <small style={{ opacity: 0.8 }}>({d.dayOfWeek})</small>
                      {holidayName && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', marginTop: '2px', lineHeight: 1.2 }}>
                          {holidayName}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allEmps.map(emp => (
                <tr key={emp.empNo}>
                  {(() => {
                    const empKey = normalizeEmpNoKey(emp.empNo);
                    const deptKey = normalizeDeptName(emp.dept);
                    const isExternalDept = isExternalBusinessDept(emp.dept);
                    const monthAdjustmentMinutes = isExternalDept
                      ? days.reduce((sum, d) => {
                          const dayStats = gridData[emp.empNo]?.[d.dateStr];
                          const localBase = localMonthlyBaseSchedules[empKey] || null;
                          const effectiveBaseStart = String(
                            localBase?.baseScheduleTime
                            || emp.baseScheduleTime
                            || emp.scheduleTime
                            || '08:00'
                          ).substring(0, 5);
                          const effectiveBaseEnd = String(
                            localBase?.baseScheduleEndTime
                            || emp.baseScheduleEndTime
                            || emp.scheduleEndTime
                            || ''
                          ).substring(0, 5);
                          const override = overrideLookup.get(`${empKey}_${d.dateStr}`) || null;
                          const teamPattern = teamPatternLookup.get(`${deptKey}_${d.dateStr}`) || null;
                          const resolvedSchedule = resolveSchedulePairForDate({
                            dept: emp.dept || '',
                            dateStr: d.dateStr,
                            baseScheduleStart: effectiveBaseStart || '08:00',
                            baseScheduleEnd: effectiveBaseEnd || '',
                            override,
                            teamPattern,
                          });
                          if (!resolvedSchedule?.end) return sum;
                          if (override && override.allowOvertime === false) return sum;
                          const actualOut = String(dayStats?.out || '').trim();
                          if (!actualOut) return sum;
                          return sum + clampToHalfHourSteps(getAdjustmentMinutes({
                            scheduleEnd: resolvedSchedule.end,
                            actualOut,
                          }));
                        }, 0)
                      : 0;
                    const monthAdjustmentBadge = monthAdjustmentMinutes > 0
                      ? `월 조정 ${formatHalfHourSteps(monthAdjustmentMinutes)}`
                      : '';
                    return (
                      <td
                        key={`${emp.empNo}-name`}
                        rowSpan={1}
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: 'var(--bg-card)',
                          zIndex: 12,
                          fontWeight: 700,
                          borderRight: '1px solid var(--border)',
                          boxShadow: '6px 0 14px -14px rgba(15, 23, 42, 0.28)',
                          paddingLeft: '8px',
                          paddingRight: '8px',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => openMonthlyModal(emp.empNo)}
                          style={{
                            display: 'grid',
                            justifyItems: 'center',
                            gap: '2px',
                            lineHeight: 1.15,
                            width: '100%',
                            textAlign: 'center',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 0,
                            boxShadow: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: 'inherit',
                            minWidth: 0,
                          }}
                        >
                          <span style={{ color: 'var(--text-1)', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                            {emp.name}
                          </span>
                          <small style={{ color: 'var(--text-2)', fontWeight: 500, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                            ({emp.dept})
                          </small>
                          {monthAdjustmentBadge ? (
                            <span
                              className="calendar-day__state-tag"
                              style={{
                                marginTop: 4,
                                paddingInline: 8,
                                paddingBlock: 3,
                                background: 'rgba(220, 38, 38, 0.12)',
                                color: '#b91c1c',
                                borderColor: 'rgba(220, 38, 38, 0.28)',
                                fontSize: 9.5,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {monthAdjustmentBadge}
                            </span>
                          ) : null}
                        </button>
                      </td>
                    );
                  })()}
                  {days.map(d => {
                    const dayStats = gridData[emp.empNo]?.[d.dateStr];
                    const holidayName = getHolidayName(d.dateStr);
                    const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                    const isTodayColumn = d.dateStr === todayStr;
                    const empKey = normalizeEmpNoKey(emp.empNo);
                    const deptKey = normalizeDeptName(emp.dept);
                    const localBase = localMonthlyBaseSchedules[empKey] || null;
                    const effectiveBaseStart = String(
                      localBase?.baseScheduleTime
                      || emp.baseScheduleTime
                      || emp.scheduleTime
                      || '08:00'
                    ).substring(0, 5);
                    const effectiveBaseEnd = String(
                      localBase?.baseScheduleEndTime
                      || emp.baseScheduleEndTime
                      || emp.scheduleEndTime
                      || ''
                    ).substring(0, 5);
                    const override = overrideLookup.get(`${empKey}_${d.dateStr}`) || null;
                    const teamPattern = teamPatternLookup.get(`${deptKey}_${d.dateStr}`) || null;
                    const resolvedSchedule = resolveSchedulePairForDate({
                      dept: emp.dept || '',
                      dateStr: d.dateStr,
                      baseScheduleStart: effectiveBaseStart || '08:00',
                      baseScheduleEnd: effectiveBaseEnd || '',
                      override,
                      teamPattern,
                    });
                    const isManagedDept = isManagedAttendanceDept(emp.dept);
                    
                    // Check leave for this employee
                    const dateCompact = d.dateStr.replace(/-/g, '');
                    const leave = (monthlyData?.leaves || []).find(l => 
                      l.empNo === emp.empNo && 
                      dateCompact >= l.startDate && 
                      dateCompact <= l.endDate
                    );

                    const leaveMeta = leave ? getLeaveMeta(leave, dayStats) : null;
                    const leaveDetail = leave ? getLeaveMeta(leave, dayStats).label : ''; 
                    const timeText = dayStats?.in || dayStats?.out
                      ? String(dayStats.in || '-') + '\n' + String(dayStats.out || '-')
                      : '';
                    const scheduleBadge = isManagedDept && resolvedSchedule
                      && !(resolvedSchedule.start === effectiveBaseStart && resolvedSchedule.end === effectiveBaseEnd)
                      && resolvedSchedule.start && resolvedSchedule.end
                      ? `${resolvedSchedule.start}-${resolvedSchedule.end}`
                      : '';
                    const adjustmentBadge = (() => {
                      if (!isManagedDept) return '';
                      if (!resolvedSchedule?.end) return '';
                      if (override && override.allowOvertime === false) return '';
                      const actualOut = String(dayStats?.out || '').trim();
                      if (!actualOut) return '';
                      const adjustmentMinutes = getAdjustmentMinutes({
                        scheduleEnd: resolvedSchedule.end,
                        actualOut,
                      });
                      if (adjustmentMinutes <= 0) return '';
                      const halfHours = Number(formatHalfHourSteps(adjustmentMinutes));
                      if (!Number.isFinite(halfHours) || halfHours <= 0) return '';
                      return `조정 ${halfHours.toFixed(1)}`;
                    })();
                    return (
                      <td key={d.dateStr} style={{ 
                        textAlign: 'center', fontSize: '12px', whiteSpace: 'pre-line',
                        background: isTodayColumn
                          ? 'linear-gradient(180deg, rgba(91, 136, 214, 0.10), rgba(91, 136, 214, 0.04))'
                          : !resolvedSchedule && isManagedDept
                            ? 'rgba(100, 116, 139, 0.08)'
                            : dayStats?.isLate
                              ? 'rgba(245, 158, 11, 0.12)'
                              : isWE
                                ? 'rgba(239, 68, 68, 0.04)'
                                : 'transparent',
                        color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)',
                        fontWeight: leave ? 700 : 500,
                        boxShadow: isTodayColumn ? 'inset 0 0 0 1px rgba(91, 136, 214, 0.26)' : undefined
                      }}>
                        {leave ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <span
                              className={`calendar-detail__name-chip ${getLeaveVariantClass(leaveMeta)}`.trim()}
                              style={{
                                display: 'block',
                                maxWidth: '100%',
                                paddingInline: 8,
                                paddingBlock: 3,
                                borderRadius: '999px',
                                background: leaveMeta.bg,
                                color: leaveMeta.color,
                                border: '1px solid',
                                borderColor: leaveMeta.border || leaveMeta.borderColor || 'transparent',
                                boxShadow: 'none',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontWeight: 600,
                                fontSize: 9.5,
                                lineHeight: 1.1
                              }}
                            >
                              {leaveDetail}
                            </span>
                            {timeText ? (
                              <span style={{ fontSize: '11px', color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)', fontWeight: 600, lineHeight: 1.25, whiteSpace: 'pre-line' }}>
                                {timeText}
                              </span>
                            ) : null}
                            {scheduleBadge ? (
                              <span
                                className="calendar-day__state-tag"
                                style={{
                                  paddingInline: 8,
                                  paddingBlock: 3,
                                  background: 'rgba(34, 197, 94, 0.14)',
                                  color: 'var(--green)',
                                  borderColor: 'rgba(34, 197, 94, 0.30)',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {scheduleBadge}
                              </span>
                            ) : null}
                            {adjustmentBadge ? (
                              <span
                                className="calendar-day__state-tag"
                                style={{
                                  paddingInline: 8,
                                  paddingBlock: 3,
                                  background: 'rgba(220, 38, 38, 0.12)',
                                  color: '#b91c1c',
                                  borderColor: 'rgba(220, 38, 38, 0.28)',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {adjustmentBadge}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                            {scheduleBadge ? (
                              <span
                                className="calendar-day__state-tag"
                                style={{
                                  paddingInline: 8,
                                  paddingBlock: 3,
                                  background: 'rgba(34, 197, 94, 0.14)',
                                  color: 'var(--green)',
                                  borderColor: 'rgba(34, 197, 94, 0.30)',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {scheduleBadge}
                              </span>
                            ) : null}
                            {adjustmentBadge ? (
                              <span
                                className="calendar-day__state-tag"
                                style={{
                                  paddingInline: 8,
                                  paddingBlock: 3,
                                  background: 'rgba(220, 38, 38, 0.12)',
                                  color: '#b91c1c',
                                  borderColor: 'rgba(220, 38, 38, 0.28)',
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {adjustmentBadge}
                              </span>
                            ) : null}
                            {timeText || ''}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedModalEmployee ? (
        <div
          role="presentation"
          onClick={closeMonthlyModal}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(15, 23, 42, 0.74)',
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '20px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="월간 근태보고 직원 상세"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1180px, 100%)',
              maxHeight: 'calc(100vh - 40px)',
              overflow: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '22px',
              boxShadow: '0 30px 80px rgba(15, 23, 42, 0.32)',
              padding: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>월간 근태보고 상세</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>{selectedModalEmployee.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{selectedModalEmployee.dept}</span>
                </h3>
              </div>
              <button type="button" className="icon-btn" onClick={closeMonthlyModal} title="닫기" aria-label="닫기">
                ×
              </button>
            </div>

            <ScheduleCalendarPanel
              month={modalMonth || selectedMonth}
              onMonthChange={setModalMonth}
              selectedEmployee={selectedModalEmployeeWithLocalBase}
              selectedEmployeeEmpNo={modalEmployeeEmpNo}
              selectedEmployeeBaseScheduleStart={modalBaseStart}
              selectedEmployeeBaseScheduleEnd={modalBaseEnd}
              selectedEmployeeBaseSchedule={selectedModalEmployeeBaseSchedule}
              selectedEmployeeBaseScheduleLabel={`${modalBaseStart} - ${modalBaseEnd}`}
              selectedEmployeeOverrides={selectedModalOverrides}
              selectedEmployeeLogs={selectedModalEmployeeLogs}
              manualCheckins={activeModalData?.manualCheckins || []}
              dailyAttendanceMap={modalGridData}
              calendarLeaves={activeModalData?.leaves || []}
              selectedDate={modalSelectedDate}
              selectedBatchDates={modalSelectedDates}
              batchMode={modalBatchMode}
              onPickDate={handleMonthlyPickDate}
              onSubmitOverride={handleMonthlySubmitOverride}
              onDeleteOverride={handleMonthlyDeleteOverride}
              onRemoveOverride={handleMonthlyRemoveSchedule}
              onRestoreOverride={handleMonthlyRestoreOverride}
              overrideStart={modalOverrideStart}
              overrideEnd={modalOverrideEnd}
              allowOvertime={modalAllowOvertime}
              onChangeOverrideDate={handleMonthlyChangeOverrideDate}
              onChangeOverrideStart={setModalOverrideStart}
              onChangeOverrideEnd={setModalOverrideEnd}
              overrideNote={modalOverrideNote}
              onChangeOverrideNote={setModalOverrideNote}
              modalSaving={modalSaving}
              onToggleBatchMode={handleMonthlyToggleBatchMode}
              onToggleBatchDate={handleMonthlyToggleBatchDate}
              onToggleAllowOvertime={setModalAllowOvertime}
              onRefreshData={refreshData}
              onSaveBaseSchedule={handleMonthlySaveBaseSchedule}
              baseScheduleStart={modalBaseStart}
              baseScheduleEnd={modalBaseEnd}
              onChangeBaseScheduleStart={setModalBaseStart}
              onChangeBaseScheduleEnd={setModalBaseEnd}
              modalSaving={modalSaving}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(MonthlyTab);
