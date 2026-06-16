'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Search, RefreshCw } from 'lucide-react';
import { getCalendarCells } from '../DashboardCalendarWidget';
import { inferNightScheduleEndTime, isNightTeamDept } from '../../lib/nightScheduleRules';

const getMonthsList = () => {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    list.push(yr + '-' + mo);
  }
  return list;
};

const SCHEDULE_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return h + ':' + m;
});

export default function ScheduleTab({
  isAdmin,
  isLeader,
  selectedMonth,
  setSelectedMonth,
  monthlyData,
  visibleScheduleEmployees,
  refreshData,
}) {
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [scheduleSelectedEmpNo, setScheduleSelectedEmpNo] = useState('');
  const [tempSchedules, setTempSchedules] = useState({});
  const [scheduleLoading, setScheduleLoading] = useState({});
  const [scheduleSelectedDates, setScheduleSelectedDates] = useState([]);
  
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideStart, setOverrideStart] = useState('08:00');
  const [overrideNote, setOverrideNote] = useState('');

  const query = empSearchQuery.trim().toLowerCase();
  const scheduleEmployees = visibleScheduleEmployees || [];
  const filteredScheduleEmployees = scheduleEmployees.filter((emp) => {
    const text = `${emp.name || ''} ${emp.empNo || ''} ${emp.dept || ''}`.toLowerCase();
    return !query || text.includes(query);
  });

  // Automatically select the first visible employee if none is selected
  useEffect(() => {
    if (!scheduleSelectedEmpNo && filteredScheduleEmployees.length > 0) {
      setScheduleSelectedEmpNo(filteredScheduleEmployees[0].empNo);
    }
  }, [filteredScheduleEmployees, scheduleSelectedEmpNo]);

  const selectedEmp = scheduleEmployees.find(e => e.empNo === scheduleSelectedEmpNo) || filteredScheduleEmployees[0] || scheduleEmployees[0] || null;
  const selectedEmpNo = selectedEmp?.empNo || '';
  const currentSchedule = selectedEmp
    ? (tempSchedules[selectedEmp.empNo] !== undefined ? tempSchedules[selectedEmp.empNo] : selectedEmp.baseScheduleTime || '08:00')
    : '08:00';
  const isScheduleChanged = selectedEmp ? currentSchedule !== (selectedEmp.baseScheduleTime || '08:00') : false;
  const isScheduleSaving = selectedEmp ? scheduleLoading[selectedEmp.empNo] : false;

  const selectedOverrides = (monthlyData?.overrides || [])
    .filter((row) => row.emp_no === selectedEmpNo && String(row.work_date || '').startsWith(selectedMonth))
    .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
  const overrideMap = new Map(selectedOverrides.map((row) => [row.work_date, row]));
  const selectedDateSet = new Set(scheduleSelectedDates);
  const selectedDateSummary = scheduleSelectedDates.length === 0
    ? '날짜를 선택하세요'
    : scheduleSelectedDates.length === 1
      ? scheduleSelectedDates[0]
      : `${scheduleSelectedDates.length}개 날짜 선택`;
  
  const cells = getCalendarCells(selectedMonth);
  const selectedOverride = overrideDate ? overrideMap.get(overrideDate) : null;
  const hasSelectedOverride = scheduleSelectedDates.length > 0
    ? scheduleSelectedDates.some(date => overrideMap.has(date))
    : !!selectedOverride;
  const today = new Date();
  const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];

  const pickScheduleDate = (cell, override) => {
    if (!selectedEmp || cell.empty) return;
    const wasSelected = selectedDateSet.has(cell.dateStr);
    const nextDates = wasSelected
      ? scheduleSelectedDates.filter((date) => date !== cell.dateStr)
      : [...scheduleSelectedDates, cell.dateStr].sort();
    setScheduleSelectedDates(nextDates);
    if (nextDates.length === 0) {
      setOverrideTarget(null);
      setOverrideDate('');
      setOverrideNote('');
      return;
    }
    const focusDate = wasSelected ? nextDates[nextDates.length - 1] : cell.dateStr;
    const focusOverride = overrideMap.get(focusDate) || (!wasSelected ? override : null);
    setOverrideTarget({ empNo: selectedEmp.empNo, name: selectedEmp.name });
    setOverrideDate(focusDate);
    setOverrideStart(String(focusOverride?.schedule_start || currentSchedule || '08:00').substring(0, 5));
    setOverrideNote(focusOverride?.note || '');
  };

  const handleSaveSchedule = async (empNo, scheduleTime) => {
    if (!empNo || !scheduleTime) return;
    setScheduleLoading(prev => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/employees/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo, schedule: scheduleTime })
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || '기본 근무일정이 저장되었습니다.');
        setTempSchedules(prev => {
          const next = { ...prev };
          delete next[empNo];
          return next;
        });
        if (refreshData) await refreshData();
      } else {
        alert(json.error || '일정 저장에 실패했습니다.');
      }
    } catch (e) {
      alert('일정 저장 중 오류가 발생했습니다.');
    } finally {
      setScheduleLoading(prev => ({ ...prev, [empNo]: false }));
    }
  };

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    const targetDates = scheduleSelectedDates.length > 0
      ? scheduleSelectedDates
      : (overrideDate ? [overrideDate] : []);
    if (!overrideTarget?.empNo || targetDates.length === 0) {
      alert('직원과 적용 일자를 선택해주세요.');
      return;
    }
    try {
      const results = await Promise.all(targetDates.map(async (workDate) => {
        const res = await fetch('/api/employees/schedule-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empNo: overrideTarget.empNo,
            workDate,
            scheduleStart: overrideStart,
            note: overrideNote
          })
        });
        return res.json();
      }));
      const failed = results.find((json) => !json.success);
      if (!failed) {
        alert(`${targetDates.length}개 일자의 개별 근무일정이 저장되었습니다.`);
        setOverrideTarget(null);
        setOverrideDate('');
        setScheduleSelectedDates([]);
        setOverrideNote('');
        if (refreshData) await refreshData();
      } else {
        alert(failed.error || '개별 근무일정 저장에 실패했습니다.');
      }
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteOverride = async (empNo) => {
    const targetDates = scheduleSelectedDates.length > 0
      ? scheduleSelectedDates.filter(date => overrideMap.has(date))
      : (overrideDate && overrideMap.has(overrideDate) ? [overrideDate] : []);

    if (!empNo || targetDates.length === 0) return;

    const confirmMsg = targetDates.length > 1
      ? `선택한 ${targetDates.length}개 일자의 개별 근무일정 조정을 모두 삭제하시겠습니까?`
      : '해당 일자의 개별 근무일정 조정을 삭제하시겠습니까?';

    if (!confirm(confirmMsg)) return;

    try {
      const results = await Promise.all(targetDates.map(async (workDate) => {
        const res = await fetch('/api/employees/schedule-override', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empNo, workDate })
        });
        return res.json();
      }));

      const failed = results.find((json) => !json.success);
      if (!failed) {
        alert(`${targetDates.length}개 일자의 개별 근무일정 조정이 삭제되었습니다.`);
        setOverrideTarget(null);
        setOverrideDate('');
        setScheduleSelectedDates([]);
        setOverrideNote('');
        if (refreshData) await refreshData();
      } else {
        alert(failed.error || '개별 근무일정 조정 삭제에 실패했습니다.');
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="schedule-manager" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card" style={{ padding: '18px', gap: '16px' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <h3 className="card-title">직원 근무일정 캘린더</h3>
            <p className="card-subtitle">직원을 선택해 기본 근무일정과 날짜별 예외 근무시간을 관리합니다.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="icon-btn" onClick={() => {
              const list = getMonthsList();
              const idx = list.indexOf(selectedMonth);
              setSelectedMonth(list[Math.min(idx + 1, list.length - 1)] || selectedMonth);
            }} title="이전 월">
              <ChevronLeft />
            </button>
            <select className="ui-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
              {getMonthsList().map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
            <button type="button" className="icon-btn" onClick={() => {
              const list = getMonthsList();
              const idx = list.indexOf(selectedMonth);
              setSelectedMonth(list[Math.max(idx - 1, 0)] || selectedMonth);
            }} title="다음 월">
              <ChevronRight />
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 0.9fr) minmax(240px, 1fr) minmax(220px, 0.8fr) auto',
          gap: '12px',
          alignItems: 'end'
        }}>
          <div>
            <div className="form-label">직원 검색</div>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-2)' }} />
              <input
                className="form-input"
                value={empSearchQuery}
                onChange={(e) => setEmpSearchQuery(e.target.value)}
                placeholder="이름 / 사번 / 부서 검색"
                style={{ paddingLeft: 34 }}
              />
            </div>
          </div>

          <div>
            <div className="form-label">직원 선택</div>
            <select
              className="ui-select"
              value={selectedEmpNo}
              onChange={(e) => {
                setScheduleSelectedEmpNo(e.target.value);
                setOverrideTarget(null);
                setOverrideDate('');
                setScheduleSelectedDates([]);
                setOverrideNote('');
              }}
              style={{ width: '100%' }}
            >
              {filteredScheduleEmployees.length === 0 ? (
                <option value="">선택 가능한 직원이 없습니다</option>
              ) : (
                filteredScheduleEmployees.map((emp) => (
                  <option key={emp.empNo} value={emp.empNo}>{emp.name} ({emp.empNo}) · {emp.dept}</option>
                ))
              )}
            </select>
          </div>

          <div>
            <div className="form-label">기본 출근 시간</div>
            <select
              className="ui-select"
              value={currentSchedule}
              disabled={!selectedEmp}
              onChange={(e) => {
                if (!selectedEmp) return;
                setTempSchedules((prev) => ({ ...prev, [selectedEmp.empNo]: e.target.value }));
              }}
              style={{ width: '100%' }}
            >
              {SCHEDULE_TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>{time}{time === '08:00' ? ' (기본)' : ''}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="login-btn"
            disabled={!selectedEmp || !isScheduleChanged || isScheduleSaving}
            onClick={() => selectedEmp && handleSaveSchedule(selectedEmp.empNo, currentSchedule)}
            style={{ marginTop: 0, minWidth: 118, background: isScheduleChanged ? 'var(--blue)' : 'var(--bg-overlay-md)', color: isScheduleChanged ? '#fff' : 'var(--text-3)' }}
          >
            {isScheduleSaving ? <RefreshCw style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : '기본일정 저장'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(300px, 0.65fr)', gap: '16px', alignItems: 'start' }}>
        <div className="card schedule-calendar-panel" style={{ padding: '16px', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 className="card-title">{selectedMonth} 근무일정</h3>
              <p className="card-subtitle">날짜를 여러 개 선택하면 같은 근무시간을 한 번에 적용할 수 있습니다.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: 'var(--amber)' }} />개별 조정</span>
              <span className="legend-pill"><span className="calendar-widget__legend-swatch" style={{ background: 'var(--red)' }} />오늘</span>
            </div>
          </div>

          <div className="calendar-widget__weekday-grid">
            {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
              <div key={day} className={`calendar-widget__weekday ${idx === 0 ? 'is-sun' : idx === 6 ? 'is-sat' : ''}`}>{day}</div>
            ))}
          </div>

          <div className="calendar-widget__grid">
            {cells.map((cell, idx) => {
              if (cell.empty) return <div key={`empty-${idx}`} className="calendar-widget__spacer" />;
              const override = overrideMap.get(cell.dateStr);
              const isSelectedDate = selectedDateSet.has(cell.dateStr);
              const isToday = cell.dateStr === localToday;
              const isNightTeam = isNightTeamDept(selectedEmp?.dept || '');
              const showTimeBlock = !isNightTeam || Boolean(override);
              const displayStart = String(override?.schedule_start || currentSchedule).substring(0, 5);
              const displayEnd = inferNightScheduleEndTime({
                dept: selectedEmp?.dept || '',
                start: displayStart,
                end: String(override?.schedule_end || '').substring(0, 5),
              }) || '';
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={[
                    'calendar-day',
                    override ? 'has-override' : 'is-base',
                    isSelectedDate ? 'is-selected' : '',
                    isToday ? 'is-today' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => pickScheduleDate(cell, override)}
                  disabled={!selectedEmp}
                >
                  <div className="calendar-day__top">
                    <span className="calendar-day__number">{cell.dayNum}</span>
                    <div className="calendar-day__tag-stack">
                      {isToday && <span className="calendar-day__state-tag is-today-tag">오늘</span>}
                      {override && (
                        <span className="calendar-day__state-tag is-override-tag">조정</span>
                      )}
                    </div>
                  </div>
                  {showTimeBlock && (
                    <div className="calendar-day__time-block">
                      <span className="calendar-day__time-main is-in">출근 {displayStart}</span>
                      {displayEnd && (
                        <span className="calendar-day__time-main is-out">퇴근 {displayEnd}</span>
                      )}
                    </div>
                  )}
                  <div className="calendar-day__leave-list">
                    <span className="calendar-day__leave-more">{override?.note || '클릭해서 조정'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: '16px', gap: '14px' }}>
          <div>
            <h3 className="card-title">일자별 세부 조정</h3>
            <p className="card-subtitle">{selectedEmp ? `${selectedEmp.name} (${selectedEmp.dept || '-'})` : '직원을 먼저 선택해주세요.'}</p>
          </div>

          <div style={{ display: 'grid', gap: '8px' }}>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>선택 일자</span>
              <strong>{selectedDateSummary}</strong>
            </div>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>현재 기본 시간</span>
              <strong>{currentSchedule}</strong>
            </div>
            <div className="leave-panel__summary-chip" style={{ justifyContent: 'space-between' }}>
              <span>등록된 조정</span>
              <strong>{selectedOverrides.length}건</strong>
            </div>
          </div>

          <form onSubmit={handleOverrideSubmit} style={{ display: 'grid', gap: '12px' }}>
            <div>
              <div className="form-label">적용 일자</div>
              <input
                type="date"
                className="form-input"
                value={overrideDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  const nextOverride = overrideMap.get(nextDate);
                  setOverrideDate(nextDate);
                  setScheduleSelectedDates(nextDate ? [nextDate] : []);
                  if (selectedEmp) {
                    setOverrideTarget({ empNo: selectedEmp.empNo, name: selectedEmp.name });
                  }
                  setOverrideStart(String(nextOverride?.schedule_start || currentSchedule || '08:00').substring(0, 5));
                  setOverrideNote(nextOverride?.note || '');
                }}
                disabled={!selectedEmp}
                required
              />
            </div>

            <div>
              <div className="form-label">출근 기준 시각</div>
              <select
                className="ui-select"
                value={overrideStart}
                onChange={(e) => setOverrideStart(e.target.value)}
                disabled={!selectedEmp || !overrideDate}
                required
                style={{ width: '100%' }}
              >
                {SCHEDULE_TIME_OPTIONS.map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>

            <div>
              <div className="form-label">사유 / 메모</div>
              <input
                type="text"
                className="form-input"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="예: 교육 참석, 현장 일정, 조기 출근 조정"
                disabled={!selectedEmp || !overrideDate}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {hasSelectedOverride && (
                <button
                  type="button"
                  className="login-btn"
                  onClick={() => handleDeleteOverride(selectedEmpNo)}
                  style={{ marginTop: 0, background: 'rgba(208, 107, 107, 0.1)', color: 'var(--red)' }}
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                className="login-btn"
                onClick={() => {
                  setOverrideTarget(null);
                  setOverrideDate('');
                  setScheduleSelectedDates([]);
                  setOverrideNote('');
                }}
                style={{ marginTop: 0 }}
              >
                선택 해제
              </button>
              <button
                type="submit"
                className="login-btn"
                disabled={!selectedEmp || (scheduleSelectedDates.length === 0 && !overrideDate)}
                style={{ marginTop: 0, background: 'var(--blue)', color: '#fff' }}
              >
                {scheduleSelectedDates.length > 1 ? `${scheduleSelectedDates.length}개 일자 저장` : '일자별 조정 저장'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
