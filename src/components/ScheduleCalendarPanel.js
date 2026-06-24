'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import MonthSearchPicker from './MonthSearchPicker';
import { formatLocalDateStr } from './DashboardCalendarWidget';
import { clampToHalfHourSteps, formatHalfHourSteps, getYearWeekNumber, isExternalBusinessDept, isManagedAttendanceDept } from '../lib/dashboardUtils';
import { getHolidayName, getLeaveMeta } from '../lib/leaveRules';
import { inferNightScheduleEndTime } from '../lib/nightScheduleRules';
import { resolveSchedulePairForDate } from '../lib/scheduleResolver';
import { toMinutes, normalizeTime, getAdjustmentMinutes, getScheduleDurationMinutes, formatWeekTotalLabel, formatMonthDayLabel, TIME_OPTIONS } from '../lib/scheduleUtils';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
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

const pad2 = (value) => String(value).padStart(2, '0');

const getMonthGridCells = (yearMonthStr) => {
  if (!yearMonthStr) return [];
  const [year, month] = String(yearMonthStr).split('-').map(Number);
  if (!year || !month) return [];

  const firstDayIndex = new Date(year, month - 1, 1).getDay();
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
        </div>
        {item.note && !item.removed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', color: 'var(--text-2)', fontSize: 12 }}>
            <span>{item.note}</span>
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
}) {
  const todayStr = formatLocalDateStr();
  const cells = useMemo(() => getMonthGridCells(month), [month]);
  const overrideMap = useMemo(() => buildOverrideMap(selectedEmployeeOverrides), [selectedEmployeeOverrides]);
  const selectedDates = useMemo(
    () => Array.from(new Set((selectedBatchDates || []).map((date) => String(date || '').trim()).filter(Boolean))).sort(),
    [selectedBatchDates]
  );
  const activeDate = selectedDate || selectedDates[0] || '';
  const activeOverride = activeDate ? overrideMap.get(activeDate) || null : null;

  const baseStart = String(
    selectedEmployeeBaseScheduleStart
    || selectedEmployee?.baseScheduleTime
    || selectedEmployee?.scheduleTime
    || '08:00'
  ).slice(0, 5) || '08:00';
  const derivedBaseEnd = inferNightScheduleEndTime({ dept: selectedEmployee?.dept || '', start: baseStart, end: '' });
  const baseEnd = String(
    selectedEmployeeBaseScheduleEnd
    || selectedEmployee?.baseScheduleEndTime
    || selectedEmployee?.scheduleEndTime
    || derivedBaseEnd
    || '17:00'
  ).slice(0, 5) || derivedBaseEnd || '17:00';
  const isManagedDept = Boolean(selectedEmployee && isManagedAttendanceDept(selectedEmployee.dept));
  const currentScheduleLabel = selectedEmployeeBaseScheduleLabel || `${baseStart} - ${baseEnd}`;

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
      .sort((a, b) => String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || '')));
  }, [activeDate, selectedEmployee, selectedEmployeeLogs]);
  const selectedDayRawLogs = useMemo(() => {
    if (!selectedEmployee || !activeDate) return [];
    const empNo = String(selectedEmployee.empNo || '').trim();
    const targetDate = String(activeDate || '').slice(0, 10);
    return (selectedEmployeeLogs || [])
      .filter((row) => String(row.empNo || row.emp_no || '').trim() === empNo)
      .filter((row) => String(row.workDate || row.work_date || '').slice(0, 10) === targetDate)
      .filter((row) => !row.isManual)
      .sort((a, b) => String(a.logTime || a.log_time || '').localeCompare(String(b.logTime || b.log_time || '')));
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

  useEffect(() => {
    setSelectedManualDeleteIds([]);
  }, [selectedEmployee?.empNo, activeDate]);

  useEffect(() => {
    const firstLog = selectedDayRawLogs[0] || null;
    const lastLog = selectedDayRawLogs[selectedDayRawLogs.length - 1] || null;
    const fallbackTime = correctionType === '출근'
      ? formatManualTime(firstLog?.logTime || firstLog?.log_time || '')
      : formatManualTime(lastLog?.correctedOutTime || lastLog?.logTime || lastLog?.log_time || '');
    setCorrectionTime(fallbackTime || '');
  }, [activeDate, correctionType, selectedDayRawLogs]);

  const selectedSummary = !selectedDates.length
    ? '날짜를 선택하세요'
    : selectedDates.length === 1
      ? selectedDates[0]
      : `${selectedDates.length}개 날짜 선택`;
  const allSelectedHaveSchedule = selectedDates.length > 0 && selectedDates.every((dateStr) => {
    const override = overrideMap.get(dateStr) || null;
    const resolvedSchedule = resolveSchedulePairForDate({
      dept: selectedEmployee?.dept || '',
      dateStr,
      baseScheduleStart: baseStart,
      baseScheduleEnd: baseEnd,
      override,
      teamPattern: null,
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
      const totalMinutes = dateCells.reduce((sum, cell) => {
        const override = overrideMap.get(cell.dateStr) || null;
        const resolvedSchedule = resolveSchedulePairForDate({
          dept: empDept,
          dateStr: cell.dateStr,
          baseScheduleStart: baseStart,
          baseScheduleEnd: baseEnd,
          override,
          teamPattern: null,
        });
        if (!resolvedSchedule?.start || !resolvedSchedule?.end) return sum;

        const scheduleMinutes = Math.max(0, getScheduleDurationMinutes(resolvedSchedule.start, resolvedSchedule.end) - 60);
        const dayStats = dailyAttendanceMap?.[empNo]?.[cell.dateStr] || null;
        const canAdjust = isExternalBusinessDept(empDept) && (!override || override.allowOvertime !== false);
        const adjustmentMinutes = canAdjust
          ? getAdjustmentMinutes({
            scheduleEnd: resolvedSchedule.end,
            actualOut: String(dayStats?.out || '').trim(),
          })
          : 0;
        const roundedAdjustmentMinutes = clampToHalfHourSteps(adjustmentMinutes);

        return sum + scheduleMinutes + roundedAdjustmentMinutes;
      }, 0);

      rows.push({
        key: `week-${rowIndex / 7}`,
        label: `${getYearWeekNumber(displayCell?.dateStr) || rowIndex / 7 + 1}주차`,
        range: dateCells.length > 0
          ? `${formatMonthDayLabel(dateCells[0].dateStr)}~${formatMonthDayLabel(dateCells[dateCells.length - 1].dateStr)}`
          : '',
        totalLabel: formatWeekTotalLabel(totalMinutes),
        cells: rowCells,
      });
    }

    return rows;
  }, [baseEnd, baseStart, cells, dailyAttendanceMap, overrideMap, selectedEmployee?.dept, selectedEmployee?.empNo]);

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
        await onRefreshData();
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
        await onRefreshData();
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
        await onRefreshData();
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
        await onRefreshData();
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
            <div key={day} className={`calendar-widget__weekday ${idx === 0 ? 'is-sun' : idx === 6 ? 'is-sat' : ''}`}>
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
              </div>

              {week.cells.map((cell, idx) => {
                if (cell.empty) return <div key={`empty-${week.key}-${idx}`} className="calendar-widget__spacer" />;

                const isToday = cell.dateStr === todayStr;
                const isSelected = selectedDates.includes(cell.dateStr) || activeDate === cell.dateStr;
                const override = overrideMap.get(cell.dateStr) || null;
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
                const isHoliday = !!getHolidayName(cell.dateStr) || cell.dayOfWeek === '일' || cell.dayOfWeek === '토';
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
                            style={makeCalendarBadgeStyle('rgba(245, 158, 11, 0.16)', '#b45309', 'rgba(245, 158, 11, 0.34)')}
                          >
                            지각
                          </span>
                        ) : null}
                        {adjustmentBadge ? (
                          <span
                            className="calendar-day__state-tag"
                            style={makeCalendarBadgeStyle('rgba(220, 38, 38, 0.12)', '#b91c1c', 'rgba(220, 38, 38, 0.28)')}
                          >
                            {adjustmentBadge}
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
            const isHoliday = !!getHolidayName(cell.dateStr) || cell.dayOfWeek === '일' || cell.dayOfWeek === '토';
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
                        style={makeCalendarBadgeStyle('rgba(245, 158, 11, 0.16)', '#b45309', 'rgba(245, 158, 11, 0.34)')}
                      >
                            지각
                      </span>
                    ) : null}
                    {adjustmentBadge ? (
                      <span
                        className="calendar-day__state-tag"
                        style={makeCalendarBadgeStyle('rgba(220, 38, 38, 0.12)', '#b91c1c', 'rgba(220, 38, 38, 0.28)')}
                      >
                        {adjustmentBadge}
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

        <form onSubmit={onSubmitOverride} style={{ display: 'grid', gap: 12 }}>
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
              <span className="calendar-day__state-tag" style={makeCalendarBadgeStyle('rgba(245, 158, 11, 0.14)', '#b45309', 'rgba(245, 158, 11, 0.28)')}>
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

