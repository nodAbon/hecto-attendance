import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, User } from 'lucide-react';
import { getEmployeeDailyScheduleOptionsForDept, getScheduleBadgeLabel } from '../lib/nightScheduleRules';
import { uiText } from '../lib/uiText';

const WEEKDAYS = uiText.page.calendar.weekdays;
const BATCH_COPY = uiText.scheduleBatch;
const CALENDAR_COPY = uiText.scheduleCalendar;
const COMMON_COPY = uiText.common;

const getCalendarCells = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const firstDayIndex = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push({ empty: true });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ empty: false, dayNum: day, dateStr });
  }
  return cells;
};

const formatMonthLabel = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  return `${year}년 ${month}월`;
};

const formatLocalDateStr = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
};

const normalizeTime = (value) => String(value || '').trim().substring(0, 5);

const formatCompactDate = (dateStr = '') => {
  if (!dateStr) return '';
  const [, month, day] = String(dateStr).split('-');
  if (!month || !day) return String(dateStr);
  return `${Number(month)}/${Number(day)}`;
};

const summarizeDateRanges = (dateStrings = []) => {
  const sorted = Array.from(new Set((dateStrings || []).map((date) => String(date || ''))))
    .filter(Boolean)
    .sort();

  if (sorted.length === 0) return '';

  const ranges = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  const asDate = (dateStr) => {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const expected = asDate(previous);
    expected.setDate(expected.getDate() + 1);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;

    if (expectedStr !== current) {
      ranges.push([rangeStart, previous]);
      rangeStart = current;
    }
    previous = current;
  }
  ranges.push([rangeStart, previous]);

  return ranges.map(([start, end]) => (
    start === end
      ? formatCompactDate(start)
      : `${formatCompactDate(start)} ~ ${formatCompactDate(end)}`
  )).join(', ');
};

const buildDailyStats = (logs, empNo) => {
  const stats = {};
  const empDayLogs = {};

  (logs || [])
    .filter((log) => String(log?.empNo || '') === String(empNo || ''))
    .filter((log) => !String(log?.adjustedRole || log?.eventType || '').includes('무시'))
    .forEach((log) => {
      const logTime = String(log?.logTime || '');
      const parts = logTime.split(' ');
      const dateStr = String(log?.workDate || parts[0] || '');
      const timePart = parts[1];
      const timeStr = String(timePart || '').substring(0, 5);
      if (!dateStr || !timeStr) return;

      if (!empDayLogs[dateStr]) {
        empDayLogs[dateStr] = [];
      }
      empDayLogs[dateStr].push({ timeStr, log });
    });

  Object.entries(empDayLogs).forEach(([dateStr, entries]) => {
    const sorted = [...entries].sort((a, b) => (a.log.workOrder ?? 0) - (b.log.workOrder ?? 0) || a.timeStr.localeCompare(b.timeStr));
    const first = sorted[0];
    const checkoutEntries = sorted.filter((entry) => {
      const role = String(entry.log.adjustedRole || entry.log.eventType || '').trim().toLowerCase();
      return entry.log.isCheckoutCandidate || entry.log.isAdjustedCheckout || role.includes('퇴') || role.includes('checkout');
    });
    const last = checkoutEntries[checkoutEntries.length - 1];

    let checkOutTime = null;
    if (last) {
      if (last.log.correctedOutTime) {
        checkOutTime = last.log.correctedOutTime.split(' ')[1]?.substring(0, 5);
      } else {
        checkOutTime = last.timeStr;
      }
      if (sorted.length === 1 && !last.log.isAdjustedCheckout && !String(last.log.adjustedRole || last.log.eventType || '').includes('퇴')) {
        checkOutTime = null;
      }
    }

    stats[dateStr] = {
      in: first.timeStr,
      out: checkOutTime,
    };
  });

  return stats;
};

