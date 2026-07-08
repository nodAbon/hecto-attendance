'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarRange, Clock, RefreshCw } from 'lucide-react';
import { formatLocalDateStr, getCalendarCells } from '../DashboardCalendarWidget';
import MonthSearchPicker from '../MonthSearchPicker';
import { clampToHalfHourSteps, formatHalfHourSteps, getMonthRangeList, getYearWeekStartKey, normalizeEmpNoKey, isManagedAttendanceDept } from '../../lib/dashboardUtils';
import { getKstDateKey } from '../../lib/kstDate';
import { isDateHoliday } from '../../lib/leaveRules';
import useHolidayCalendar from '../../lib/useHolidayCalendar';
import TrackerCalendarSection from './tracker/TrackerCalendarSection';
import {
  buildScheduleOverrideMap,
  buildTeamSchedulePatternMap,
  resolveAllowOvertimeForSchedule,
  resolveSchedulePairForDate,
} from '../../lib/scheduleResolver';
import { getAdjustmentMinutes, getAdjustmentDeductionMinutes, getScheduleDurationMinutes } from '../../lib/scheduleUtils';

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

const calculateWorkHours = (inTime, outTime) => {
  if (!inTime || !outTime || outTime === '-') return null;
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  if (diffMinutes < 0) return null;
  const h = Math.floor(diffMinutes / 60);
  const m = diffMinutes % 60;
  return `${h}시간 ${m}분`;
};

const formatScheduleText = (schedule) => {
  if (!schedule) return '-';
  if (schedule.start && schedule.end) return `${schedule.start} - ${schedule.end}`;
  if (schedule.start) return `${schedule.start} -`;
  if (schedule.end) return `- ${schedule.end}`;
  return '-';
};

const parseScheduleRequestNote = (note) => {
  const raw = String(note || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { reason: raw };
  }
};

const getManualDecisionLabel = (decision) => {
  if (decision === 'approved') return '승인완료';
  if (decision === 'rejected') return '반려됨';
  return '대기중';
};

const getCurrentLocalTimePart = () => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
};

const getKstNowIsoDate = () => getKstDateKey(new Date());

const buildKstDateTime = (dateKey, timePart) => `${dateKey}T${String(timePart || '00:00').substring(0, 5)}:00+09:00`;

const getTodayKstDateTime = (timePart) => buildKstDateTime(getKstNowIsoDate(), timePart);


const formatStoredTimePart = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.includes('T')) {
    try {
      const d = new Date(text);
      if (!isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).formatToParts(d);
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        if (hour && minute) return `${hour}:${minute}`;
      }
    } catch (e) {
      // fallback below
    }
  }
  if (text.includes('T')) return text.split('T')[1].substring(0, 5);
  if (text.includes(' ')) return text.split(' ')[1].substring(0, 5);
  return text.substring(0, 5);
};

const formatTimeHours = (minutes = 0) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return `${formatHalfHourSteps(safeMinutes)}시간`;
};

const formatDuration = (minutes = 0) => {
  const safeMinutes = Math.abs(Math.round(Number(minutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}시간 ${String(mins).padStart(2, '0')}분`;
};

const getLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00+09:00`);

const toDateOnly = (date) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const getLeaveWorkedMinutes = (leave) => {
  if (!leave) return 0;
  const leaveDays = parseFloat(leave.leaveDays || '0');
  if (leave.leaveCode === '12' || leave.leaveCode === '60' || leaveDays >= 1.0) return 8 * 60;
  if (
    leave.leaveCode === '16'
    || leave.leaveCode === '17'
    || leave.leaveCode === '61'
    || leave.leaveCode === '62'
    || leaveDays === 0.5
  ) return 4 * 60;
  return 2 * 60;
};

const WEEK_HOURS_MINUTES = 40 * 60;

const overtimeMonthCache = new Map();
const overtimeMonthInFlight = new Map();

const fetchAttendanceMonth = async (month, empNo) => {
  if (!month) return null;
  const cacheKey = empNo ? `${month}_${empNo}` : month;
  if (overtimeMonthCache.has(cacheKey)) return overtimeMonthCache.get(cacheKey);
  if (overtimeMonthInFlight.has(cacheKey)) return overtimeMonthInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const url = empNo ? `/api/attendance?month=${month}&empNo=${empNo}` : `/api/attendance?month=${month}`;
      const res = await fetch(url);
      const json = await res.json();
      const value = json?.success ? json : null;
      if (value) overtimeMonthCache.set(cacheKey, value);
      return value;
    } catch (err) {
      console.error('[TrackerTab] month fetch failed:', month, err);
      return null;
    } finally {
      overtimeMonthInFlight.delete(cacheKey);
    }
  })();

  overtimeMonthInFlight.set(cacheKey, promise);
  return promise;
};

const buildPeriodMonthList = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  const start = getLocalDate(startDate);
  const end = getLocalDate(endDate);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endCursor) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

