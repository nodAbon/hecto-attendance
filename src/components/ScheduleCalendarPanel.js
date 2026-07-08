'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import MonthSearchPicker from './MonthSearchPicker';
import { formatLocalDateStr } from './DashboardCalendarWidget';
import { clampToHalfHourSteps, formatHalfHourSteps, getYearWeekNumber, isExternalBusinessDept, isManagedAttendanceDept, inferScheduleEndTime } from '../lib/dashboardUtils';
import { getHolidayName, getLeaveMeta } from '../lib/leaveRules';
import { resolveSchedulePairForDate, resolveAllowOvertimeForSchedule, isWeekendDate } from '../lib/scheduleResolver';
import {
  toMinutes,
  normalizeTime,
  getAdjustmentMinutes,
  getAdjustmentDeductionHours,
  getAdjustmentDeductionMinutes,
  stripAdjustmentDeductionNote,
  composeAdjustmentDeductionNote,
  getScheduleDurationMinutes,
  formatWeekTotalLabel,
  formatMonthDayLabel,
  TIME_OPTIONS,
} from '../lib/scheduleUtils';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const CALENDAR_BADGE_BASE_STYLE = {
  paddingInline: 8,
  paddingBlock: 3,
  borderRadius: '999px',
  fontSize: 8.5,
  lineHeight: 1.1,
};
const makeCalendarBadgeStyle = (background, color, borderColor = background) => ({
  ...CALENDAR_BADGE_BASE_STYLE,
  background,
  color,
  borderColor,
});
const ADJUSTMENT_DEDUCTION_OPTIONS = Array.from({ length: 17 }, (_, index) => (index / 2).toFixed(1));
const getScheduleWorkHours = (start = '', end = '') => {
  const minutes = Math.max(0, getScheduleDurationMinutes(start, end) - 60);
  return Math.round((minutes / 60) * 2) / 2;
};
const getSuggestedDeductionHours = ({ baseStart = '', baseEnd = '', overrideStart = '', overrideEnd = '' } = {}) => {
  const baseHours = getScheduleWorkHours(baseStart, baseEnd);
  const overrideHours = getScheduleWorkHours(overrideStart, overrideEnd);
  return Math.max(0, Math.round((baseHours - overrideHours) * 2) / 2);
};
const formatAdjustmentDeltaLabel = (minutes = 0) => {
  const roundedHours = Math.round((minutes / 60) * 2) / 2;
  const absHours = Math.abs(roundedHours);
  const value = Number.isInteger(absHours) ? String(absHours) : absHours.toFixed(1);
  if (roundedHours > 0) return `조정 +${value}시간`;
  if (roundedHours < 0) return `조정 -${value}시간`;
  return '조정 0시간';
};

const pad2 = (value) => String(value).padStart(2, '0');

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
  const leaveDays = parseFloat(leave.leaveDays || leave.leave_days || '0');
  const leaveCode = leave.leaveCode || leave.leave_code;
  if (leaveCode === '12' || leaveCode === '60' || leaveDays >= 1.0) return 8 * 60;
  if (
    leaveCode === '16'
    || leaveCode === '17'
    || leaveCode === '61'
    || leaveCode === '62'
    || leaveDays === 0.5
  ) return 4 * 60;
  return 2 * 60;
};

const getMonthGridCells = (yearMonthStr) => {
  if (!yearMonthStr) return [];
  const [year, month] = String(yearMonthStr).split('-').map(Number);
  if (!year || !month) return [];

  const day = new Date(year, month - 1, 1).getDay();
  const firstDayIndex = day === 0 ? 6 : day - 1;
  const totalDays = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  const cells = [];

  for (let offset = firstDayIndex - 1; offset >= 0; offset -= 1) {
    const day = prevMonthDays - offset;
    const prevDate = new Date(year, month - 2, day);
    cells.push({
      empty: false,
      dayNum: day,
      dateStr: `${prevDate.getFullYear()}-${pad2(prevDate.getMonth() + 1)}-${pad2(prevDate.getDate())}`,
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({
      empty: false,
      dayNum: day,
      dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
      inCurrentMonth: true,
    });
  }

  const nextTarget = 42 - cells.length;
  for (let day = 1; day <= nextTarget; day += 1) {
    const nextDate = new Date(year, month - 1, totalDays + day);
    cells.push({
      empty: false,
      dayNum: day,
      dateStr: `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(nextDate.getDate())}`,
      inCurrentMonth: false,
    });
  }

  return cells;
};

const formatMonthLabel = (yearMonthStr) => {
  const [year, month] = String(yearMonthStr || '').split('-').map(Number);
  if (!year || !month) return '';
  return `${year}년 ${month}월`;
};

const buildOverrideMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = String(row?.work_date || row?.workDate || '').trim();
    if (!key) return;
    const note = String(row?.note || row?.reason || '').trim();
    map.set(key, {
      workDate: key,
      scheduleStart: normalizeTime(row?.schedule_start || row?.scheduleStart || row?.start || ''),
      scheduleEnd: normalizeTime(row?.schedule_end || row?.scheduleEnd || row?.end || ''),
      allowOvertime: row?.allow_overtime !== false && row?.allowOvertime !== false,
      note,
      removed: note === '__SCHEDULE_REMOVED__',
      raw: row,
    });
  });
  return map;
};

const getEmployeeLeavesForDate = (calendarLeaves, empNo, dateStr) => {
  const compact = String(dateStr || '').replace(/-/g, '');
  return (calendarLeaves || [])
    .filter((leave) => String(leave.empNo || leave.emp_no || '').trim() === String(empNo || '').trim())
    .filter((leave) => compact >= String(leave.startDate || leave.start_date || '') && compact <= String(leave.endDate || leave.end_date || ''));
};

const getManualCheckinsForDate = (manualCheckins, empNo, dateStr) => {
  const compact = String(dateStr || '').replace(/-/g, '');
  return (manualCheckins || [])
    .filter((row) => String(row.empNo || row.emp_no || '').trim() === String(empNo || '').trim())
    .filter((row) => String(row.admin_decision || '').trim() === 'approved')
    .filter((row) => {
      const rowDate = String(row.workDate || row.work_date || '').replace(/-/g, '');
      return rowDate === compact;
    })
    .sort((a, b) => String(a.check_time || a.checkTime || '').localeCompare(String(b.check_time || b.checkTime || '')));
};

const formatManualTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(text);
  if (hasTimezone) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }
  }
  if (text.includes('T')) return text.split('T')[1].substring(0, 5);
  if (text.includes(' ')) return text.split(' ')[1].substring(0, 5);
  return text.substring(0, 5);
};

