'use client';

import React from 'react';
import { getHolidayName, getLeaveMeta } from '../../../lib/leaveRules';
import { isManagedAttendanceDept } from '../../../lib/dashboardUtils';

const getLeaveVariantClass = (meta) => String(meta?.variantClassName || '').trim();

const formatScheduleRange = (schedule) => {
  const start = String(schedule?.start || '').trim();
  const end = String(schedule?.end || '').trim();
  if (!start && !end) return '';
  if (start && end) return `${start} - ${end}`;
  return start || end;
};

export default function TrackerCalendarSection({
  trackerGridData,
  selectedEmployee,
  monthlyData,
  showOvertimeNote = false,
  activeDate = '',
  onDateSelect,
}) {
  if (!selectedEmployee) {
    return (
      <div className="tracker-empty" style={{ display: 'flex', minHeight: 260, alignItems: 'center', justifyContent: 'center' }}>
        사원을 먼저 선택해주세요.
      </div>
    );
  }

  if (!trackerGridData) return null;

  const {
    targetEmp,
    cells,
    dailyStats,
    overrideMap,
  } = trackerGridData;

  const isManagedDept = isManagedAttendanceDept(targetEmp?.dept || '');

  return (
    <div className="tracker-calendar-section">
      <div className="tracker-calendar-shell" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          className="tracker-calendar-head"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--bg-overlay-md)',
            borderBottom: '1px solid var(--border)',
            textAlign: 'center',
            padding: '8px 0',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-2)',
          }}
        >
          <div style={{ color: 'var(--red)' }}>일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div style={{ color: 'var(--blue)' }}>토</div>
        </div>

        <div
          className="tracker-calendar-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gridAutoRows: 'minmax(72px, auto)',
            background: 'var(--bg-card)',
          }}
        >
          {cells.map((cell, idx) => {
            if (cell.empty) {
              return (
                <div
                  key={idx}
                  className="tracker-day-cell tracker-day-cell--empty"
                  style={{
                    background: 'var(--bg-overlay-sm)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                  }}
                />
              );
            }

            const stat = dailyStats[cell.dateStr];
            const hasClockIn = stat && stat.in;
            const hasClockOut = stat && (stat.out || stat.correctedOutTime);
            const holidayName = getHolidayName(cell.dateStr);
            const dayOfWeek = idx % 7;
            const dayOverride = overrideMap[cell.dateStr];
            const dateCompact = cell.dateStr.replace(/-/g, '');
            const dayLeave = (monthlyData?.leaves || []).find((leave) => (
              leave.empNo === selectedEmployee
              && dateCompact >= leave.startDate
              && dateCompact <= leave.endDate
            ));
            const daySchedule = trackerGridData.daySchedules?.[cell.dateStr] || null;
            const hasCustomSchedule = daySchedule && daySchedule.source !== 'base';
            const scheduleText = hasCustomSchedule ? formatScheduleRange(daySchedule) : '';

            let dayNumColor = 'var(--text-1)';
            if (dayOfWeek === 0 || holidayName) dayNumColor = 'var(--red)';
            else if (dayOfWeek === 6) dayNumColor = 'var(--blue)';

            const isLateDay = !!stat?.isLate;

            return (
              <div
                key={cell.dateStr}
                className="tracker-day-cell"
                role="button"
                tabIndex={0}
                onClick={() => onDateSelect?.(cell.dateStr)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDateSelect?.(cell.dateStr);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 7px',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  position: 'relative',
                  background: isLateDay
                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(245, 158, 11, 0.05))'
                    : dayOfWeek === 0
                      ? 'rgba(239, 68, 68, 0.03)'
                      : dayOfWeek === 6
                        ? 'rgba(59, 130, 246, 0.03)'
                        : 'transparent',
                  boxShadow: isLateDay
                    ? 'inset 4px 0 0 rgba(245, 158, 11, 0.9), inset 0 0 0 1px rgba(245, 158, 11, 0.32)'
                    : cell.dateStr === activeDate
                      ? 'inset 0 0 0 2px rgba(91, 136, 214, 0.75)'
                      : 'none',
                  cursor: 'pointer',
                  minHeight: '72px',
                }}
              >
                <div className="tracker-day-cell__top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span className="tracker-day-cell__date" style={{ fontSize: '13px', fontWeight: 700, color: dayNumColor }}>
                    {cell.dayNum}
                  </span>

                  {hasCustomSchedule && scheduleText ? (
                    <span
                      className="tracker-day-cell__schedule"
                      style={{
                        fontSize: '10px',
                        background: daySchedule?.source === 'team-pattern'
                          ? 'rgba(168, 85, 247, 0.12)'
                          : 'rgba(91, 136, 214, 0.12)',
                        color: daySchedule?.source === 'team-pattern' ? 'var(--purple)' : 'var(--blue)',
                        border: `1px solid ${daySchedule?.source === 'team-pattern' ? 'rgba(168, 85, 247, 0.28)' : 'rgba(91, 136, 214, 0.24)'}`,
                        padding: '1px 6px',
                        borderRadius: '999px',
                        whiteSpace: 'nowrap',
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                      title={dayOverride?.note || daySchedule?.note || scheduleText}
                    >
                      {scheduleText}
                    </span>
                  ) : (
                    holidayName ? (
                      <span
                        className="tracker-day-cell__holiday"
                        style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 700 }}
                        title={holidayName}
                      >
                        {holidayName}
                      </span>
                    ) : null
                  )}
                </div>

                <div className="tracker-day-cell__body" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '1px' }}>
                  {dayLeave && (() => {
                    const leaveMeta = getLeaveMeta(dayLeave, stat);
                    return (
                      <span
                        className={`tracker-day-cell__leave ${getLeaveVariantClass(leaveMeta)}`.trim()}
                        style={{
                          fontSize: '10px',
                          color: leaveMeta.color,
                          background: leaveMeta.bg,
                          border: `1px solid ${leaveMeta.border}`,
                          padding: '1px 6px',
                          borderRadius: '999px',
                          width: 'fit-content',
                          whiteSpace: 'nowrap',
                          fontWeight: 700,
                          lineHeight: 1.2,
                        }}
                        title={dayLeave.leaveName}
                      >
                        {leaveMeta.label}
                      </span>
                    );
                  })()}

                  {hasClockIn && (
                    <div className="tracker-day-cell__metric tracker-day-cell__in">
                      <span className="tracker-day-cell__metric-label">출근</span>
                      <span className="tracker-day-cell__metric-value">{stat.in}</span>
                    </div>
                  )}

                  {hasClockOut && (
                    <div className="tracker-day-cell__metric tracker-day-cell__out">
                      <span className="tracker-day-cell__metric-main">
                        <span className="tracker-day-cell__metric-label">퇴근</span>
                        <span className="tracker-day-cell__metric-value">
                          {stat.correctedOutTime ? (
                            <span style={{ color: 'var(--blue)' }} title={`원래 시간: ${stat.out}${stat.correctionReason ? ` (${stat.correctionReason})` : ''}`}>
                              {stat.correctedOutTime}*
                            </span>
                          ) : stat.out}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showOvertimeNote && isManagedDept ? (
        <div className="tracker-personal-foot" style={{ marginTop: 12 }}>
          <span>외부사업팀은 월간 캘린더에서 출근/퇴근과 조정된 근무일정만 확인합니다.</span>
        </div>
      ) : null}
    </div>
  );
}