function TrackerTab({
  activeTab,
  myEmpNo,
  myDept,
  isAdmin,
  isLeader,
  selectedEmployee,
  setSelectedEmployee,
  selectedMonth,
  setSelectedMonth,
  monthlyLoading,
  monthlyData,
  visibleTrackerEmployees,
  refreshData,
}) {
  const [manualNote, setManualNote] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [requestTime, setRequestTime] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState('퇴근');
  const [selectedModalDate, setSelectedModalDate] = useState('');
  const [correctionModalType, setCorrectionModalType] = useState('퇴근');
  const [correctionModalTime, setCorrectionModalTime] = useState('');
  const [correctionModalNote, setCorrectionModalNote] = useState('');
  const [scheduleModalStart, setScheduleModalStart] = useState('08:00');
  const [scheduleModalEnd, setScheduleModalEnd] = useState('17:00');
  const [scheduleModalAllowOvertime, setScheduleModalAllowOvertime] = useState(true);
  const [scheduleModalNote, setScheduleModalNote] = useState('');
  const [scheduleModalMessage, setScheduleModalMessage] = useState(null);
  const [modalMessage, setModalMessage] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [overtimeRangeData, setOvertimeRangeData] = useState({
    logs: [],
    leaves: [],
    corrections: [],
  });
  const monthOptions = useMemo(() => getMonthRangeList(240, 240), []);
  useHolidayCalendar(selectedMonth);
  const changeMonth = (direction) => {
    const idx = monthOptions.indexOf(selectedMonth);
    if (idx < 0) return;
    const nextIndex = direction === 'prev'
      ? Math.max(idx - 1, 0)
      : Math.min(idx + 1, monthOptions.length - 1);
    setSelectedMonth(monthOptions[nextIndex] || selectedMonth);
  };

  const todayStr = formatLocalDateStr();
  const activeEmpNo = myEmpNo || selectedEmployee || '';

  const handleManualCheck = async (type) => {
    setIsCheckinLoading(true);
    setActionMessage(null);

    try {
      const workDate = getKstNowIsoDate();

      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType: type,
          workDate,
          note: manualNote,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: json.message });
        setManualNote('');
        if (refreshData) await refreshData({ empNo: activeEmpNo });
      } else {
        setActionMessage({ type: 'error', text: json.error || '요청 처리에 실패했습니다.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: '기록 처리 중 오류가 발생했습니다.' });
    } finally {
      setIsCheckinLoading(false);
    }
  };

  const handleCorrectionRequest = async () => {
    setIsCheckinLoading(true);
    setActionMessage(null);

    try {
      if (!requestTime) {
        setActionMessage({ type: 'error', text: '수정할 시간을 먼저 선택해주세요.' });
        return;
      }

      const workDate = getKstNowIsoDate();
      const correctedOutTime = getTodayKstDateTime(requestTime);
      const checkType = `수정요청-${correctionTarget}`;

      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType,
          checkTime: correctedOutTime,
          workDate,
          note: manualNote || '출퇴근 기록 수정 요청',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: '수정 요청이 접수되었습니다.' });
        setManualNote('');
        if (refreshData) await refreshData({ empNo: activeEmpNo });
      } else {
        setActionMessage({ type: 'error', text: json.error || '수정 요청 처리에 실패했습니다.' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: '수정 요청 중 오류가 발생했습니다.' });
    } finally {
      setIsCheckinLoading(false);
    }
  };

  const openTrackerDateModal = (dateStr) => {
    if (!dateStr) return;
    setSelectedModalDate(dateStr);
  };

  const closeTrackerDateModal = () => {
    setSelectedModalDate('');
    setModalMessage(null);
    setScheduleModalMessage(null);
    setModalSaving(false);
  };

  const handleModalCorrectionRequest = async () => {
    if (!selectedModalDate) return;
    if (!correctionModalTime) {
      setModalMessage({ type: 'error', text: '수정할 시간을 선택해주세요.' });
      return;
    }

    setModalSaving(true);
    setModalMessage(null);
    try {
      const checkType = `수정요청-${correctionModalType}`;
      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType,
          checkTime: buildKstDateTime(selectedModalDate, correctionModalTime),
          workDate: selectedModalDate,
          note: correctionModalNote || '출퇴근 기록 수정 요청',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setModalMessage({ type: 'success', text: '수정 요청이 접수되었습니다.' });
        setCorrectionModalNote('');
        if (refreshData) await refreshData({ empNo: activeEmpNo });
      } else {
        setModalMessage({ type: 'error', text: json.error || '수정 요청 처리에 실패했습니다.' });
      }
    } catch (err) {
      setModalMessage({ type: 'error', text: '수정 요청 중 오류가 발생했습니다.' });
    } finally {
      setModalSaving(false);
    }
  };

  const handleModalScheduleRequest = async () => {
    if (!selectedModalDate || !scheduleModalStart || !scheduleModalEnd) {
      setModalMessage({ type: 'error', text: '근무일정을 선택해주세요.' });
      return;
    }

    const currentScheduleStart = String(selectedModalSummary?.schedule?.start || selectedModalSummary?.schedule?.scheduleStart || '').trim();
    const currentScheduleEnd = String(selectedModalSummary?.schedule?.end || selectedModalSummary?.schedule?.scheduleEnd || '').trim();
    const requestReason = String(scheduleModalNote || '').trim();

    if (!requestReason) {
      setScheduleModalMessage({ type: 'error', text: '근무일정 조정 사유를 반드시 입력해주세요.' });
      return;
    }

    if (
      currentScheduleStart
      && currentScheduleEnd
      && currentScheduleStart === String(scheduleModalStart).trim()
      && currentScheduleEnd === String(scheduleModalEnd).trim()
    ) {
      setScheduleModalMessage({ type: 'error', text: '현재 근무일정과 동일한 값은 요청할 수 없습니다.' });
      return;
    }

    setModalSaving(true);
    setScheduleModalMessage(null);
    try {
      const notePayload = {
        scheduleStart: scheduleModalStart,
        scheduleEnd: scheduleModalEnd,
        allowOvertime: scheduleModalAllowOvertime,
        reason: requestReason,
        currentScheduleStart: currentScheduleStart || null,
        currentScheduleEnd: currentScheduleEnd || null,
      };
      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType: '근무일정조정',
          checkTime: buildKstDateTime(selectedModalDate, scheduleModalStart),
          workDate: selectedModalDate,
          note: JSON.stringify(notePayload),
          currentScheduleStart,
          currentScheduleEnd,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setScheduleModalMessage({ type: 'success', text: '근무일정 조정요청이 접수되었습니다.' });
        setScheduleModalNote('');
        if (refreshData) await refreshData({ empNo: activeEmpNo });
      } else {
        setScheduleModalMessage({ type: 'error', text: json.error || '근무일정 조정요청에 실패했습니다.' });
      }
    } catch (err) {
      setScheduleModalMessage({ type: 'error', text: '근무일정 조정요청 중 오류가 발생했습니다.' });
    } finally {
      setModalSaving(false);
    }
  };

  const trackerGridData = useMemo(() => {
    if (!activeEmpNo || monthlyLoading) return null;

    const allEmps = visibleTrackerEmployees || [];
    const activeEmployeeKey = normalizeEmpNoKey(activeEmpNo);
    const targetEmp = allEmps.find((e) => normalizeEmpNoKey(e.empNo) === activeEmployeeKey) || null;
    if (!targetEmp) return null;

    const logs = monthlyData?.allLogs || [];
    const cells = getCalendarCells(selectedMonth);

    const overrides = (monthlyData?.overrides || []).filter((o) => normalizeEmpNoKey(o.emp_no) === activeEmployeeKey);
    const overrideMap = {};
    const overrideLookup = buildScheduleOverrideMap(overrides);
    overrides.forEach((row) => {
      overrideMap[row.work_date] = row;
    });
    const teamPatternLookup = buildTeamSchedulePatternMap(monthlyData?.teamSchedulePatterns || []);
    const normalizedDept = String(targetEmp.dept || '').trim().replace(/\s+/g, '');

    const empDayLogs = {};
    logs
      .filter((log) => normalizeEmpNoKey(log.empNo) === activeEmployeeKey)
      .filter((log) => !String(log.adjustedRole || log.eventType || '').includes('무시'))
      .forEach((log) => {
        const dateStr = log.workDate || String(log.logTime || '').split(' ')[0];
        const timeStr = getAttendanceTimePart(log.logTime);
        if (!empDayLogs[dateStr]) empDayLogs[dateStr] = [];
        empDayLogs[dateStr].push({
          timeStr,
          workOrder: Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null,
          log,
        });
      });

    const dailyStats = {};
    Object.entries(empDayLogs).forEach(([dateStr, entries]) => {
      if (!dailyStats[dateStr]) {
        dailyStats[dateStr] = {
          in: null,
          out: null,
          isLate: false,
          correctedOutTime: null,
          correctionReason: null,
          hasManual: false,
        };
      }

      const sorted = entries.sort((a, b) => {
        const aPriority = Number.isFinite(Number(a.log?.manualPriority)) ? Number(a.log.manualPriority) : 1;
        const bPriority = Number.isFinite(Number(b.log?.manualPriority)) ? Number(b.log.manualPriority) : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aOrder = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : null;
        const bOrder = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : null;
        if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
        if (aOrder !== null && bOrder === null) return -1;
        if (aOrder === null && bOrder !== null) return 1;
        return a.timeStr.localeCompare(b.timeStr) || String(a.log.logTime || '').localeCompare(String(b.log.logTime || ''));
      });

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      dailyStats[dateStr].in = first.timeStr;
      dailyStats[dateStr].isLate = Boolean(first.log.isLate);
      dailyStats[dateStr].hasManual = sorted.some((item) => Boolean(item.log?.isManual));

      if (sorted.length > 1 && last.timeStr !== first.timeStr) {
        dailyStats[dateStr].out = last.timeStr;
        if (last.log.correctedOutTime) {
          dailyStats[dateStr].correctedOutTime = getAttendanceTimePart(last.log.correctedOutTime);
          dailyStats[dateStr].correctionReason = last.log.correctionReason || '';
        }
      }
    });

    const daySchedules = {};
    cells.forEach((cell) => {
      if (cell.empty) return;
      const override = overrideLookup.get(`${activeEmployeeKey}_${cell.dateStr}`) || null;
      const teamPattern = teamPatternLookup.get(`${normalizedDept}_${cell.dateStr}`) || null;
      const resolvedSchedule = resolveSchedulePairForDate({
        dept: targetEmp.dept || '',
        dateStr: cell.dateStr,
        baseScheduleStart: targetEmp.baseScheduleTime || targetEmp.scheduleTime || '08:00',
        baseScheduleEnd: targetEmp.baseScheduleEndTime || '',
        override,
        teamPattern,
      });
      if (resolvedSchedule) {
        daySchedules[cell.dateStr] = resolvedSchedule;
      }
    });

    let workingDaysCount = 0;
    let latenessCount = 0;
    let totalHolidayWorkHours = 0;
    Object.entries(dailyStats).forEach(([dateStr, stat]) => {
      if (stat.in) workingDaysCount += 1;
      if (stat.isLate) latenessCount += 1;
      if (isDateHoliday(dateStr) && stat.in && (stat.out || stat.correctedOutTime)) {
        const workHours = calculateWorkHours(stat.in, stat.correctedOutTime || stat.out);
        if (workHours) {
          const hours = Number(workHours.split('시간')[0]) || 0;
          totalHolidayWorkHours += hours;
        }
      }
    });

    return {
      targetEmp,
      cells,
      dailyStats,
      overrideMap,
      daySchedules,
      workingDaysCount,
      latenessCount,
      totalHolidayWorkHours,
    };
  }, [activeEmpNo, monthlyLoading, monthlyData, selectedMonth, visibleTrackerEmployees]);

  const todaySummary = useMemo(() => {
    if (!trackerGridData) return null;
    return {
      stat: trackerGridData.dailyStats?.[todayStr] || null,
      schedule: trackerGridData.daySchedules?.[todayStr] || null,
    };
  }, [trackerGridData, todayStr]);

  const selectedModalSummary = useMemo(() => {
    if (!trackerGridData || !selectedModalDate) return null;
    return {
      date: selectedModalDate,
      stat: trackerGridData.dailyStats?.[selectedModalDate] || null,
      schedule: trackerGridData.daySchedules?.[selectedModalDate] || null,
      override: trackerGridData.overrideMap?.[selectedModalDate] || null,
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [selectedModalDate, trackerGridData?.dailyStats, trackerGridData?.daySchedules, trackerGridData?.overrideMap]);

  const selectedModalLogs = useMemo(() => {
    if (!trackerGridData || !selectedModalDate || !activeEmpNo) return [];
    const empKey = normalizeEmpNoKey(activeEmpNo);
    return (monthlyData?.allLogs || [])
      .filter((log) => normalizeEmpNoKey(log.empNo || log.emp_no || '') === empKey)
      .filter((log) => String(log.workDate || log.work_date || '').slice(0, 10) === selectedModalDate)
      .filter((log) => !String(log.adjustedRole || log.eventType || '').includes('무시'))
      .sort((a, b) => String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || '')));
  }, [activeEmpNo, monthlyData?.allLogs, selectedModalDate, trackerGridData]);

  const scheduleRequestHistory = useMemo(() => {
    if (!activeEmpNo || !selectedModalDate) return [];
    const empKey = normalizeEmpNoKey(activeEmpNo);
    return (monthlyData?.manualCheckins || [])
      .filter((req) => normalizeEmpNoKey(req.emp_no || '') === empKey)
      .filter((req) => String(req.work_date || '').slice(0, 10) === selectedModalDate)
      .map((req) => ({
        req,
        meta: parseScheduleRequestNote(req.note),
      }))
      .sort((a, b) => String(b.req.created_at || '').localeCompare(String(a.req.created_at || '')));
  }, [activeEmpNo, monthlyData?.manualCheckins, selectedModalDate]);

  const isScheduleRequestSameAsCurrent = useMemo(() => {
    const currentStart = String(selectedModalSummary?.schedule?.start || selectedModalSummary?.schedule?.scheduleStart || '').trim();
    const currentEnd = String(selectedModalSummary?.schedule?.end || selectedModalSummary?.schedule?.scheduleEnd || '').trim();
    if (!currentStart || !currentEnd) return false;
    return (
      currentStart === String(scheduleModalStart || '').trim()
      && currentEnd === String(scheduleModalEnd || '').trim()
    );
  }, [scheduleModalEnd, scheduleModalStart, selectedModalSummary]);

  const hasTodayAttendance = Boolean(
    todaySummary?.stat?.in
    || todaySummary?.stat?.out
    || todaySummary?.stat?.correctedOutTime
  );

  const reflectedRequestTime = useMemo(() => {
    const stat = todaySummary?.stat || null;
    if (!stat) return '';
    if (correctionTarget === '출근') return stat.in || '';
    if (correctionTarget === '퇴근') return stat.correctedOutTime || stat.out || '';
    return '';
  }, [todaySummary, correctionTarget]);

  const [prevTodayAttendanceKey, setPrevTodayAttendanceKey] = useState({ hasTodayAttendance, reflectedRequestTime, activeEmpNo });
  if (
    hasTodayAttendance !== prevTodayAttendanceKey.hasTodayAttendance
    || reflectedRequestTime !== prevTodayAttendanceKey.reflectedRequestTime
    || activeEmpNo !== prevTodayAttendanceKey.activeEmpNo
  ) {
    setPrevTodayAttendanceKey({ hasTodayAttendance, reflectedRequestTime, activeEmpNo });
    if (!hasTodayAttendance) {
      setRequestTime('');
      setCorrectionTarget('퇴근');
    } else {
      setRequestTime(reflectedRequestTime || '');
    }
  }

  const [prevModalOpenKey, setPrevModalOpenKey] = useState({ selectedModalDate, selectedModalSummary });
  if (
    selectedModalDate !== prevModalOpenKey.selectedModalDate
    || selectedModalSummary !== prevModalOpenKey.selectedModalSummary
  ) {
    setPrevModalOpenKey({ selectedModalDate, selectedModalSummary });
    if (selectedModalDate && selectedModalSummary) {
      const stat = selectedModalSummary.stat || null;
      const schedule = selectedModalSummary.schedule || null;
      const hasOut = Boolean(stat?.correctedOutTime || stat?.out);
      const defaultType = hasOut ? '퇴근' : '출근';
      setCorrectionModalType(defaultType);
      setCorrectionModalTime(defaultType === '출근'
        ? String(stat?.in || '').slice(0, 5)
        : String(stat?.correctedOutTime || stat?.out || '').slice(0, 5));
      setCorrectionModalNote('');
      setScheduleModalStart(String(schedule?.start || trackerGridData?.targetEmp?.baseScheduleTime || trackerGridData?.targetEmp?.scheduleTime || '08:00').slice(0, 5));
      setScheduleModalEnd(String(schedule?.end || trackerGridData?.targetEmp?.baseScheduleEndTime || trackerGridData?.targetEmp?.scheduleEndTime || '17:00').slice(0, 5));
      setScheduleModalAllowOvertime(selectedModalSummary.override?.allow_overtime !== false);
      setScheduleModalNote('');
      setModalMessage(null);
    }
  }

  const managedDept = useMemo(
    () => isManagedAttendanceDept(myDept || trackerGridData?.targetEmp?.dept || ''),
    [myDept, trackerGridData?.targetEmp?.dept]
  );

  const scheduleOverrideMap = useMemo(() => {
    const map = new Map();
    (monthlyData?.overrides || []).forEach((row) => {
      const empNo = normalizeEmpNoKey(row.emp_no || row.empNo || '');
      const workDate = String(row.work_date || row.workDate || '').trim();
      if (!empNo || !workDate) return;
      map.set(`${empNo}_${workDate}`, row);
    });
    return map;
  }, [monthlyData?.overrides]);

  const teamPatternMap = useMemo(() => buildTeamSchedulePatternMap(monthlyData?.teamSchedulePatterns || []), [monthlyData?.teamSchedulePatterns]);

  const overtimeRoundSummary = useMemo(() => {
    if (!managedDept || !trackerGridData?.targetEmp) return null;
    const empKey = normalizeEmpNoKey(trackerGridData.targetEmp.empNo || '');
    const overtimeRound = (monthlyData?.overtimeRounds || []).find((row) => normalizeEmpNoKey(row.emp_no || '') === empKey) || null;
    if (!overtimeRound) return null;
    return {
      roundName: String(overtimeRound.round_name || '1차').trim(),
      startDate: String(overtimeRound.start_date || '').trim(),
      endDate: String(overtimeRound.end_date || '').trim(),
    };
  }, [managedDept, monthlyData?.overtimeRounds, trackerGridData]);

  const overtimeEndingSoonLabel = useMemo(() => {
    if (!managedDept || !overtimeRoundSummary?.endDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(overtimeRoundSummary.endDate);
    end.setHours(0, 0, 0, 0);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 14) {
      return diffDays === 0 ? 'D-Day' : `D-${diffDays}`;
    }
    return null;
  }, [managedDept, overtimeRoundSummary]);

  const overtimePeriodMonths = useMemo(() => {
    if (!overtimeRoundSummary?.startDate || !overtimeRoundSummary?.endDate) return [];
    return buildPeriodMonthList(overtimeRoundSummary.startDate, overtimeRoundSummary.endDate);
  }, [overtimeRoundSummary]);

  useEffect(() => {
    let cancelled = false;

    const mergeUnique = (items = [], keyFn) => {
      const map = new Map();
      (items || []).forEach((item) => {
        const key = keyFn(item);
        if (!key || !map.has(key)) {
          map.set(key, item);
        }
      });
      return Array.from(map.values());
    };

    const loadRangeData = async () => {
      if (!managedDept || !overtimePeriodMonths.length) {
        setOvertimeRangeData({ logs: [], leaves: [], corrections: [] });
        return;
      }

      try {
        const monthsToFetch = overtimePeriodMonths.filter((month) => month !== selectedMonth);
        const responses = [];
        for (const month of monthsToFetch) {
          responses.push(await fetchAttendanceMonth(month, activeEmpNo));
        }
        if (cancelled) return;

        const datasets = [monthlyData, ...responses.filter(Boolean)];
        const mergedLogs = mergeUnique(
          datasets.flatMap((data) => data?.allLogs || []),
          (log) => String(log?.id || `${log?.empNo || ''}_${log?.logTime || ''}_${log?.gateName || ''}_${log?.eventType || ''}`)
        );
        const mergedLeaves = mergeUnique(
          datasets.flatMap((data) => data?.leaves || []),
          (leave) => String(leave?.empNo || '') + '_' + String(leave?.startDate || '') + '_' + String(leave?.endDate || '') + '_' + String(leave?.leaveCode || '') + '_' + String(leave?.leaveName || '')
        );
        const mergedCorrections = mergeUnique(
          datasets.flatMap((data) => data?.corrections || []),
          (corr) => `${corr?.emp_no || ''}_${corr?.work_date || ''}`
        );

        setOvertimeRangeData({
          logs: mergedLogs,
          leaves: mergedLeaves,
          corrections: mergedCorrections,
        });
      } catch (err) {
        console.error('[TrackerTab] overtime range load failed:', err);
        if (!cancelled) {
          setOvertimeRangeData({
            logs: monthlyData?.allLogs || [],
            leaves: monthlyData?.leaves || [],
            corrections: monthlyData?.corrections || [],
          });
        }
      }
    };

    const schedule = typeof window !== 'undefined' && window.requestIdleCallback
      ? window.requestIdleCallback(() => {
        if (!cancelled) loadRangeData();
      }, { timeout: 1000 })
      : setTimeout(() => {
        if (!cancelled) loadRangeData();
      }, 0);

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && window.cancelIdleCallback && typeof schedule === 'number') {
        window.cancelIdleCallback(schedule);
      } else {
        clearTimeout(schedule);
      }
    };
  }, [managedDept, monthlyData, overtimePeriodMonths, selectedMonth, activeEmpNo]);

  const overtimeStats = useMemo(() => {
    if (!managedDept || !trackerGridData?.targetEmp || !overtimeRoundSummary?.startDate || !overtimeRoundSummary?.endDate) {
      return { averageWeeklyMinutes: 0, totalAdjustments: 0 };
    }

    const emp = trackerGridData.targetEmp;
    const empNo = normalizeEmpNoKey(emp.empNo || emp.emp_no || '');
    const dept = String(emp.dept || '').trim();
    const logs = overtimeRangeData.logs || monthlyData?.allLogs || [];
    const corrections = overtimeRangeData.corrections || monthlyData?.corrections || [];
    const correctionMap = new Map();

    corrections.forEach((c) => {
      correctionMap.set(`${normalizeEmpNoKey(c.emp_no)}_${c.work_date}`, c.corrected_out_time);
    });

    const dailyLogs = {};
    logs
      .filter((log) => normalizeEmpNoKey(log.empNo || log.emp_no) === empNo && log.workDate >= overtimeRoundSummary.startDate && log.workDate <= overtimeRoundSummary.endDate)
      .forEach((log) => {
        if (!dailyLogs[log.workDate]) dailyLogs[log.workDate] = [];
        dailyLogs[log.workDate].push(log);
      });

    let totalAdjustmentMinutes = 0;
    let totalWorkMinutes = 0;
    let scheduledDaysCount = 0;

    const start = getLocalDate(overtimeRoundSummary.startDate);
    const end = getLocalDate(overtimeRoundSummary.endDate);

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const override = scheduleOverrideMap.get(`${empNo}_${dateStr}`);
      const teamPattern = teamPatternMap.get(`${String(dept).replace(/\s+/g, '')}_${dateStr}`) || null;
      
      const schedulePair = resolveSchedulePairForDate({
        dept,
        dateStr,
        baseScheduleStart: emp?.baseScheduleTime || emp?.scheduleTime || '08:00',
        baseScheduleEnd: emp?.baseScheduleEndTime || emp?.scheduleEndTime || '',
        override,
        teamPattern,
      });

      if (!schedulePair) {
        continue;
      }

      scheduledDaysCount++;

      const allowOvertime = isManagedAttendanceDept(dept)
        ? resolveAllowOvertimeForSchedule({
            resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
            override,
            fallbackAllowOvertime: isManagedAttendanceDept(dept),
          })
        : false;

      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
      });

      let overtimeMinutes = 0;
      if (allowOvertime) {
        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${empNo}_${dateStr}`);
        let outTime = null;

        if (correctedOut) {
          outTime = formatStoredTimePart(correctedOut);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = getAttendanceTimePart(lastLog.logTime);
          }
        }

        if (outTime) {
          const rawOvertime = getAdjustmentMinutes({
            scheduleEnd: schedulePair.end,
            actualOut: outTime,
          });
          overtimeMinutes = clampToHalfHourSteps(rawOvertime);
        }
      }

      const deductionMinutes = getAdjustmentDeductionMinutes(override?.note);
      const adjustmentDeltaMinutes = overtimeMinutes - deductionMinutes;
      totalAdjustmentMinutes += adjustmentDeltaMinutes;

      const baseSchedulePair = resolveSchedulePairForDate({
        dept,
        dateStr,
        baseScheduleStart: emp?.baseScheduleTime || emp?.scheduleTime || '08:00',
        baseScheduleEnd: emp?.baseScheduleEndTime || emp?.scheduleEndTime || '',
        override: null,
        teamPattern,
      });
      const baseScheduleMinutes = Math.max(
        0,
        getScheduleDurationMinutes(
          baseSchedulePair?.start || schedulePair.start,
          baseSchedulePair?.end || schedulePair.end,
        ) - 60,
      );
      totalWorkMinutes += (baseScheduleMinutes + adjustmentDeltaMinutes);
    }

    const averageWeeklyMinutes = scheduledDaysCount > 0
      ? Math.round((totalWorkMinutes / scheduledDaysCount) * 5)
      : 0;

    const totalAdjustments = Math.round((totalAdjustmentMinutes / 60) * 2) / 2;

    return { averageWeeklyMinutes, totalAdjustments };
  }, [managedDept, monthlyData?.allLogs, monthlyData?.corrections, overtimeRangeData, overtimeRoundSummary, scheduleOverrideMap, teamPatternMap, trackerGridData]);

  const overtimeResidualLabel = useMemo(() => {
    const totalAdjustments = Number(overtimeStats.totalAdjustments || 0);
    return `${totalAdjustments > 0 ? '+' : ''}${totalAdjustments.toFixed(1)}`;
  }, [overtimeStats.totalAdjustments]);

  return (
    <div className="tracker-surface">
      <div className="tracker-personal-grid">
        <div className="card tracker-panel tracker-personal-card tracker-personal-card--request">
          <div className="tracker-personal-card__head">
            <div>
              <div className="tracker-personal-card__eyebrow">수동 출퇴근 요청</div>
              <h3 className="tracker-personal-card__title">출근 / 퇴근 요청</h3>
              <p className="tracker-personal-card__sub">메모를 남기고 필요한 시점에 출근 또는 퇴근 요청을 보냅니다.</p>
            </div>
            <span className="tracker-schedule-pill tracker-schedule-pill--request">본인 전용</span>
          </div>

          {actionMessage && (
            <div className={`tracker-personal-alert tracker-personal-alert--${actionMessage.type}`}>
              {actionMessage.text}
            </div>
          )}

          <label className="tracker-personal-label" htmlFor="tracker-note">
            {hasTodayAttendance ? '수정 사유' : '요청 메모'}
          </label>
          <input
            id="tracker-note"
            type="text"
            placeholder={hasTodayAttendance ? '예: 수정 사유를 입력' : '예: 외근 후 출근, 퇴근 누락, 특이사항을 입력'}
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            className="tracker-personal-input"
          />

          {hasTodayAttendance && (
            <div className="tracker-correction-row">
              <div className="tracker-correction-field">
                <label className="tracker-personal-label" htmlFor="tracker-correction-target">
                  수정 대상
                </label>
                <select
                  id="tracker-correction-target"
                  value={correctionTarget}
                  onChange={(e) => setCorrectionTarget(e.target.value)}
                  className="tracker-personal-input"
                  style={{ paddingRight: '28px' }}
                  disabled={isCheckinLoading}
                >
                  <option value="출근">출근</option>
                  <option value="퇴근">퇴근</option>
                </select>
              </div>

              <div className="tracker-correction-field">
                <label className="tracker-personal-label" htmlFor="tracker-request-time">
                  수정할 시간
                </label>
                <input
                  id="tracker-request-time"
                  type="time"
                  value={requestTime}
                  onChange={(e) => setRequestTime(e.target.value)}
                  className="tracker-personal-input"
                />
              </div>

              <button
                type="button"
                onClick={handleCorrectionRequest}
                disabled={isCheckinLoading}
                className="tracker-request-btn tracker-request-btn--checkout tracker-correction-action"
                style={{
                  background: 'linear-gradient(180deg, rgba(91, 136, 214, 0.12), rgba(91, 136, 214, 0.06))',
                  borderColor: 'rgba(91, 136, 214, 0.28)',
                  color: 'var(--blue)',
                }}
              >
                <BadgeCheck style={{ width: 16, height: 16 }} />
                <span>{correctionTarget === '출근' ? '출근 수정 요청' : '퇴근 수정 요청'}</span>
              </button>
            </div>
          )}

          <div className="tracker-request-actions" style={hasTodayAttendance ? { display: 'none' } : undefined}>
            {hasTodayAttendance ? (
              null
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleManualCheck('출근')}
                  disabled={isCheckinLoading}
                  className="tracker-request-btn tracker-request-btn--checkin"
                  style={{
                    background: 'linear-gradient(180deg, rgba(95, 169, 113, 0.12), rgba(95, 169, 113, 0.06))',
                    borderColor: 'rgba(95, 169, 113, 0.28)',
                    color: 'var(--green)',
                  }}
                >
                  <Clock style={{ width: 16, height: 16 }} />
                  <span>출근 요청</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleManualCheck('퇴근')}
                  disabled={isCheckinLoading}
                  className="tracker-request-btn tracker-request-btn--checkout"
                  style={{
                    background: 'linear-gradient(180deg, rgba(91, 136, 214, 0.12), rgba(91, 136, 214, 0.06))',
                    borderColor: 'rgba(91, 136, 214, 0.28)',
                    color: 'var(--blue)',
                  }}
                >
                  <BadgeCheck style={{ width: 16, height: 16 }} />
                  <span>퇴근 요청</span>
                </button>
              </>
            )}
          </div>

          <div className="tracker-personal-note">
            요청은 메모와 함께 기록됩니다. 실제 출퇴근 이력은 아래 월간 캘린더에서 다시 확인할 수 있습니다.
          </div>
        </div>

        <div className="card tracker-panel tracker-personal-card tracker-personal-card--status">
          <div className="tracker-personal-card__head">
            <div>
              <div className="tracker-personal-card__eyebrow">오늘 실제 출퇴근</div>
              <h3 className="tracker-personal-card__title">{todayStr}</h3>
              <p className="tracker-personal-card__sub">오늘 찍힌 실제 출입기록을 요약해서 보여줍니다.</p>
            </div>
            <span className="tracker-schedule-pill tracker-schedule-pill--status">실시간</span>
          </div>

          <div className="tracker-log-stack">
            <div className="tracker-log-row">
              <span className="tracker-log-row__label">출근</span>
              <span className="tracker-log-row__value tracker-log-row__value--green">{todaySummary?.stat?.in || '-'}</span>
            </div>
            <div className="tracker-log-row">
              <span className="tracker-log-row__label">퇴근</span>
              <span className="tracker-log-row__value">
                {todaySummary?.stat?.correctedOutTime || todaySummary?.stat?.out || '-'}
              </span>
            </div>
            {todaySummary?.stat?.hasManual ? (
              <div className="tracker-log-row tracker-log-row--info">
                <span className="tracker-log-row__label">표시</span>
                <span className="tracker-log-row__value">
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(251, 191, 36, 0.12)',
                    border: '1px solid rgba(251, 191, 36, 0.24)',
                    color: 'var(--amber)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    수동 반영
                  </span>
                </span>
              </div>
            ) : null}
            {managedDept ? (
              <div className="tracker-log-row tracker-log-row--info">
                <span className="tracker-log-row__label">초과근무</span>
                <span className="tracker-log-row__value tracker-log-row__value--info">외부사업팀 기준으로 월간 캘린더에서 반영됩니다.</span>
              </div>
            ) : null}
          </div>

          <div className="tracker-personal-foot">
            <CalendarRange style={{ width: 15, height: 15 }} />
            <span>아래 월간 캘린더에서 일자별 기록과 휴가를 함께 확인할 수 있습니다.</span>
          </div>
        </div>

        <div 
          className="card tracker-panel tracker-personal-card tracker-personal-card--schedule"
          style={overtimeEndingSoonLabel ? {
            borderColor: 'var(--amber)',
            boxShadow: '0 0 16px rgba(245, 158, 11, 0.16)',
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.01))'
          } : undefined}
        >
          <div className="tracker-personal-card__head">
            <div>
              <div className="tracker-personal-card__eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{managedDept ? '초과근무 관리' : '내 근무일정'}</span>
                {overtimeEndingSoonLabel && (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    background: 'var(--amber)',
                    color: '#fff',
                    padding: '1.5px 5px',
                    borderRadius: '4px',
                    display: 'inline-block',
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 2px 4px rgba(245,158,11,0.2)'
                  }}>
                    마감 {overtimeEndingSoonLabel}
                  </span>
                )}
              </div>
              <h3 className="tracker-personal-card__title">
                {managedDept
                  ? (overtimeRoundSummary?.roundName || '-')
                  : formatScheduleText(todaySummary?.schedule)}
              </h3>
              <p className="tracker-personal-card__sub">
                {managedDept
                  ? '초과근무 관리 메뉴의 기간과 잔여조정시간을 그대로 보여줍니다.'
                  : '오늘 적용되는 근무일정을 기준으로 표시합니다.'}
              </p>
            </div>
            <span className="tracker-schedule-pill tracker-schedule-pill--schedule">
              {managedDept ? '관리' : '일정'}
            </span>
          </div>

          <div className="tracker-schedule-card">
            <div className="tracker-schedule-card__row">
              <span className="tracker-schedule-card__label">
                {managedDept ? '초과근무 시작일' : '출근 기준'}
              </span>
              <strong className="tracker-schedule-card__value">
                {managedDept ? (overtimeRoundSummary?.startDate || '-') : (todaySummary?.schedule?.start || '-')}
              </strong>
            </div>
            <div className="tracker-schedule-card__row">
              <span className="tracker-schedule-card__label">
                {managedDept ? '초과근무 종료일' : '퇴근 기준'}
              </span>
              <strong className="tracker-schedule-card__value" style={overtimeEndingSoonLabel ? { color: 'var(--amber)', fontWeight: 800 } : undefined}>
                {managedDept ? (overtimeRoundSummary?.endDate || '-') : (todaySummary?.schedule?.end || '-')}
              </strong>
            </div>
            <div className="tracker-schedule-card__row">
              <span className="tracker-schedule-card__label">잔여 조정</span>
              <strong className="tracker-schedule-card__value tracker-schedule-card__value--soft">
                {managedDept ? overtimeResidualLabel : '-'}
              </strong>
            </div>
          </div>

          <div className="tracker-personal-note tracker-personal-note--schedule">
            {managedDept
              ? '초과근무 관리 메뉴의 기간을 그대로 가져와 보여줍니다.'
              : '근무일정이 없는 날은 일정 카드가 비어 보이도록 유지하고, 실제 출퇴근 기록만 캘린더에서 확인합니다.'}
          </div>
        </div>
      </div>

      <div className="card tracker-panel tracker-panel--main tracker-personal-calendar">
        <div className="card-header tracker-personal-calendar__header">
          <div>
            <h3 className="card-title">월간 근태 기록</h3>
            <p className="card-subtitle">본인 근태, 휴가, 조정된 일정이 캘린더 형태로 정리됩니다.</p>
          </div>

          <MonthSearchPicker
            label="조회 월"
            value={selectedMonth}
            onChange={setSelectedMonth}
            monthOptions={monthOptions}
            onPrev={() => changeMonth('prev')}
            onNext={() => changeMonth('next')}
          />
        </div>

        {monthlyLoading ? (
          <div className="tracker-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260, flexDirection: 'column', gap: '10px' }}>
            <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>근태 데이터를 불러오는 중...</span>
          </div>
        ) : (
          <TrackerCalendarSection
            trackerGridData={trackerGridData}
            selectedEmployee={activeEmpNo}
            monthlyData={monthlyData}
            showOvertimeNote={managedDept}
            activeDate={selectedModalDate}
            onDateSelect={openTrackerDateModal}
          />
        )}
      </div>

      {selectedModalDate && selectedModalSummary ? (
        <div
          role="dialog"
          aria-modal="true"
          className="tracker-date-modal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(15, 23, 42, 0.68)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={closeTrackerDateModal}
        >
          <div
            className="card tracker-date-modal__panel"
            style={{
              width: 'min(920px, 100%)',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'auto',
              padding: 18,
              position: 'relative',
              opacity: 1,
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>월간 근태 상세</div>
                <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{selectedModalDate}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={closeTrackerDateModal} aria-label="닫기">
                ✕
              </button>
            </div>

            {modalMessage ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: `1px solid ${modalMessage.type === 'success' ? 'rgba(95, 169, 113, 0.24)' : 'rgba(239, 68, 68, 0.24)'}`,
                  background: modalMessage.type === 'success' ? 'rgba(95, 169, 113, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  color: modalMessage.type === 'success' ? 'var(--green)' : 'var(--red)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {modalMessage.text}
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
              <div className="card tracker-date-modal__section" style={{ padding: 14, gap: 12, opacity: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>선택 일자 출퇴근 기록</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginTop: 2 }}>
                      {selectedModalDate}
                    </div>
                  </div>
                  <span className="tracker-schedule-pill tracker-schedule-pill--status">기록 {selectedModalLogs.length}</span>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedModalLogs.length === 0 ? (
                    <div style={{ padding: '14px 12px', borderRadius: 14, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
                      해당 일자의 출퇴근 기록이 없습니다.
                    </div>
                  ) : selectedModalLogs.map((log, idx) => {
                    const isManual = Boolean(log.isManual);
                    const role = String(log.adjustedRole || log.eventType || '').trim();
                    const timeText = String(log.logTime || '').slice(11, 16);
                    return (
                      <div
                        key={`${log.id || idx}-${timeText}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 14,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-card)',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 3 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                            {isManual ? '수동' : '원본'} {role || '출입'}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                            {String(log.logTime || '').replace('T', ' ').substring(11, 16)}
                            {log.note ? ` · ${log.note}` : ''}
                          </div>
                        </div>
                        <span
                          className="tracker-schedule-pill tracker-schedule-pill--request"
                          style={{ background: isManual ? 'rgba(251, 191, 36, 0.14)' : 'rgba(148, 163, 184, 0.14)' }}
                        >
                          {role || (isManual ? '수동' : '기록')}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {selectedModalSummary.stat ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>현재 상태</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>출근</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{selectedModalSummary.stat.in || '-'}</div>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>퇴근</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--blue)' }}>
                          {selectedModalSummary.stat.correctedOutTime || selectedModalSummary.stat.out || '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="card tracker-date-modal__section" style={{ padding: 14, gap: 12, opacity: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>출퇴근 기록 수정요청</div>
                {selectedModalSummary.stat ? (
                  <>
                    <div className="tracker-correction-row" style={{ gridTemplateColumns: '0.85fr 1.15fr' }}>
                      <div className="tracker-correction-field">
                        <label className="tracker-personal-label">수정 대상</label>
                        <select
                          value={correctionModalType}
                          onChange={(e) => setCorrectionModalType(e.target.value)}
                          className="tracker-personal-input"
                        >
                          <option value="출근">출근</option>
                          <option value="퇴근">퇴근</option>
                        </select>
                      </div>
                      <div className="tracker-correction-field">
                        <label className="tracker-personal-label">수정할 시간</label>
                        <input
                          type="time"
                          value={correctionModalTime}
                          onChange={(e) => setCorrectionModalTime(e.target.value)}
                          className="tracker-personal-input"
                        />
                      </div>
                    </div>
                    <label className="tracker-personal-label">사유 / 메모</label>
                    <textarea
                      rows={4}
                      value={correctionModalNote}
                      onChange={(e) => setCorrectionModalNote(e.target.value)}
                      className="tracker-personal-input"
                      placeholder="예: 누락된 퇴근시간 보정, 출근시간 수정 요청"
                      style={{ minHeight: 110, resize: 'vertical' }}
                    />
                    <button
                      type="button"
                      className="tracker-request-btn tracker-request-btn--checkout"
                      onClick={handleModalCorrectionRequest}
                      disabled={modalSaving}
                      style={{ width: '100%', background: 'linear-gradient(180deg, rgba(91, 136, 214, 0.12), rgba(91, 136, 214, 0.06))', borderColor: 'rgba(91, 136, 214, 0.28)', color: 'var(--blue)' }}
                    >
                      <BadgeCheck style={{ width: 16, height: 16 }} />
                      <span>{correctionModalType === '출근' ? '출근 수정 요청' : '퇴근 수정 요청'}</span>
                    </button>
                  </>
                ) : (
                  <div style={{ padding: '12px 14px', borderRadius: 14, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
                    출퇴근 기록이 있는 날짜에서만 수정요청을 보낼 수 있습니다.
                  </div>
                )}

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>근무일정 조정요청</div>
                <div className="tracker-correction-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="tracker-correction-field">
                    <label className="tracker-personal-label">출근시간</label>
                    <input
                      type="time"
                      value={scheduleModalStart}
                      onChange={(e) => setScheduleModalStart(e.target.value)}
                      className="tracker-personal-input"
                    />
                  </div>
                  <div className="tracker-correction-field">
                    <label className="tracker-personal-label">퇴근시간</label>
                    <input
                      type="time"
                      value={scheduleModalEnd}
                      onChange={(e) => setScheduleModalEnd(e.target.value)}
                      className="tracker-personal-input"
                    />
                  </div>
                </div>
                <label className="tracker-personal-input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scheduleModalAllowOvertime}
                    onChange={(e) => setScheduleModalAllowOvertime(e.target.checked)}
                  />
                  <span>초과근무 허용</span>
                </label>
                <label className="tracker-personal-label">사유 / 메모</label>
                <textarea
                  rows={4}
                  value={scheduleModalNote}
                  onChange={(e) => setScheduleModalNote(e.target.value)}
                  className="tracker-personal-input"
                  placeholder="예: 일정 변경, 야간 전환, 업무 조정"
                  style={{ minHeight: 110, resize: 'vertical' }}
                />
                <button
                  type="button"
                  className="tracker-request-btn tracker-request-btn--checkout"
                  onClick={handleModalScheduleRequest}
                  disabled={modalSaving || isScheduleRequestSameAsCurrent}
                  style={{ width: '100%', background: 'linear-gradient(180deg, rgba(95, 169, 113, 0.12), rgba(95, 169, 113, 0.06))', borderColor: 'rgba(95, 169, 113, 0.28)', color: 'var(--green)' }}
                >
                  <CalendarRange style={{ width: 16, height: 16 }} />
                  <span>{isScheduleRequestSameAsCurrent ? '현재 일정과 동일함' : '근무일정 조정 요청'}</span>
                </button>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, textAlign: 'center', marginTop: -4 }}>
                  {isScheduleRequestSameAsCurrent
                    ? '현재 근무일정과 동일한 값은 요청할 수 없습니다.'
                    : '근무일정 변경 사유를 아래에 작성한 뒤 요청해주세요.'}
                </div>
                {scheduleModalMessage ? (
                  <div
                    style={{
                      marginTop: 4,
                      padding: '8px 10px',
                      borderRadius: 12,
                      border: `1px solid ${scheduleModalMessage.type === 'success' ? 'rgba(95, 169, 113, 0.24)' : 'rgba(239, 68, 68, 0.24)'}`,
                      background: scheduleModalMessage.type === 'success' ? 'rgba(95, 169, 113, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      color: scheduleModalMessage.type === 'success' ? 'var(--green)' : 'var(--red)',
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.45,
                    }}
                  >
                    {scheduleModalMessage.text}
                  </div>
                ) : null}

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                {scheduleRequestHistory.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>신청내역</div>
                      <span className="tracker-schedule-pill tracker-schedule-pill--status">상태 확인</span>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {scheduleRequestHistory.map(({ req, meta }) => {
                        const status = getManualDecisionLabel(req.admin_decision);
                        const statusColor = req.admin_decision === 'approved'
                          ? 'var(--green)'
                          : req.admin_decision === 'rejected'
                            ? 'var(--red)'
                            : 'var(--amber)';
                        const statusBg = req.admin_decision === 'approved'
                          ? 'rgba(95, 169, 113, 0.12)'
                          : req.admin_decision === 'rejected'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(245, 158, 11, 0.12)';
                        const statusBorder = req.admin_decision === 'approved'
                          ? 'rgba(95, 169, 113, 0.24)'
                          : req.admin_decision === 'rejected'
                            ? 'rgba(239, 68, 68, 0.24)'
                            : 'rgba(245, 158, 11, 0.24)';
                        const checkType = String(req.check_type || '');
                        let titleText = checkType;
                        if (checkType.includes('출근')) {
                          titleText = `출근 수정 요청 (${formatStoredTimePart(req.check_time)})`;
                        } else if (checkType.includes('퇴근')) {
                          titleText = `퇴근 수정 요청 (${formatStoredTimePart(req.check_time)})`;
                        } else if (checkType.includes('일정')) {
                          const s = meta.scheduleStart || String(req.schedule_start || '').substring(0, 5);
                          const e = meta.scheduleEnd || String(req.schedule_end || '').substring(0, 5);
                          if (s && e) {
                            titleText = `근무일정 조정 요청 (${s}-${e})`;
                          } else {
                            titleText = `근무일정 조정 요청`;
                          }
                        }

                        let reasonText = '';
                        if (typeof meta.reason === 'string') {
                          reasonText = meta.reason.trim();
                        } else if (!String(req.note || '').trim().startsWith('{')) {
                          reasonText = String(req.note || '').trim();
                        }

                        return (
                          <div
                            key={req.id}
                            style={{
                              display: 'grid',
                              gap: 6,
                              padding: '11px 12px',
                              borderRadius: 14,
                              border: '1px solid var(--border)',
                              background: 'var(--bg-card)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>
                                {String(req.work_date || '').slice(0, 10)}
                              </div>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: statusBg,
                                color: statusColor,
                                border: `1px solid ${statusBorder}`,
                              }}>
                                {status}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.45, fontWeight: 600 }}>
                              {titleText}
                            </div>
                            {reasonText ? (
                              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
                                {reasonText}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(TrackerTab);