function CompactOverrideRow({ item, active, onClick, onDelete }) {
  const label = item.removed
    ? '근무일정 없음'
    : item.scheduleStart && item.scheduleEnd
      ? `${item.scheduleStart}-${item.scheduleEnd}`
      : '예외 적용';
  const labelStyle = item.removed
    ? {
        paddingInline: 8,
        paddingBlock: 3,
        background: 'rgba(148, 163, 184, 0.16)',
        color: '#475569',
        borderColor: 'rgba(148, 163, 184, 0.34)',
      }
    : {
        paddingInline: 8,
        paddingBlock: 3,
        background: 'rgba(34, 197, 94, 0.14)',
        color: 'var(--green)',
        borderColor: 'rgba(34, 197, 94, 0.30)',
      };
  const deductionHours = getAdjustmentDeductionHours(item.note);
  const displayNote = stripAdjustmentDeductionNote(item.note);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        width: '100%',
        textAlign: 'left',
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: active ? 'rgba(91, 136, 214, 0.08)' : 'var(--bg-overlay-sm)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{item.workDate}</span>
          <span className="calendar-day__state-tag" style={labelStyle}>
            {label}
          </span>
          {item.allowOvertime === false ? (
            <span
              className="calendar-day__state-tag"
              style={{
                paddingInline: 8,
                paddingBlock: 3,
                background: 'rgba(208, 107, 107, 0.12)',
                color: 'var(--red)',
                borderColor: 'rgba(208, 107, 107, 0.24)',
              }}
            >
              초과근무 비허용
            </span>
          ) : null}
          {deductionHours > 0 ? (
            <span
              className="calendar-day__state-tag"
              style={{
                paddingInline: 8,
                paddingBlock: 3,
                background: 'rgba(201, 150, 75, 0.14)',
                color: 'var(--amber)',
                borderColor: 'rgba(201, 150, 75, 0.28)',
              }}
            >
              조정차감 {deductionHours.toFixed(1)}
            </span>
          ) : null}
        </div>
        {displayNote && !item.removed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', color: 'var(--text-2)', fontSize: 12 }}>
            <span>{displayNote}</span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="icon-btn"
        aria-label="예외 삭제"
        title="예외 삭제"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(item);
        }}
        style={{ width: 30, height: 30, flexShrink: 0, color: 'var(--red)' }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function ScheduleCalendarPanel({
  month,
  onMonthChange,
  monthOptions = [],
  selectedEmployee,
  selectedEmployeeBaseScheduleStart = '',
  selectedEmployeeBaseScheduleEnd = '',
  selectedEmployeeBaseScheduleLabel = '',
  selectedEmployeeOverrides = [],
  manualCheckins = [],
  dailyAttendanceMap = {},
  calendarLeaves = [],
  selectedEmployeeLogs = [],
  selectedDate = '',
  selectedBatchDates = [],
  batchMode = false,
  onToggleBatchMode,
  onToggleBatchDate,
  onPickDate,
  overrideStart = '08:00',
  overrideEnd = '17:00',
  allowOvertime = true,
  onChangeOverrideStart,
  onChangeOverrideEnd,
  onToggleAllowOvertime,
  overrideNote = '',
  onChangeOverrideNote,
  onSubmitOverride,
  onDeleteOverride,
  onRestoreOverride,
  onRemoveOverride,
  onChangeOverrideDate,
  onRefreshData,
  baseScheduleStart = '',
  baseScheduleEnd = '',
  onChangeBaseScheduleStart,
  onChangeBaseScheduleEnd,
  onSaveBaseSchedule,
  modalSaving = false,
  overtimeRounds = [],
  corrections = [],
}) {
  const todayStr = formatLocalDateStr();
  const cells = useMemo(() => getMonthGridCells(month), [month]);

  const isManagedDept = Boolean(selectedEmployee && isManagedAttendanceDept(selectedEmployee.dept));

  const empRound = useMemo(() => {
    if (!selectedEmployee || !overtimeRounds.length) return null;
    const empNo = String(selectedEmployee.empNo || selectedEmployee.emp_no || '').trim();
    return overtimeRounds.find((r) => String(r.emp_no || '').trim() === empNo) || null;
  }, [selectedEmployee, overtimeRounds]);

  const roundMonths = useMemo(() => {
    if (!empRound?.start_date || !empRound?.end_date) return [];
    const start = getLocalDate(empRound.start_date);
    const end = getLocalDate(empRound.end_date);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endCursor) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }, [empRound]);

  const [prevSelectedEmployee, setPrevSelectedEmployee] = useState(selectedEmployee);
  const [rangeData, setRangeData] = useState({
    logs: [],
    leaves: [],
    corrections: [],
    overrides: [],
    teamSchedulePatterns: [],
    loaded: false,
  });

  if (selectedEmployee !== prevSelectedEmployee) {
    setPrevSelectedEmployee(selectedEmployee);
    setRangeData({ logs: [], leaves: [], corrections: [], overrides: [], teamSchedulePatterns: [], loaded: false });
  }

  useEffect(() => {
    if (!selectedEmployee || !isManagedDept || !roundMonths.length) {
      return;
    }

    let cancelled = false;
    const empNo = String(selectedEmployee.empNo || selectedEmployee.emp_no || '').trim();

    const fetchAllData = async () => {
      try {
        const promises = roundMonths.map(async (m) => {
          const res = await fetch(`/api/attendance?month=${m}&empNo=${empNo}`);
          const json = await res.json();
          return json.success ? json : null;
        });

        const results = await Promise.all(promises);
        const filtered = results.filter(Boolean);

        if (cancelled) return;

        const mergeUnique = (items = [], keyFn) => {
          const map = new Map();
          items.forEach((item) => {
            const key = keyFn(item);
            if (key) map.set(key, item);
          });
          return Array.from(map.values());
        };

        const mergedLogs = mergeUnique(
          filtered.flatMap((d) => d.allLogs || []),
          (log) => String(log?.id || `${log?.empNo || ''}_${log?.logTime || ''}_${log?.gateName || ''}_${log?.eventType || ''}`)
        );

        const mergedLeaves = mergeUnique(
          filtered.flatMap((d) => d.leaves || []),
          (l) => `${l?.empNo || ''}_${l?.startDate || ''}_${l?.endDate || ''}_${l?.leaveCode || ''}`
        );

        const mergedCorrections = mergeUnique(
          filtered.flatMap((d) => d.corrections || []),
          (c) => `${c?.emp_no || ''}_${c?.work_date || ''}`
        );

        const mergedOverrides = mergeUnique(
          filtered.flatMap((d) => d.overrides || []),
          (o) => `${o?.emp_no || ''}_${o?.work_date || ''}`
        );

        const mergedTeamSchedulePatterns = mergeUnique(
          filtered.flatMap((d) => d.teamSchedulePatterns || []),
          (p) => `${p?.dept_name || ''}_${p?.pattern_date || ''}`
        );

        setRangeData({
          logs: mergedLogs,
          leaves: mergedLeaves,
          corrections: mergedCorrections,
          overrides: mergedOverrides,
          teamSchedulePatterns: mergedTeamSchedulePatterns,
          loaded: true,
        });
      } catch (err) {
        console.error('[ScheduleCalendarPanel] range fetch failed:', err);
      }
    };

    fetchAllData();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployee, roundMonths, isManagedDept, selectedEmployeeOverrides]);

  const selectedDates = useMemo(
    () => Array.from(new Set((selectedBatchDates || []).map((date) => String(date || '').trim()).filter(Boolean))).sort(),
    [selectedBatchDates]
  );

  const savedOverrideMap = useMemo(() => {
    const dbOverrides = rangeData.loaded ? rangeData.overrides : selectedEmployeeOverrides;
    return buildOverrideMap(dbOverrides || []);
  }, [rangeData.loaded, rangeData.overrides, selectedEmployeeOverrides]);

  const overrideMap = useMemo(() => {
    const map = new Map(savedOverrideMap);

    if (selectedEmployee && selectedDates.length > 0) {
      selectedDates.forEach((dateStr) => {
        const savedOverride = savedOverrideMap.get(dateStr) || null;
        map.set(dateStr, {
          workDate: dateStr,
          scheduleStart: overrideStart,
          scheduleEnd: overrideEnd,
          allowOvertime: allowOvertime,
          note: savedOverride?.note || overrideNote || '',
          removed: false,
          raw: savedOverride?.raw || null,
        });
      });
    }

    return map;
  }, [selectedEmployee, savedOverrideMap, selectedDates, overrideStart, overrideEnd, allowOvertime, overrideNote]);

  const teamPatternMap = useMemo(() => {
    const map = new Map();
    const dbPatterns = rangeData.loaded ? rangeData.teamSchedulePatterns : [];
    (dbPatterns || []).forEach((row) => {
      const deptName = String(row?.dept_name || row?.deptName || '').trim().replace(/\s+/g, '');
      const patternDate = String(row?.pattern_date || row?.patternDate || row?.work_date || row?.workDate || '').trim();
      if (!deptName || !patternDate) return;
      map.set(`${deptName}_${patternDate}`, {
        scheduleStart: row?.schedule_start || row?.scheduleStart || '',
        scheduleEnd: row?.schedule_end || row?.scheduleEnd || '',
      });
    });
    return map;
  }, [rangeData.loaded, rangeData.teamSchedulePatterns]);

  const correctionMap = useMemo(() => {
    const correctionsList = rangeData.loaded ? rangeData.corrections : corrections;
    const map = new Map();
    (correctionsList || []).forEach((c) => {
      map.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time || c.correctedOutTime);
    });
    return map;
  }, [rangeData.loaded, rangeData.corrections, corrections]);

  const dailyLogs = useMemo(() => {
    const logs = rangeData.loaded ? rangeData.logs : selectedEmployeeLogs;
    const empNo = selectedEmployee ? String(selectedEmployee.empNo || selectedEmployee.emp_no || '').trim() : '';
    const map = {};
    (logs || []).forEach((log) => {
      if (!log.workDate) return;
      if (empNo && String(log.empNo || log.emp_no || '').trim() !== empNo) return;
      if (!map[log.workDate]) map[log.workDate] = [];
      map[log.workDate].push(log);
    });
    return map;
  }, [rangeData.loaded, rangeData.logs, selectedEmployeeLogs, selectedEmployee]);

  const activeDate = selectedDate || selectedDates[0] || '';
  const activeOverride = activeDate ? overrideMap.get(activeDate) || null : null;
  const [adjustmentDeductionHours, setAdjustmentDeductionHours] = useState('0.0');

  const baseStart = String(
    selectedEmployeeBaseScheduleStart
    || selectedEmployee?.baseScheduleTime
    || selectedEmployee?.scheduleTime
    || '08:00'
  ).slice(0, 5) || '08:00';
  const derivedBaseEnd = inferScheduleEndTime(baseStart, selectedEmployee?.dept || '');
  const baseEnd = String(
    selectedEmployeeBaseScheduleEnd
    || selectedEmployee?.baseScheduleEndTime
    || selectedEmployee?.scheduleEndTime
    || derivedBaseEnd
    || '17:00'
  ).slice(0, 5) || derivedBaseEnd || '17:00';
  const currentScheduleLabel = selectedEmployeeBaseScheduleLabel || `${baseStart} - ${baseEnd}`;

  const [prevActiveDate, setPrevActiveDate] = useState('');
  const [prevOverrideStart, setPrevOverrideStart] = useState(overrideStart);
  const [prevOverrideEnd, setPrevOverrideEnd] = useState(overrideEnd);

  useEffect(() => {
    const savedDeduction = getAdjustmentDeductionHours(activeOverride?.note);
    const suggestedDeduction = getSuggestedDeductionHours({
      baseStart,
      baseEnd,
      overrideStart,
      overrideEnd,
    });
    if (activeDate !== prevActiveDate) {
      setPrevActiveDate(activeDate);
      setPrevOverrideStart(overrideStart);
      setPrevOverrideEnd(overrideEnd);
      setAdjustmentDeductionHours((savedDeduction || suggestedDeduction).toFixed(1));
    } else if (overrideStart !== prevOverrideStart || overrideEnd !== prevOverrideEnd) {
      setPrevOverrideStart(overrideStart);
      setPrevOverrideEnd(overrideEnd);
      setAdjustmentDeductionHours(suggestedDeduction.toFixed(1));
    }
  }, [activeOverride?.note, activeDate, baseEnd, baseStart, overrideEnd, overrideStart, prevActiveDate, prevOverrideStart, prevOverrideEnd]);

  const empRemainingAdjustments = useMemo(() => {
    if (!selectedEmployee || !isManagedDept || !empRound?.start_date || !empRound?.end_date) {
      return null;
    }

    const startDate = empRound.start_date;
    const endDate = empRound.end_date;

    const empNo = String(selectedEmployee.empNo || selectedEmployee.emp_no || '').trim();
    const logs = rangeData.loaded ? rangeData.logs : selectedEmployeeLogs;
    let totalAdjustmentMinutes = 0;
    const start = getLocalDate(startDate);
    const end = getLocalDate(endDate);

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const override = savedOverrideMap.get(dateStr) || null;
      const teamPattern = teamPatternMap.get(`${String(selectedEmployee.dept).replace(/\s+/g, '')}_${dateStr}`) || null;

      const schedulePair = resolveSchedulePairForDate({
        dept: selectedEmployee.dept,
        dateStr,
        baseScheduleStart: baseStart,
        baseScheduleEnd: baseEnd,
        override,
        teamPattern,
      });

      if (!schedulePair) {
        continue;
      }

      const allowOvertime = isManagedDept
        ? resolveAllowOvertimeForSchedule({
            resolvedSchedule: schedulePair?.start && schedulePair?.end ? schedulePair : null,
            override,
            fallbackAllowOvertime: isExternalBusinessDept(selectedEmployee.dept),
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
        const correctedOut = correctionMap.get(`${selectedEmployee.empNo}_${dateStr}`);
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else if (dayLogs.length >= 2 && firstLog) {
          const lastLog = dayLogs[dayLogs.length - 1];
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = lastLog.logTime ? lastLog.logTime.split(' ')[1]?.substring(0, 5) : '';
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

      totalAdjustmentMinutes += overtimeMinutes - getAdjustmentDeductionMinutes(override?.note);
    }

    const totalAdjustments = Math.round((totalAdjustmentMinutes / 60) * 2) / 2;
    return totalAdjustments;
  }, [selectedEmployee, isManagedDept, empRound, savedOverrideMap, teamPatternMap, baseStart, baseEnd, dailyLogs, correctionMap]);

  const selectedManualCheckins = useMemo(() => {
    if (!selectedEmployee) return [];
    const targetDate = String(activeDate || '').slice(0, 10);
    return (manualCheckins || [])
      .filter((row) => String(row.empNo || row.emp_no || '').trim() === String(selectedEmployee.empNo || '').trim())
      .filter((row) => {
        const rowDate = String(row.workDate || row.work_date || '').slice(0, 10);
        if (targetDate) return rowDate === targetDate;
        return rowDate.startsWith(String(month || '').slice(0, 7));
      })
      .sort((a, b) => String(a.workDate || a.work_date || '').localeCompare(String(b.workDate || b.work_date || '')) || String(a.check_time || a.checkTime || '').localeCompare(String(b.check_time || b.checkTime || '')));
  }, [activeDate, manualCheckins, month, selectedEmployee]);

  const selectedDayLogs = useMemo(() => {
    if (!selectedEmployee || !activeDate) return [];
    const empNo = String(selectedEmployee.empNo || '').trim();
    const targetDate = String(activeDate || '').slice(0, 10);
    return (selectedEmployeeLogs || [])
      .filter((row) => String(row.empNo || row.emp_no || '').trim() === empNo)
      .filter((row) => String(row.workDate || row.work_date || '').slice(0, 10) === targetDate)
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || ''));
      });
  }, [activeDate, selectedEmployee, selectedEmployeeLogs]);
  const selectedDayRawLogs = useMemo(() => {
    if (!selectedEmployee || !activeDate) return [];
    const empNo = String(selectedEmployee.empNo || '').trim();
    const targetDate = String(activeDate || '').slice(0, 10);
    return (selectedEmployeeLogs || [])
      .filter((row) => String(row.empNo || row.emp_no || '').trim() === empNo)
      .filter((row) => String(row.workDate || row.work_date || '').slice(0, 10) === targetDate)
      .filter((row) => !row.isManual)
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || ''));
      });
  }, [activeDate, selectedEmployee, selectedEmployeeLogs]);
  const activeCheckinAdjustment = useMemo(() => {
    return selectedDayLogs.find((log) => {
      const role = String(log.adjustedRole || log.eventType || '').trim();
      return Boolean(log.isAdjustedCheckin || log.isManual || role.includes('출'));
    }) || null;
  }, [selectedDayLogs]);
  const hasCheckoutCorrection = useMemo(() => {
    return selectedDayLogs.some((log) => (
      Boolean(log.correctedOutTime)
      || Boolean(log.isAdjustedCheckout)
      || Boolean(log.isManual && String(log.eventType || '').includes('퇴'))
      || String(log.adjustedRole || log.eventType || '').trim().includes('퇴')
    ));
  }, [selectedDayLogs]);
  const hasSavedAttendanceCorrection = Boolean(activeCheckinAdjustment || hasCheckoutCorrection);

  const pendingManualCheckins = useMemo(() => {
    return selectedManualCheckins.filter((row) => String(row.adminDecision || row.admin_decision || '').trim() === 'pending');
  }, [selectedManualCheckins]);

  const [correctionType, setCorrectionType] = useState('퇴근');
  const [correctionTime, setCorrectionTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [selectedManualDeleteIds, setSelectedManualDeleteIds] = useState([]);

  const [prevEmpNoAndDate, setPrevEmpNoAndDate] = useState({ empNo: selectedEmployee?.empNo, activeDate });
  if (selectedEmployee?.empNo !== prevEmpNoAndDate.empNo || activeDate !== prevEmpNoAndDate.activeDate) {
    setPrevEmpNoAndDate({ empNo: selectedEmployee?.empNo, activeDate });
    setSelectedManualDeleteIds([]);
  }

  const [prevCorrectionKey, setPrevCorrectionKey] = useState({ activeDate, correctionType, selectedDayRawLogs });
  if (
    activeDate !== prevCorrectionKey.activeDate
    || correctionType !== prevCorrectionKey.correctionType
    || selectedDayRawLogs !== prevCorrectionKey.selectedDayRawLogs
  ) {
    setPrevCorrectionKey({ activeDate, correctionType, selectedDayRawLogs });
    const firstLog = selectedDayRawLogs[0] || null;
    const lastLog = selectedDayRawLogs[selectedDayRawLogs.length - 1] || null;
    const fallbackTime = correctionType === '출근'
      ? formatManualTime(firstLog?.logTime || firstLog?.log_time || '')
      : formatManualTime(lastLog?.correctedOutTime || lastLog?.logTime || lastLog?.log_time || '');
    setCorrectionTime(fallbackTime || '');
  }

  const selectedSummary = !selectedDates.length
    ? '날짜를 선택하세요'
    : selectedDates.length === 1
      ? selectedDates[0]
      : `${selectedDates.length}개 날짜 선택`;
  const allSelectedHaveSchedule = selectedDates.length > 0 && selectedDates.every((dateStr) => {
    const override = overrideMap.get(dateStr) || null;
    const teamPattern = teamPatternMap.get(`${String(selectedEmployee?.dept || '').replace(/\s+/g, '')}_${dateStr}`) || null;
    const resolvedSchedule = resolveSchedulePairForDate({
      dept: selectedEmployee?.dept || '',
      dateStr,
      baseScheduleStart: baseStart,
      baseScheduleEnd: baseEnd,
      override,
      teamPattern,
    });
    return Boolean(resolvedSchedule?.start && resolvedSchedule?.end);
  });

  const weekRows = useMemo(() => {
    const rows = [];
    const empDept = String(selectedEmployee?.dept || '').trim();
    const empNo = String(selectedEmployee?.empNo || '').trim();

    for (let rowIndex = 0; rowIndex < cells.length; rowIndex += 7) {
      const rowCells = cells.slice(rowIndex, rowIndex + 7);
      const dateCells = rowCells.filter((cell) => !cell.empty);
      const displayCell = rowCells.find((cell) => !cell.empty && cell.inCurrentMonth) || dateCells[0] || null;
      const weekTotals = dateCells.reduce((acc, cell) => {
        const override = overrideMap.get(cell.dateStr) || null;
        const teamPattern = teamPatternMap.get(`${empDept.replace(/\s+/g, '')}_${cell.dateStr}`) || null;
        const resolvedSchedule = resolveSchedulePairForDate({
          dept: empDept,
          dateStr: cell.dateStr,
          baseScheduleStart: baseStart,
          baseScheduleEnd: baseEnd,
          override,
          teamPattern,
        });
        if (!resolvedSchedule?.start || !resolvedSchedule?.end) {
          return acc;
        }

        const baseScheduleMinutes = Math.max(0, getScheduleDurationMinutes(baseStart, baseEnd) - 60);

        // 야근/초과근무 발생 시간(overtimeMinutes)도 함께 합산하여 왼쪽 주간 근무시간에 반영한다.
        const allowOvertime = isManagedDept
          ? resolveAllowOvertimeForSchedule({
              resolvedSchedule: resolvedSchedule?.start && resolvedSchedule?.end ? resolvedSchedule : null,
              override,
              fallbackAllowOvertime: isExternalBusinessDept(empDept),
            })
          : false;

        let overtimeMinutes = 0;
        if (allowOvertime) {
          const dayLogs = (dailyLogs[cell.dateStr] || []).slice().sort((a, b) => {
            return String(a.logTime || '').localeCompare(String(b.logTime || ''));
          });
          const firstLog = dayLogs[0];
          const correctedOut = correctionMap.get(`${empNo}_${cell.dateStr}`);
          let outTime = null;

          if (correctedOut) {
            outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
          } else if (dayLogs.length >= 2 && firstLog) {
            const lastLog = dayLogs[dayLogs.length - 1];
            if (lastLog && lastLog.logTime !== firstLog.logTime) {
              outTime = lastLog.logTime ? lastLog.logTime.split(' ')[1]?.substring(0, 5) : '';
            }
          }

          if (outTime) {
            const rawOvertime = getAdjustmentMinutes({
              scheduleEnd: resolvedSchedule.end,
              actualOut: outTime,
            });
            overtimeMinutes = clampToHalfHourSteps(rawOvertime);
          }
        }

        const deductionMinutes = getAdjustmentDeductionMinutes(override?.note);
        const adjustmentDeltaMinutes = overtimeMinutes - deductionMinutes;

        return {
          totalMinutes: acc.totalMinutes + baseScheduleMinutes + adjustmentDeltaMinutes,
          adjustmentMinutes: acc.adjustmentMinutes + adjustmentDeltaMinutes,
        };
      }, { totalMinutes: 0, adjustmentMinutes: 0 });

      rows.push({
        key: `week-${rowIndex / 7}`,
        label: `${getYearWeekNumber(displayCell?.dateStr) || rowIndex / 7 + 1}주차`,
        range: dateCells.length > 0
          ? `${formatMonthDayLabel(dateCells[0].dateStr)}~${formatMonthDayLabel(dateCells[dateCells.length - 1].dateStr)}`
          : '',
        totalLabel: formatWeekTotalLabel(weekTotals.totalMinutes),
        adjustmentLabel: formatAdjustmentDeltaLabel(weekTotals.adjustmentMinutes),
        adjustmentMinutes: weekTotals.adjustmentMinutes,
        cells: rowCells,
      });
    }

    return rows;
  }, [baseEnd, baseStart, cells, overrideMap, teamPatternMap, selectedEmployee?.dept, selectedEmployee?.empNo, isManagedDept, dailyLogs, correctionMap]);

  const handleCalendarPick = (cell) => {
    if (!selectedEmployee || cell.empty) return;
    const dateStr = cell.dateStr;
    const override = overrideMap.get(dateStr) || null;
    if (batchMode) {
      onToggleBatchDate?.(dateStr, override);
      onChangeOverrideDate?.(dateStr, override);
      return;
    }
    onChangeOverrideDate?.(dateStr, override);
    onPickDate?.(dateStr, override);
  };

  const handleSaveAttendanceCorrection = async () => {
    if (!selectedEmployee || !activeDate || !correctionTime) return;
    const empNo = String(selectedEmployee.empNo || '').trim();
    const timePart = String(correctionTime || '').slice(0, 5);
    setCorrectionSaving(true);
    try {
      const res = await fetch('/api/attendance/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo,
          workDate: activeDate,
          correctionType,
          correctionTime: `${activeDate}T${timePart}:00+09:00`,
          reason: correctionReason || '',
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || `${correctionType} 보정에 실패했습니다.`);
      if (typeof onRefreshData === 'function') {
        await onRefreshData({ empNo, month });
      }
      onChangeOverrideDate?.(activeDate, activeOverride || overrideMap.get(activeDate) || null);
      alert('근태 보정이 저장되었습니다.');
    } catch (err) {
      alert(err.message || '근태 보정 저장 중 오류가 발생했습니다.');
    } finally {
      setCorrectionSaving(false);
    }
  };

  const handleDeleteAttendanceCorrection = async () => {
    if (!selectedEmployee || !activeDate || !hasSavedAttendanceCorrection) return;
    if (!window.confirm('해당 보정을 삭제하고 원래 기록으로 되돌릴까요?')) return;
    const empNo = String(selectedEmployee.empNo || '').trim();
    setCorrectionSaving(true);
    try {
      const correctionTypeToDelete = activeCheckinAdjustment ? '출근' : '퇴근';
      const res = await fetch('/api/attendance/correction', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo, workDate: activeDate, correctionType: correctionTypeToDelete }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || `${correctionTypeToDelete} 보정 삭제에 실패했습니다.`);
      if (typeof onRefreshData === 'function') {
        await onRefreshData({ empNo, month });
      }
      alert('보정이 삭제되었습니다.');
    } catch (err) {
      alert(err.message || '보정 삭제 중 오류가 발생했습니다.');
    } finally {
      setCorrectionSaving(false);
    }
  };

  const handleManualDecision = async (id, decision) => {
    if (!id || !decision) return;
    if (!window.confirm(decision === 'approved' ? '해당 요청을 승인할까요?' : '해당 요청을 반려할까요?')) return;
    try {
      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || '결재 처리에 실패했습니다.');
      if (typeof onRefreshData === 'function') {
        const empNo = selectedEmployee ? String(selectedEmployee.empNo || '').trim() : null;
        await onRefreshData({ empNo, month });
      }
      if (typeof onChangeOverrideDate === 'function' && activeDate) {
        onChangeOverrideDate(activeDate, activeOverride || null);
      }
      alert(decision === 'approved' ? '승인 처리되었습니다.' : '반려 처리되었습니다.');
    } catch (err) {
      alert(err.message || '결재 처리 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteSelectedManualCheckins = async () => {
    if (!selectedManualDeleteIds.length) return;
    if (!window.confirm(`선택한 수동 기록 ${selectedManualDeleteIds.length}건을 삭제할까요?`)) return;

    setCorrectionSaving(true);
    try {
      const res = await fetch('/api/attendance/correction', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedManualDeleteIds }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || '수동 기록 삭제에 실패했습니다.');
      setSelectedManualDeleteIds([]);
      if (typeof onRefreshData === 'function') {
        const empNo = selectedEmployee ? String(selectedEmployee.empNo || '').trim() : null;
        await onRefreshData({ empNo, month });
      }
      alert('선택한 수동 기록이 삭제되었습니다.');
    } catch (err) {
      alert(err.message || '수동 기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setCorrectionSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.38fr) minmax(330px, 0.62fr)', gap: 14, alignItems: 'start' }}>
      <div className="schedule-modal-calendar card" style={{ padding: 16, gap: 12 }}>
        <div className="card-header" style={{ paddingBottom: 0, borderBottom: 'none', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>일자별 근무일정 조정</div>
            <h3 className="card-title" style={{ marginTop: 4 }}>{formatMonthLabel(month)} 캘린더</h3>
            <p className="card-subtitle">날짜를 선택해 기본 근무일정과 예외를 함께 관리합니다.</p>
          </div>

          <MonthSearchPicker
            label="달력 범위"
            value={month}
            onChange={(nextMonth) => onMonthChange?.(nextMonth)}
            monthOptions={monthOptions}
            onPrev={() => {
              const idx = monthOptions.indexOf(month);
              if (idx > 0) onMonthChange?.(monthOptions[idx - 1]);
            }}
            onNext={() => {
              const idx = monthOptions.indexOf(month);
              if (idx >= 0 && idx < monthOptions.length - 1) onMonthChange?.(monthOptions[idx + 1]);
            }}
            placeholder="YYYY-MM 검색"
          />
        </div>

        <div className="calendar-widget__weekday-grid" style={{ gap: 6, gridTemplateColumns: '112px repeat(7, minmax(0, 1fr))' }}>
          <div aria-hidden="true" />
          {WEEKDAYS.map((day, idx) => (
            <div key={day} className={`calendar-widget__weekday ${idx === 6 ? 'is-sun' : idx === 5 ? 'is-sat' : ''}`}>
              {day}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {weekRows.map((week) => (
            <div
              key={week.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '112px repeat(7, minmax(0, 1fr))',
                gap: 6,
                alignItems: 'stretch',
              }}
            >
              <div
                style={{
                  minHeight: 88,
                  borderRadius: 18,
                  border: '1px solid var(--border)',
                  background: 'linear-gradient(180deg, rgba(91, 136, 214, 0.10), rgba(91, 136, 214, 0.04))',
                  padding: '10px 10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{week.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.25 }}>{week.range}</div>
                <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: 'var(--blue)' }}>
                  {week.totalLabel}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: week.adjustmentMinutes > 0
                      ? 'var(--red)'
                      : week.adjustmentMinutes < 0
                        ? 'var(--amber)'
                        : 'var(--text-3)',
                    lineHeight: 1.2,
                  }}
                >
                  {week.adjustmentLabel}
                </div>
              </div>

              {week.cells.map((cell, idx) => {
                if (cell.empty) return <div key={`empty-${week.key}-${idx}`} className="calendar-widget__spacer" />;

                const isToday = cell.dateStr === todayStr;
                const isSelected = selectedDates.includes(cell.dateStr) || activeDate === cell.dateStr;
                const override = overrideMap.get(cell.dateStr) || null;
                const teamPattern = teamPatternMap.get(`${String(selectedEmployee?.dept || '').replace(/\s+/g, '')}_${cell.dateStr}`) || null;
                const dayStats = dailyAttendanceMap?.[selectedEmployee?.empNo || '']?.[cell.dateStr] || null;
                const manualRows = selectedEmployee ? getManualCheckinsForDate(manualCheckins, selectedEmployee.empNo, cell.dateStr) : [];
                const leaveRows = selectedEmployee ? getEmployeeLeavesForDate(calendarLeaves, selectedEmployee.empNo, cell.dateStr) : [];
                const resolvedSchedule = resolveSchedulePairForDate({
                  dept: selectedEmployee?.dept || '',
                  dateStr: cell.dateStr,
                  baseScheduleStart: baseStart,
                  baseScheduleEnd: baseEnd,
                  override,
                  teamPattern: null,
                });
                const hasSchedule = Boolean(resolvedSchedule);
                const isHoliday = !!getHolidayName(cell.dateStr) || idx === 5 || idx === 6;
                const holidayName = getHolidayName(cell.dateStr);
                const showTime = Boolean(dayStats?.in || dayStats?.out);
                const displayStart = normalizeTime(dayStats?.in || '', '');
                const displayEnd = normalizeTime(dayStats?.out || '', '');
                const resolvedStart = resolvedSchedule ? normalizeTime(resolvedSchedule.start || baseStart, baseStart) : '';
                const resolvedEnd = resolvedSchedule ? normalizeTime(resolvedSchedule.end || baseEnd, baseEnd) : '';
                const isSameAsBase = Boolean(
                  resolvedSchedule
                  && resolvedStart === baseStart
                  && resolvedEnd === baseEnd
                );
                const isLate = Boolean(dayStats?.isLate);
                const adjustedSchedule = resolvedSchedule && !isSameAsBase;
                const scheduleBadge = adjustedSchedule && resolvedStart && resolvedEnd
                  ? `${resolvedStart}-${resolvedEnd}`
                  : '';
                const adjustmentBadge = (() => {
                  if (!selectedEmployee || !isExternalBusinessDept(selectedEmployee.dept)) return '';
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
                const overtimeBadge = override && override.allowOvertime === false && isExternalBusinessDept(selectedEmployee?.dept)
                  ? '초과근무 비허용'
                  : '';
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    className={[
                      'calendar-day',
                      override ? 'has-override' : '',
                      isSelected ? 'is-selected' : '',
                      isToday ? 'is-today' : '',
                      isHoliday ? 'is-holiday' : '',
                      !hasSchedule ? 'is-empty-schedule' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleCalendarPick(cell)}
                    disabled={!selectedEmployee}
                    style={{
                      minHeight: 88,
                      background: !cell.inCurrentMonth
                        ? 'rgba(148, 163, 184, 0.12)'
                        : isLate
                          ? 'rgba(245, 158, 11, 0.12)'
                          : undefined,
                      opacity: cell.inCurrentMonth ? 1 : 0.62,
                      color: cell.inCurrentMonth ? undefined : 'rgba(71, 85, 105, 0.82)',
                    }}
                  >
                    <div className="calendar-day__top">
                      <span className="calendar-day__number">{cell.dayNum}</span>
                      {holidayName ? <span className="calendar-day__holiday">{holidayName}</span> : null}
                      <div className="calendar-day__tag-stack">
                        {isToday ? (
                          <span className="calendar-day__state-tag" style={makeCalendarBadgeStyle('rgba(239, 68, 68, 0.12)', 'var(--red)', 'rgba(239, 68, 68, 0.28)')}>
                            오늘
                          </span>
                        ) : null}
                        {isLate ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(201, 150, 75, 0.16)', 'var(--amber)', 'rgba(201, 150, 75, 0.34)')}
                          >
                            지각
                          </span>
                        ) : null}
                        {adjustmentBadge ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(208, 107, 107, 0.12)', 'var(--red)', 'rgba(208, 107, 107, 0.30)')}
                          >
                            {adjustmentBadge}
                          </span>
                        ) : null}
                        {getAdjustmentDeductionHours(override?.note) > 0 ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(201, 150, 75, 0.14)', 'var(--amber)', 'rgba(201, 150, 75, 0.30)')}
                          >
                            {`차감 ${getAdjustmentDeductionHours(override?.note).toFixed(1)}`}
                          </span>
                        ) : null}
                        {manualRows.length > 0 ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(148, 163, 184, 0.16)', '#475569', 'rgba(148, 163, 184, 0.34)')}
                          >
                            {manualRows.length > 1 ? `수동 ${manualRows.length}` : '수동'}
                          </span>
                        ) : null}
                        {overtimeBadge ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(208, 107, 107, 0.12)', 'var(--red)', 'rgba(208, 107, 107, 0.24)')}
                          >
                            {overtimeBadge}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {showTime ? (
                      <div className="calendar-day__time-block" style={{ gap: 2 }}>
                        {displayStart ? <span className="calendar-day__time-main is-in">출근 {displayStart}</span> : null}
                        {displayEnd ? <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span> : null}
                      </div>
                    ) : null}

                    {scheduleBadge || leaveRows.length > 0 ? (
                      <div className="calendar-day__leave-list" style={{ marginTop: 2 }}>
                        {scheduleBadge ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(34, 197, 94, 0.14)', 'var(--green)', 'rgba(34, 197, 94, 0.30)')}
                          >
                            {scheduleBadge}
                          </span>
                        ) : null}
                        {leaveRows.map((leave, leaveIndex) => {
                          const leaveMeta = getLeaveMeta(leave, dayStats);
                          const leaveLabel = String(leaveMeta?.label || leaveMeta?.rawLabel || '').trim();
                          return (
                            <span
                              key={`${String(leave.empNo || leave.emp_no || leaveIndex)}-${leaveIndex}`}
                              className={`calendar-detail__name-chip ${String(leaveMeta?.variantClassName || '').trim()}`.trim()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                maxWidth: '100%',
                                paddingInline: 8,
                                paddingBlock: 3,
                                borderRadius: '999px',
                                background: leaveMeta.bg,
                                color: leaveMeta.color,
                                whiteSpace: 'nowrap',
                                fontWeight: 600,
                                fontSize: 8.5,
                                lineHeight: 1.1,
                                border: '1px solid transparent',
                                borderColor: leaveMeta.borderColor || 'transparent',
                              }}
                            >
                              {leaveLabel}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="calendar-widget__grid" style={{ gap: 6, display: 'none' }}>
          {cells.map((cell, idx) => {
            if (cell.empty) return <div key={`empty-${idx}`} className="calendar-widget__spacer" />;

            const isToday = cell.dateStr === todayStr;
            const isSelected = selectedDates.includes(cell.dateStr) || activeDate === cell.dateStr;
            const override = overrideMap.get(cell.dateStr) || null;
            const dayStats = dailyAttendanceMap?.[selectedEmployee?.empNo || '']?.[cell.dateStr] || null;
            const manualRows = selectedEmployee ? getManualCheckinsForDate(manualCheckins, selectedEmployee.empNo, cell.dateStr) : [];
            const resolvedSchedule = resolveSchedulePairForDate({
              dept: selectedEmployee?.dept || '',
              dateStr: cell.dateStr,
              baseScheduleStart: baseStart,
              baseScheduleEnd: baseEnd,
              override,
              teamPattern: null,
            });
            const hasSchedule = Boolean(resolvedSchedule);
            const isHoliday = !!getHolidayName(cell.dateStr) || (idx % 7) === 5 || (idx % 7) === 6;
            const holidayName = getHolidayName(cell.dateStr);
            const leaveRows = selectedEmployee ? getEmployeeLeavesForDate(calendarLeaves, selectedEmployee.empNo, cell.dateStr) : [];
            const showTime = Boolean(dayStats?.in || dayStats?.out);
            const displayStart = normalizeTime(dayStats?.in || '', '');
            const displayEnd = normalizeTime(dayStats?.out || '', '');
            const resolvedStart = resolvedSchedule ? normalizeTime(resolvedSchedule.start || baseStart, baseStart) : '';
            const resolvedEnd = resolvedSchedule ? normalizeTime(resolvedSchedule.end || baseEnd, baseEnd) : '';
            const isSameAsBase = Boolean(
              resolvedSchedule
              && resolvedStart === baseStart
              && resolvedEnd === baseEnd
            );
            const isLate = Boolean(dayStats?.isLate);
            const adjustedSchedule = resolvedSchedule && !isSameAsBase;
            const scheduleBadge = adjustedSchedule && resolvedStart && resolvedEnd
              ? `${resolvedStart}-${resolvedEnd}`
              : '';
            const adjustmentBadge = (() => {
              if (!selectedEmployee || !isExternalBusinessDept(selectedEmployee.dept)) return '';
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
            const overtimeBadge = override && override.allowOvertime === false && isExternalBusinessDept(selectedEmployee?.dept)
              ? '초과근무 비허용'
              : '';

            return (
              <button
                key={cell.dateStr}
                type="button"
                className={[
                  'calendar-day',
                  override ? 'has-override' : '',
                  isSelected ? 'is-selected' : '',
                  isToday ? 'is-today' : '',
                  isHoliday ? 'is-holiday' : '',
                  !hasSchedule ? 'is-empty-schedule' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleCalendarPick(cell)}
                disabled={!selectedEmployee}
                style={{
                  minHeight: 88,
                  background: !hasSchedule && isManagedDept
                    ? 'rgba(100, 116, 139, 0.08)'
                    : isLate
                      ? 'rgba(245, 158, 11, 0.12)'
                      : isHoliday
                        ? 'rgba(239, 68, 68, 0.04)'
                        : resolvedSchedule
                          ? 'linear-gradient(180deg, rgba(91, 136, 214, 0.18), rgba(91, 136, 214, 0.08)), var(--bg-card-2)'
                          : undefined,
                  borderColor: resolvedSchedule ? 'rgba(91, 136, 214, 0.46)' : undefined,
                }}
              >
                <div className="calendar-day__top">
                  <span className="calendar-day__number">{cell.dayNum}</span>
                  {holidayName ? <span className="calendar-day__holiday">{holidayName}</span> : null}
                  <div className="calendar-day__tag-stack">
                        {isToday ? (
                          <span className="calendar-day__state-tag" style={makeCalendarBadgeStyle('rgba(239, 68, 68, 0.12)', 'var(--red)', 'rgba(239, 68, 68, 0.28)')}>
                            오늘
                          </span>
                        ) : null}
                    {isLate ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(201, 150, 75, 0.16)', 'var(--amber)', 'rgba(201, 150, 75, 0.34)')}
                      >
                            지각
                      </span>
                    ) : null}
                    {adjustmentBadge ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(208, 107, 107, 0.12)', 'var(--red)', 'rgba(208, 107, 107, 0.30)')}
                      >
                        {adjustmentBadge}
                      </span>
                    ) : null}
                    {getAdjustmentDeductionHours(override?.note) > 0 ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(201, 150, 75, 0.14)', 'var(--amber)', 'rgba(201, 150, 75, 0.30)')}
                      >
                        {`차감 ${getAdjustmentDeductionHours(override?.note).toFixed(1)}`}
                      </span>
                    ) : null}
                    {manualRows.length > 0 ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(148, 163, 184, 0.16)', '#475569', 'rgba(148, 163, 184, 0.34)')}
                      >
                        {manualRows.length > 1 ? `수동 ${manualRows.length}` : '수동'}
                      </span>
                    ) : null}
                    {overtimeBadge ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(208, 107, 107, 0.12)', 'var(--red)', 'rgba(208, 107, 107, 0.24)')}
                      >
                        {overtimeBadge}
                      </span>
                    ) : null}
                  </div>
                </div>

                {showTime ? (
                      <div className="calendar-day__time-block" style={{ gap: 2 }}>
                        {displayStart ? <span className="calendar-day__time-main is-in">출근 {displayStart}</span> : null}
                        {displayEnd ? <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span> : null}
                  </div>
                ) : null}

                {scheduleBadge || leaveRows.length > 0 ? (
                  <div className="calendar-day__leave-list" style={{ marginTop: 2 }}>
                    {scheduleBadge ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(34, 197, 94, 0.14)', 'var(--green)', 'rgba(34, 197, 94, 0.30)')}
                      >
                        {scheduleBadge}
                      </span>
                    ) : null}
                    {leaveRows.map((leave, index) => {
                      const leaveMeta = getLeaveMeta(leave, dayStats);
                      const leaveLabel = String(leaveMeta?.label || leaveMeta?.rawLabel || '').trim();
                      return (
                        <span
                          key={`${String(leave.empNo || leave.emp_no || index)}-${index}`}
                          className={`calendar-detail__name-chip ${String(leaveMeta?.variantClassName || '').trim()}`.trim()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            maxWidth: '100%',
                            paddingInline: 8,
                            paddingBlock: 3,
                            borderRadius: '999px',
                            background: leaveMeta.bg,
                            color: leaveMeta.color,
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            fontSize: 8.5,
                            lineHeight: 1.1,
                            border: '1px solid transparent',
                            borderColor: leaveMeta.borderColor || 'transparent',
                          }}
                        >
                          {leaveLabel}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

              </button>
            );
          })}
        </div>
      </div>

      <div className="schedule-modal-side card" style={{ padding: 16, gap: 12 }}>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 16,
            border: '1px solid var(--border)',
            background: 'var(--bg-overlay-sm)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>월 기본 근무일정</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginTop: 2 }}>
                {selectedEmployeeBaseScheduleLabel || `${baseStart} - ${baseEnd}`}
              </div>
            </div>
            <button
              type="button"
              className="login-btn"
              onClick={onSaveBaseSchedule}
              disabled={modalSaving || !selectedEmployee}
              style={{ marginTop: 0, minWidth: 90, paddingInline: 12, background: 'var(--blue)', color: '#fff' }}
            >
              {modalSaving ? '저장 중...' : '저장'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="form-label" style={{ margin: 0 }}>출근시간</span>
              <select
                className="ui-select"
                value={baseScheduleStart}
                onChange={(e) => onChangeBaseScheduleStart?.(e.target.value)}
                disabled={!selectedEmployee || modalSaving}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={`base-start-${time}`} value={time}>{time}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="form-label" style={{ margin: 0 }}>퇴근시간</span>
              <select
                className="ui-select"
                value={baseScheduleEnd}
                onChange={(e) => onChangeBaseScheduleEnd?.(e.target.value)}
                disabled={!selectedEmployee || modalSaving}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={`base-end-${time}`} value={time}>{time}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isManagedDept && empRound && (
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>초과근무 잔여 조정</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: empRemainingAdjustments !== null && empRemainingAdjustments > 0 ? 'var(--amber)' : empRemainingAdjustments !== null && empRemainingAdjustments < 0 ? 'var(--blue)' : 'var(--text-1)',
                }}
              >
                {empRemainingAdjustments !== null
                  ? `${empRemainingAdjustments > 0 ? '+' : ''}${empRemainingAdjustments.toFixed(1)}`
                  : '-'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>개</span>
              {!rangeData.loaded && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-3)' }}>불러오는 중...</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              정산 기간: {empRound.start_date} ~ {empRound.end_date}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const composed = composeAdjustmentDeductionNote(overrideNote || '', Number(adjustmentDeductionHours) || 0);
            onSubmitOverride?.(e, composed);
          }}
          style={{ display: 'grid', gap: 12 }}
        >
        <div
          style={{
            padding: 14,
            borderRadius: 18,
            border: '1px solid var(--border)',
            background: 'var(--bg-overlay-sm)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>선택 날짜</div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => onToggleBatchMode?.(e.target.checked)}
              />
              다중선택
            </label>
          </div>

          <div style={{ display: 'grid', gap: 6, maxHeight: 132, overflow: 'auto' }}>
            {selectedDates.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                캘린더에서 날짜를 선택하세요.
              </div>
            ) : (
              selectedDates.map((dateStr) => (
                <label
                  key={dateStr}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 9px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: activeDate === dateStr ? 'rgba(91, 136, 214, 0.08)' : 'transparent',
                    fontSize: 12.5,
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked
                    disabled={!batchMode}
                    onChange={() => onToggleBatchDate?.(dateStr, overrideMap.get(dateStr) || null)}
                  />
                  <span>{dateStr}</span>
                </label>
              ))
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <div>
              <div className="form-label">출근시간</div>
              <select
                className="ui-select"
                value={overrideStart}
                onChange={(e) => onChangeOverrideStart?.(e.target.value)}
                disabled={!selectedEmployee || selectedDates.length === 0}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="form-label">퇴근시간</div>
              <select
                className="ui-select"
                value={overrideEnd}
                onChange={(e) => onChangeOverrideEnd?.(e.target.value)}
                disabled={!selectedEmployee || selectedDates.length === 0}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--bg-overlay-sm)',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--text-1)',
            }}
          >
            <input
              type="checkbox"
              checked={allowOvertime}
              onChange={(e) => onToggleAllowOvertime?.(e.target.checked)}
              disabled={!selectedEmployee || selectedDates.length === 0}
            />
            초과근무 허용
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="form-label" style={{ margin: 0 }}>조정 차감</span>
            <select
              name="adjustmentDeduction"
              className="ui-select"
              value={adjustmentDeductionHours}
              onChange={(e) => setAdjustmentDeductionHours(e.target.value)}
              disabled={!selectedEmployee || selectedDates.length === 0}
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
            >
              {ADJUSTMENT_DEDUCTION_OPTIONS.map((value) => (
                <option key={`deduction-${value}`} value={value}>
                  {value === '0.0' ? '사용 안함' : `${value} 차감`}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="login-btn"
              onClick={() => onRemoveOverride?.(selectedDates)}
              style={{ marginTop: 0, background: 'rgba(100, 116, 139, 0.12)', color: 'var(--text-1)' }}
              disabled={!selectedEmployee || selectedDates.length === 0 || modalSaving || !allSelectedHaveSchedule}
            >
              삭제
            </button>
            <button
              type="button"
              className="login-btn"
              onClick={() => onRestoreOverride?.(selectedDates)}
              style={{ marginTop: 0, background: 'rgba(91, 136, 214, 0.12)', color: 'var(--blue)' }}
              disabled={!selectedEmployee || selectedDates.length === 0 || modalSaving || !allSelectedHaveSchedule}
            >
              복원
            </button>
            <button
              type="submit"
              className="login-btn"
              disabled={!selectedEmployee || selectedDates.length === 0 || modalSaving}
              style={{ marginTop: 0, background: 'var(--blue)', color: '#fff' }}
            >
              {modalSaving ? '저장 중...' : selectedDates.length > 1 ? `${selectedDates.length}개 ${allSelectedHaveSchedule ? '저장' : '생성'}` : (allSelectedHaveSchedule ? '저장' : '생성')}
            </button>
          </div>
        </div>
        </form>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: 18,
            border: '1px solid var(--border)',
            background: 'var(--bg-overlay-sm)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>근태 보정</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginTop: 2 }}>
                선택 날짜 반영
              </div>
            </div>
            <span className="calendar-day__state-tag" style={makeCalendarBadgeStyle('rgba(148, 163, 184, 0.14)', '#475569', 'rgba(148, 163, 184, 0.26)')}>
              별도 카드
            </span>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>선택 날짜</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--text-1)' }}>{activeDate || '-'}</strong>
                {hasSavedAttendanceCorrection ? (
                  <span
                    className="calendar-day__state-tag"
                    style={makeCalendarBadgeStyle(
                      'rgba(91, 136, 214, 0.14)',
                      'var(--blue)',
                      'rgba(91, 136, 214, 0.34)'
                    )}
                  >
                    보정 적용
                  </span>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>원본 출입기록</label>
              <strong style={{ color: 'var(--text-1)' }}>
                {selectedDayRawLogs.length > 0
                  ? `${formatManualTime(selectedDayRawLogs[0]?.logTime || selectedDayRawLogs[0]?.log_time || '') || '-'}`
                  : '-'}
                {selectedDayRawLogs.length > 1
                  ? ` ~ ${formatManualTime(selectedDayRawLogs[selectedDayRawLogs.length - 1]?.logTime || selectedDayRawLogs[selectedDayRawLogs.length - 1]?.log_time || '') || '-'}`
                  : ''}
              </strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>보정 대상</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, width: '100%' }}>
                {['출근', '퇴근'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="calendar-day__state-tag"
                    onClick={() => setCorrectionType(type)}
                    style={{
                      ...makeCalendarBadgeStyle(
                        correctionType === type ? 'rgba(91, 136, 214, 0.18)' : 'rgba(148, 163, 184, 0.12)',
                        correctionType === type ? 'var(--blue)' : '#64748b',
                        correctionType === type ? 'rgba(91, 136, 214, 0.42)' : 'rgba(148, 163, 184, 0.24)'
                      ),
                      width: '100%',
                      minWidth: 0,
                      minHeight: 36,
                      paddingInline: 12,
                      paddingBlock: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      justifyContent: 'center',
                      whiteSpace: 'nowrap',
                      boxShadow: correctionType === type ? '0 0 0 2px rgba(91, 136, 214, 0.14)' : 'none',
                      transform: correctionType === type ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>보정 시간</label>
              <select
                className="ui-select"
                value={correctionTime}
                onChange={(e) => setCorrectionTime(e.target.value)}
                disabled={!selectedEmployee || !activeDate}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 30, fontSize: 11 }}
              >
                <option value="">시간 선택</option>
                {TIME_OPTIONS.map((time) => (
                  <option key={`correction-${time}`} value={time}>{time}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="form-label" style={{ margin: 0 }}>사유 / 메모</div>
              <textarea
                className="ui-textarea"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="예: 야근 후 퇴근 누락, 보정 요청 반영"
                disabled={!selectedEmployee || !activeDate}
                style={{ minHeight: 112, width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {hasSavedAttendanceCorrection ? (
                <button
                  type="button"
                  className="login-btn"
                  onClick={handleDeleteAttendanceCorrection}
                  disabled={!selectedEmployee || !activeDate || correctionSaving}
                  style={{ marginTop: 0, marginRight: 8, background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', minWidth: 130 }}
                >
                  {correctionSaving ? '삭제 중...' : '보정 삭제'}
                </button>
              ) : null}
              <button
                type="button"
                className="login-btn"
                onClick={handleSaveAttendanceCorrection}
                disabled={!selectedEmployee || !activeDate || !correctionTime || correctionSaving}
                style={{ marginTop: 0, background: 'var(--blue)', color: '#fff', minWidth: 130 }}
              >
                {correctionSaving ? '저장 중...' : '보정 저장'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              수동 내역
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="calendar-day__state-tag" style={makeCalendarBadgeStyle('rgba(201, 150, 75, 0.14)', 'var(--amber)', 'rgba(201, 150, 75, 0.28)')}>
                대기 {pendingManualCheckins.length}건
              </span>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{selectedManualCheckins.length}건</div>
              <button
                type="button"
                className="login-btn"
                onClick={handleDeleteSelectedManualCheckins}
                disabled={!selectedManualDeleteIds.length || correctionSaving}
                style={{ marginTop: 0, background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', minWidth: 72, paddingInline: 10, height: 30, fontSize: 12 }}
              >
                {correctionSaving ? '삭제 중...' : `선택 삭제${selectedManualDeleteIds.length ? ` (${selectedManualDeleteIds.length})` : ''}`}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto' }}>
            {selectedManualCheckins.length === 0 ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px dashed var(--border)',
                  color: 'var(--text-3)',
                  fontSize: 12.5,
                  background: 'var(--bg-overlay-sm)',
                }}
              >
                수동 출퇴근 기록이 없습니다.
              </div>
            ) : selectedManualCheckins.map((row, index) => {
              const workDate = String(row.workDate || row.work_date || '').slice(0, 10);
              const checkType = String(row.checkType || row.check_type || '수동').trim();
              const isScheduleRequest = checkType.includes('근무일정') || checkType.includes('일정');
              const checkTime = formatManualTime(row.checkTime || row.check_time);
              const noteTextRaw = String(row.note || '').trim();
              let noteText = noteTextRaw;
              try {
                const parsedNote = noteTextRaw ? JSON.parse(noteTextRaw) : null;
                if (parsedNote && typeof parsedNote === 'object') {
                  noteText = String(parsedNote.reason || '').trim();
                }
              } catch {
                noteText = noteTextRaw;
              }
              if (isScheduleRequest) {
                noteText = noteText || '-';
              }
              const decision = String(row.adminDecision || row.admin_decision || '').trim();
              const rowId = String(row.id || '').trim();
              const checkTypeText = checkType.includes('근무일정')
                ? '근무일정조정'
                : checkType.includes('출근')
                  ? '출근'
                  : checkType.includes('퇴근')
                    ? '퇴근'
                    : '수동';
              const checkTypeStyle = checkTypeText === '출근'
                ? {
                    background: 'rgba(95, 169, 113, 0.16)',
                    color: 'var(--green)',
                    borderColor: 'rgba(95, 169, 113, 0.34)',
                  }
                : checkTypeText === '퇴근'
                  ? {
                      background: 'rgba(91, 136, 214, 0.16)',
                      color: 'var(--blue)',
                      borderColor: 'rgba(91, 136, 214, 0.34)',
                    }
                  : {
                      background: 'rgba(168, 85, 247, 0.14)',
                      color: 'var(--purple)',
                      borderColor: 'rgba(168, 85, 247, 0.28)',
                    };
              const decisionLabel = decision === 'approved' ? '승인 완료' : decision === 'rejected' ? '반려 처리' : '대기';
              const decisionColor = decision === 'approved'
                ? 'var(--green)'
                : decision === 'rejected'
                  ? 'var(--red)'
                  : 'var(--amber)';

              return (
                <div
                  key={String(row.id || index)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 14,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-overlay-sm)',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {rowId ? (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedManualDeleteIds.includes(rowId)}
                            onChange={(e) => {
                              setSelectedManualDeleteIds((prev) => (
                                e.target.checked
                                  ? Array.from(new Set([...prev, rowId]))
                                  : prev.filter((id) => id !== rowId)
                              ));
                            }}
                            style={{ width: 14, height: 14 }}
                          />
                        </label>
                      ) : null}
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{workDate}</span>
                      <span
                        className="calendar-day__state-tag"
                        style={{
                          paddingInline: 8,
                          paddingBlock: 3,
                          background: checkTypeStyle.background,
                          color: checkTypeStyle.color,
                          borderColor: checkTypeStyle.borderColor,
                        }}
                      >
                        {checkTypeText}
                      </span>
                      {!isScheduleRequest && checkTime ? (
                        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 700 }}>{checkTime}</span>
                      ) : null}
                    </div>
                    <span
                      className="calendar-day__state-tag"
                      style={{
                        paddingInline: 8,
                        paddingBlock: 3,
                        background: decision === 'approved'
                          ? 'rgba(16, 185, 129, 0.16)'
                          : decision === 'rejected'
                            ? 'rgba(239, 68, 68, 0.16)'
                            : 'rgba(245, 158, 11, 0.16)',
                        color: decisionColor,
                        borderColor: decision === 'approved'
                          ? 'rgba(16, 185, 129, 0.34)'
                          : decision === 'rejected'
                            ? 'rgba(239, 68, 68, 0.34)'
                            : 'rgba(245, 158, 11, 0.34)',
                      }}
                    >
                      {decisionLabel}
                    </span>
                  </div>
                  {noteText ? (
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      {noteText}
                    </div>
                  ) : null}
                  {decision === 'pending' ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="login-btn"
                        onClick={() => handleManualDecision(row.id, 'approved')}
                        style={{ marginTop: 0, background: 'rgba(16, 185, 129, 0.14)', color: 'var(--green)', minWidth: 84 }}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="login-btn"
                        onClick={() => handleManualDecision(row.id, 'rejected')}
                        style={{ marginTop: 0, background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red)', minWidth: 84 }}
                      >
                        반려
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