export default function ScheduleCalendarPanel({
  month,
  onMonthChange,
  deptOptions = [],
  deptFilter,
  onDeptFilterChange,
  employeeOptions = [],
  employeeFilter,
  onEmployeeFilterChange,
  selectedEmployee,
  selectedEmployeeEmpNo,
  selectedEmployeeBaseSchedule = '08:00',
  selectedEmployeeBaseScheduleLabel = '',
  selectedEmployeeOverrides = [],
  monthlyLogs = [],
  selectedDate,
  onPickDate,
  onSubmitOverride,
  onCancelOverride,
  onDeleteOverride,
  overrideTarget,
  overrideDate,
  overrideStart,
  onChangeOverrideDate,
  onChangeOverrideStart,
  overrideNote,
  onChangeOverrideNote,
  canChangeDept = true,
  showBatchNightTools = false,
  batchNightMode = false,
  selectedBatchDates = [],
  onToggleBatchDate,
  batchPatternCode = 'N1',
  onChangeBatchPatternCode,
  batchNightNote = '',
  onChangeBatchNightNote,
  onApplyBatchNightPattern,
  batchNightSaving = false,
  onToggleBatchNightMode,
  onBatchDateMouseDown,
  onBatchDateMouseEnter,
  onBatchDateMouseUp,
  batchNightStart = '08:00',
  batchNightEnd = '17:00',
  onChangeBatchNightStart,
  onChangeBatchNightEnd,
  batchTargetDept = '',
  batchTargetEmployeeDept = '',
}) {
  const cells = getCalendarCells(month);
  const overrideMap = new Map((selectedEmployeeOverrides || []).map((row) => [row.work_date, row]));
  const dailyStats = buildDailyStats(monthlyLogs, selectedEmployeeEmpNo);
  const monthLabel = formatMonthLabel(month);
  const todayStr = formatLocalDateStr();
  const baseSchedule = normalizeTime(selectedEmployeeBaseSchedule) || '08:00';
  const baseScheduleLabel = String(selectedEmployeeBaseScheduleLabel || '').trim() || baseSchedule;
  const selectedEmployeeDept = String(selectedEmployee?.dept || '').trim();
  const showDeptPicker = !!canChangeDept;
  const selectedBatchSet = new Set((selectedBatchDates || []).map((date) => String(date || '')));
  const batchScheduleOptions = getEmployeeDailyScheduleOptionsForDept(batchTargetEmployeeDept || selectedEmployee?.dept || '');
  const selectedBatchSummary = summarizeDateRanges(selectedBatchDates);
  const isWeeklyCustomSchedule = batchPatternCode === 'CUSTOM';
  const handleDayClick = (dateStr, override) => {
    if (batchNightMode) {
      return;
    }
    onPickDate?.(dateStr, override);
  };

  return (
    <div className="card schedule-calendar-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="calendar-widget__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div className="calendar-widget__eyebrow">{CALENDAR_COPY.eyebrow}</div>
          <div className="calendar-widget__title">{monthLabel} {CALENDAR_COPY.monthSuffix}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
            <span className="legend-pill">
              <CalendarDays className="legend-dot-sm" style={{ color: 'var(--blue)' }} />
              {CALENDAR_COPY.legendBaseSchedule}
            </span>
            <span className="legend-pill">
              <Clock3 className="legend-dot-sm" style={{ color: 'var(--purple)' }} />
              {CALENDAR_COPY.legendOverride}
            </span>
            <span className="legend-pill">
              <User className="legend-dot-sm" style={{ color: 'var(--red)' }} />
              {CALENDAR_COPY.legendToday}
            </span>
            <span className="legend-pill">
              <strong>{selectedEmployee?.name || CALENDAR_COPY.selectedEmployeeFallback}</strong>
            </span>
          </div>
        </div>
        <div className="calendar-widget__nav">
          <button type="button" className="calendar-widget__nav-btn" onClick={() => onMonthChange?.('prev')} aria-label="이전 달">
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          <button type="button" className="calendar-widget__nav-btn" onClick={() => onMonthChange?.('next')} aria-label="다음 달">
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(260px, 0.85fr)',
        gap: '16px',
        alignItems: 'start'
      }}>
        <div className="calendar-widget">
          <div style={{ display: 'grid', gridTemplateColumns: showDeptPicker ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: '10px' }}>
            {showDeptPicker && (
            <div>
              <div className="form-label">부서 선택</div>
              <select
                className="ui-select"
                value={deptFilter}
                onChange={(e) => onDeptFilterChange?.(e.target.value)}
                disabled={!canChangeDept}
                style={{ width: '100%' }}
              >
                {deptOptions.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            )}
            <div>
              <div className="form-label">직원 선택</div>
              <select
                className="ui-select"
                value={employeeFilter}
                onChange={(e) => onEmployeeFilterChange?.(e.target.value)}
                style={{ width: '100%' }}
              >
                {employeeOptions.length === 0 ? (
                  <option value="">선택 가능한 직원이 없습니다</option>
                ) : (
                  employeeOptions.map((emp) => (
                    <option key={emp.empNo} value={emp.empNo}>
                      {emp.name} ({emp.empNo})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="calendar-widget__legend">
            <div className="calendar-widget__legend-item">
              <span className="calendar-widget__legend-swatch" style={{ background: 'var(--amber)' }} />
              {CALENDAR_COPY.legendOverride}
            </div>
            <div className="calendar-widget__legend-item">
              <span className="calendar-widget__legend-swatch" style={{ background: 'var(--red)' }} />
              {CALENDAR_COPY.legendToday}
            </div>
          </div>

          <div className="calendar-widget__weekday-grid">
            {WEEKDAYS.map((day, idx) => (
              <div
                key={`weekday-${idx}`}
                className={`calendar-widget__weekday ${idx === 0 ? 'is-sun' : idx === 6 ? 'is-sat' : ''}`}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="calendar-widget__grid">
            {cells.map((cell, idx) => {
              if (cell.empty) {
                return <div key={`empty-${idx}`} className="calendar-widget__spacer" />;
              }

              const override = overrideMap.get(cell.dateStr);
              const isSelected = selectedDate === cell.dateStr;
              const isBatchSelected = selectedBatchSet.has(cell.dateStr);
              const isToday = cell.dateStr === todayStr;
              const actualIn = normalizeTime(dailyStats[cell.dateStr]?.in);
              const actualOut = normalizeTime(dailyStats[cell.dateStr]?.out);
              const badgeLabel = override
                ? getScheduleBadgeLabel({
                  dept: selectedEmployeeDept,
                  start: override.schedule_start,
                  end: override.schedule_end,
                  isOverride: true,
                })
                : CALENDAR_COPY.baseTag;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={[
                    'calendar-day',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                    isBatchSelected ? 'is-selected' : '',
                    override ? 'has-override' : 'is-base',
                  ].filter(Boolean).join(' ')}
                  onMouseDown={(e) => onBatchDateMouseDown?.(cell.dateStr, e)}
                  onMouseEnter={(e) => onBatchDateMouseEnter?.(cell.dateStr, e)}
                  onMouseUp={(e) => onBatchDateMouseUp?.(cell.dateStr, e)}
                  onClick={() => handleDayClick(cell.dateStr, override)}
                  style={{
                    ...(isBatchSelected
                      ? {
                        boxShadow: 'inset 0 0 0 2px rgba(168, 85, 247, 0.85), 0 0 0 1px rgba(168, 85, 247, 0.2)',
                        background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.16), rgba(79, 70, 229, 0.10))',
                      }
                      : null),
                  }}
                >
                  <div className="calendar-day__top">
                    <span className="calendar-day__number">{cell.dayNum}</span>
                    <div className="calendar-day__tag-stack">
                      {isToday && <span className="calendar-day__state-tag is-today-tag">{CALENDAR_COPY.todayTag}</span>}
                      {override && (
                        <span className="calendar-day__state-tag is-override-tag">{badgeLabel}</span>
                      )}
                    </div>
                  </div>

                  <div className="calendar-day__time-block">
                    {actualIn && (
                      <span className="calendar-day__time-main is-in">
                        {CALENDAR_COPY.checkinLabel} {actualIn}
                      </span>
                    )}
                    {actualOut && (
                      <span className="calendar-day__time-main is-out">
                        {CALENDAR_COPY.checkoutLabel} {actualOut}
                      </span>
                    )}
                  </div>

                  <div className="calendar-day__leave-list">
                    <span className="calendar-day__leave-more">
                      {CALENDAR_COPY.clickToAdjust}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="calendar-detail schedule-calendar-detail" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div className="calendar-detail__title" style={{ marginBottom: '4px' }}>
            <span className="calendar-detail__date">
              {selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.empNo})` : CALENDAR_COPY.selectedEmployeeFallback}
            </span>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>{CALENDAR_COPY.departmentLabel}</span>
              <strong>{selectedEmployee?.dept || '-'}</strong>
            </div>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>{CALENDAR_COPY.baseScheduleSummaryLabel}</span>
              <strong>{baseScheduleLabel}</strong>
            </div>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>{CALENDAR_COPY.selectedDateSummaryLabel}</span>
              <strong>{selectedDate || CALENDAR_COPY.noDateSelected}</strong>
            </div>
          </div>

          <div style={{ marginTop: '8px' }}>
            <div className="calendar-detail__title" style={{ marginBottom: '8px' }}>
              {CALENDAR_COPY.selectedOverridesTitle}
            </div>
            {selectedEmployeeOverrides.length === 0 ? (
              <div className="calendar-detail__empty">{CALENDAR_COPY.noOverrides}</div>
            ) : (
              selectedEmployeeOverrides.map((row) => {
                const start = normalizeTime(row.schedule_start);
                const end = normalizeTime(row.schedule_end);
                return (
                  <div key={`${row.emp_no}-${row.work_date}`} className="calendar-detail__item" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span className="calendar-detail__item-name">{row.work_date}</span>
                      <span className="calendar-detail__item-detail">
                        {start ? `${CALENDAR_COPY.checkinLabel} ${start}` : ''}
                        {start && end ? ' · ' : ''}
                        {end ? `${CALENDAR_COPY.checkoutLabel} ${end}` : ''}
                        {row.note ? ` · ${row.note}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="login-btn"
                      style={{ marginTop: 0, padding: '6px 10px' }}
                      onClick={() => onDeleteOverride?.({ empNo: selectedEmployeeEmpNo, workDate: row.work_date })}
                    >
                      {CALENDAR_COPY.delete}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmitOverride} style={{ display: 'grid', gap: '12px' }}>
        <div className="calendar-detail__title" style={{ marginTop: '4px' }}>
          {CALENDAR_COPY.adjustTitle}
        </div>
        {overrideTarget ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '12px',
            alignItems: 'end'
          }}>
            <div>
              <div className="form-label">{CALENDAR_COPY.adjustDateLabel}</div>
              <input
                type="date"
                className="form-input"
                value={overrideDate}
                onChange={(e) => onChangeOverrideDate?.(e.target.value)}
                required
              />
            </div>
            <div>
              <div className="form-label">{CALENDAR_COPY.adjustStartLabel}</div>
              <select
                className="ui-select"
                value={overrideStart}
                onChange={(e) => onChangeOverrideStart?.(e.target.value)}
                required
              >
                {Array.from({ length: 48 }, (_, i) => {
                  const h = String(Math.floor(i / 2)).padStart(2, '0');
                  const m = i % 2 === 0 ? '00' : '30';
                  const time = `${h}:${m}`;
                  return <option key={time} value={time}>{time}</option>;
                })}
              </select>
            </div>
            <div>
              <div className="form-label">{CALENDAR_COPY.adjustNoteLabel}</div>
              <input
                type="text"
                className="form-input"
                value={overrideNote}
                onChange={(e) => onChangeOverrideNote?.(e.target.value)}
                placeholder={CALENDAR_COPY.adjustNotePlaceholder}
              />
            </div>
          </div>
        ) : (
          <div className="calendar-detail__empty" style={{ padding: '14px 0' }}>
            {CALENDAR_COPY.noTargetMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="login-btn"
            style={{ marginTop: 0, padding: '9px 16px' }}
            onClick={onCancelOverride}
          >
            {CALENDAR_COPY.cancelSelection}
          </button>
          <button
            type="submit"
            className="login-btn"
            style={{ marginTop: 0, padding: '9px 16px' }}
            disabled={!overrideTarget}
          >
            {CALENDAR_COPY.applyAdjustment}
          </button>
        </div>
      </form>

      {showBatchNightTools && (
        <div className="card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="card-header" style={{ paddingBottom: 0, borderBottom: "none" }}>
            <div>
              <h3 className="card-title">{BATCH_COPY.title}</h3>
              <p className="card-subtitle">{BATCH_COPY.subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge purple">{batchNightMode ? BATCH_COPY.modeBadgeOn : BATCH_COPY.modeBadgeOff}</span>
              <button
                type="button"
                className="ui-btn"
                onClick={() => onToggleBatchNightMode?.()}
                style={{ padding: "7px 12px" }}
              >
                {batchNightMode ? BATCH_COPY.switchToNormal : BATCH_COPY.switchToBatch}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="form-label">{BATCH_COPY.targetDeptLabel}</div>
              <div className="leave-panel__summary-chip" style={{ justifyContent: "space-between" }}>
                <strong>{batchTargetDept || BATCH_COPY.targetDeptPlaceholder}</strong>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                {selectedEmployee?.dept ? `${BATCH_COPY.targetDeptSubLabel}: ${selectedEmployee.dept}` : ''}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="form-label">{BATCH_COPY.patternLabel}</div>
              <select
                className="ui-select"
                value={batchPatternCode}
                onChange={(e) => onChangeBatchPatternCode?.(e.target.value)}
              >
                {batchScheduleOptions.map((preset) => (
                  <option key={preset.code} value={preset.code}>{preset.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="form-label">{BATCH_COPY.selectedCountLabel}</div>
              <div className="leave-panel__summary-chip">
                <strong>{selectedBatchDates.length}{COMMON_COPY.units.day}</strong>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="form-label">{BATCH_COPY.memoLabel}</div>
              <input
                type="text"
                className="form-input"
                value={batchNightNote}
                onChange={(e) => onChangeBatchNightNote?.(e.target.value)}
                placeholder={BATCH_COPY.memoPlaceholder}
              />
            </div>
          </div>

          {isWeeklyCustomSchedule && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div className="form-label">{BATCH_COPY.weeklyStartLabel}</div>
                <input
                  type="time"
                  step="60"
                  className="form-input"
                  value={batchNightStart}
                  onChange={(e) => onChangeBatchNightStart?.(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div className="form-label">{BATCH_COPY.weeklyEndLabel}</div>
                <input
                  type="time"
                  step="60"
                  className="form-input"
                  value={batchNightEnd}
                  onChange={(e) => onChangeBatchNightEnd?.(e.target.value)}
                />
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="form-label">{BATCH_COPY.selectedDatesLabel}</div>
            <div className="leave-panel__summary-chip" style={{ justifyContent: "space-between", gap: "8px" }}>
              <span>{selectedBatchSummary || BATCH_COPY.selectedDatesHelp}</span>
              <strong>{selectedBatchDates.length}{COMMON_COPY.units.day}</strong>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {selectedBatchDates.length === 0 ? (
                <div className="calendar-detail__empty" style={{ padding: "12px 0" }}>
                  {BATCH_COPY.selectedDatesEmpty}
                </div>
              ) : (
                selectedBatchDates.map((dateStr) => (
                  <span
                    key={dateStr}
                    className="badge"
                    style={{ background: "rgba(168, 85, 247, 0.15)", color: "#d8b4fe", border: "1px solid rgba(168, 85, 247, 0.25)" }}
                  >
                    {formatCompactDate(dateStr)}
                  </span>
                ))
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="login-btn"
              style={{ marginTop: 0, padding: "9px 16px" }}
              onClick={() => onToggleBatchDate?.("__clear__")}
              disabled={selectedBatchDates.length === 0}
            >
              {BATCH_COPY.clearSelection}
            </button>
            <button
              type="button"
              className="login-btn"
              style={{ marginTop: 0, padding: "9px 16px", background: "var(--purple)" }}
              onClick={() => onApplyBatchNightPattern?.()}
              disabled={batchNightSaving || selectedBatchDates.length === 0 || !selectedEmployee?.empNo}
            >
              {batchNightSaving ? BATCH_COPY.saving : BATCH_COPY.submit}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
