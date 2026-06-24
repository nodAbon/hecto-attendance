'use client';

import React, { memo } from 'react';
import DashboardCalendarWidget from '../DashboardCalendarWidget';
import {
  getHolidayName,
  getLeaveDisplayName,
  getLeaveMeta,
  sortCalendarLeaves,
} from '../../lib/leaveRules';

const getLeaveVariantClass = (meta) => String(meta?.variantClassName || '').trim();

function getSelectedDayLeaves(selectedDate, leaves, employeeNameLookup) {
  if (!selectedDate) return [];
  const compact = selectedDate.replace(/-/g, '');
  return sortCalendarLeaves(
    (leaves || []).filter((leave) => compact >= leave.startDate && compact <= leave.endDate),
    employeeNameLookup
  );
}

function LeaveDetailPanel({ selectedDate, leaves, employeeNameLookup }) {
  const dayLeaves = getSelectedDayLeaves(selectedDate, leaves, employeeNameLookup);
  const holidayName = selectedDate ? getHolidayName(selectedDate) : '';

  const grouped = Object.values(
    dayLeaves.reduce((acc, leave, index) => {
      const meta = getLeaveMeta(leave);
      const key = meta.label;
      if (!acc[key]) acc[key] = { meta, leaves: [] };
      acc[key].leaves.push({ leave, index });
      return acc;
    }, {})
  );

  return (
    <aside className="card leave-overview-panel">
      <div className="leave-overview-panel__header">
        <div>
          <div className="calendar-widget__eyebrow">휴가 상세</div>
          <div className="calendar-widget__title">
            {selectedDate || '날짜를 선택해 주세요'}
          </div>
        </div>
        <div className="leave-overview-panel__count">
          {selectedDate ? `${dayLeaves.length}명` : '대기'}
        </div>
      </div>

      {!selectedDate ? (
        <div className="leave-overview-panel__empty">
          왼쪽 캘린더에서 날짜를 누르면 해당 날짜의 휴가 인원과 휴가 유형을 바로 확인할 수 있습니다.
        </div>
      ) : (
        <>
          <div className="leave-overview-panel__summary">
            <div className="leave-panel__summary-chip">
              <span>선택 일자</span>
              <strong>{selectedDate}</strong>
            </div>
            <div className="leave-panel__summary-chip">
              <span>휴가 인원</span>
              <strong>{dayLeaves.length}명</strong>
            </div>
            <div className="leave-panel__summary-chip">
              <span>공휴일</span>
              <strong>{holidayName || '-'}</strong>
            </div>
          </div>

          {dayLeaves.length === 0 ? (
            <div className="leave-overview-panel__empty">
              해당 날짜에는 등록된 휴가가 없습니다.
            </div>
          ) : (
            <div className="leave-overview-panel__group-grid">
              {grouped.map(({ meta, leaves: groupLeaves }) => (
                <div
                  key={`${meta.label}-${groupLeaves.length}-${groupLeaves[0]?.leave?.empNo || groupLeaves[0]?.leave?.leaveName || 'group'}`}
                  className={`leave-overview-panel__group-card ${getLeaveVariantClass(meta)}`.trim()}
                  style={{ background: meta.bg, borderColor: meta.border }}
                >
                  <div className="leave-overview-panel__group-head">
                    <div className="leave-overview-panel__group-title" style={{ color: meta.color }}>
                      {meta.label}
                    </div>
                    <div className="leave-overview-panel__group-count">{groupLeaves.length}명</div>
                  </div>
                  <div className="leave-overview-panel__group-body">
                    {groupLeaves.map(({ leave, index }) => (
                      <span
                        key={`${String(leave.empNo || leave.empName || '')}-${String(leave.startDate || '')}-${String(leave.leaveName || '')}-${index}`}
                        className="calendar-detail__name-chip"
                      >
                        {getLeaveDisplayName(leave, employeeNameLookup)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function LeaveTab({
  selectedMonth,
  setSelectedMonth,
  calendarMonth,
  visibleLeaves,
  calendarEmployeeNameLookup,
  leaveCalendarDate,
  setLeaveCalendarDate,
}) {
  return (
    <div className="leave-overview-layout">
      <div className="leave-overview-calendar">
        <div className="leave-overview-calendar__frame">
          <DashboardCalendarWidget
            calendarMonth={selectedMonth || calendarMonth}
            setCalendarMonth={setSelectedMonth}
            calendarLeaves={visibleLeaves}
            employeeNameLookup={calendarEmployeeNameLookup}
            selectedCalendarDate={leaveCalendarDate}
            setSelectedCalendarDate={setLeaveCalendarDate}
            eyebrow="연차 사용 현황"
            hideSelectedDetail
            hideLegend
          />
        </div>
      </div>

      <LeaveDetailPanel
        selectedDate={leaveCalendarDate}
        leaves={visibleLeaves}
        employeeNameLookup={calendarEmployeeNameLookup}
      />
    </div>
  );
}

export default memo(LeaveTab);
