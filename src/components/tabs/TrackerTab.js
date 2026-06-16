'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Search, RefreshCw } from 'lucide-react';
import { getCalendarCells } from '../DashboardCalendarWidget';
import { getHolidayName, getLeaveMeta, getLeaveDisplaySummary, isDateHoliday } from '../../lib/leaveRules';
import TrackerCalendarSection from './tracker/TrackerCalendarSection';

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

function calculateWorkHours(inTime, outTime) {
  if (!inTime || !outTime || outTime === '-') return null;
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  if (diffMinutes < 0) return null;
  const h = Math.floor(diffMinutes / 60);
  const m = diffMinutes % 60;
  return h + '시간 ' + m + '분';
}

function calculateOvertime(inTimeOrOutTime, outTimeMaybe, threshold = '19:00') {
  const hasInTime = typeof outTimeMaybe === 'string';
  const inTime = hasInTime ? inTimeOrOutTime : null;
  const outTime = hasInTime ? outTimeMaybe : inTimeOrOutTime;

  if (!outTime || outTime === '-') return null;

  const [outH, outM] = outTime.split(':').map(Number);
  const [tH, tM] = threshold.split(':').map(Number);
  const outTotal = outH * 60 + outM;
  const tTotal = tH * 60 + tM;

  if (!hasInTime) {
    if (outTotal <= tTotal) return null;
    const diff = outTotal - tTotal;
    if (diff <= 0) return null;
    return {
      h: Math.floor(diff / 60),
      m: diff % 60,
      text: Math.floor(diff / 60) + '시간 ' + (diff % 60) + '분',
    };
  }

  if (!inTime || inTime === '-') return null;
  const [inH, inM] = inTime.split(':').map(Number);
  const inTotal = inH * 60 + inM;

  let diff = null;
  if (outTotal < inTotal) {
    diff = (outTotal + 24 * 60) - tTotal;
  } else if (outTotal > tTotal) {
    diff = outTotal - tTotal;
  }

  if (!diff || diff <= 0) return null;

  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return { h, m, text: h + '시간 ' + m + '분' };
}

export default function TrackerTab({
  activeTab, // 'TRACKER' or 'MY_PORTAL'
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
  const [trackerSearchQuery, setTrackerSearchQuery] = useState('');
  const [showTrackerCombobox, setShowTrackerCombobox] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);

  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctedOutTime, setCorrectedOutTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // Sync tracker search query with selectedEmployee prop
  useEffect(() => {
    const allEmps = visibleTrackerEmployees || [];
    const emp = allEmps.find(e => e.empNo === selectedEmployee);
    if (emp) {
      setTrackerSearchQuery(emp.name);
    } else {
      setTrackerSearchQuery('');
    }
  }, [selectedEmployee, visibleTrackerEmployees]);

  // Handle manual checkin/checkout click
  const handleManualCheck = async (type) => {
    setIsCheckinLoading(true);
    setActionMessage(null);
    try {
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localDate = new Date(today.getTime() - (offset * 60 * 1000));
      const workDate = localDate.toISOString().split('T')[0];

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
        if (refreshData) await refreshData();
      } else {
        setActionMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: '기록 처리 중 오류가 발생했습니다.' });
    } finally {
      setIsCheckinLoading(false);
    }
  };

  // Handle admin/leader correction submit
  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/attendance/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: correctionTarget.empNo,
          workDate: correctionTarget.workDate,
          correctedOutTime,
          reason: correctionReason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('퇴근 시간이 정상적으로 수정되었습니다.');
        setCorrectionTarget(null);
        setCorrectionReason('');
        if (refreshData) await refreshData();
      } else {
        alert(json.error);
      }
    } catch {
      alert('수정 중 서버 오류가 발생했습니다.');
    }
  };

  // Memoized calculations for selected employee tracker grid
  const trackerGridData = useMemo(() => {
    if (!selectedEmployee || monthlyLoading) return null;
    const allEmps = visibleTrackerEmployees || [];
    const targetEmp = allEmps.find(e => e.empNo === selectedEmployee);
    if (!targetEmp) return null;

    const logs = monthlyData?.allLogs || [];
    const cells = getCalendarCells(selectedMonth);

    // Map daily stats
    const dailyStats = {}; // {YYYY-MM-DD: {in: 'HH:MM', out: 'HH:MM', isLate: boolean, correctedOutTime, correctionReason}}
    
    // Map schedule overrides for target employee
    const overrides = (monthlyData?.overrides || []).filter(o => o.emp_no === selectedEmployee);
    const overrideMap = {};
    overrides.forEach(o => {
      overrideMap[o.work_date] = o;
    });

    // Group by adjusted workDate and exclude ignored records
    const empDayLogs = {};
    logs
      .filter(log => log.empNo === selectedEmployee)
      .filter(log => !String(log.adjustedRole || log.eventType || '').includes('臾댁떆'))
      .forEach(log => {
        const dateStr = log.workDate || log.logTime.split(' ')[0];
        const timeStr = getAttendanceTimePart(log.logTime);
        if (!empDayLogs[dateStr]) empDayLogs[dateStr] = [];
        empDayLogs[dateStr].push({
          timeStr,
          workOrder: Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null,
          log,
        });
      });

    Object.entries(empDayLogs).forEach(([dateStr, entries]) => {
      if (!dailyStats[dateStr]) {
        dailyStats[dateStr] = { in: null, out: null, isLate: false, correctedOutTime: null, correctionReason: null };
      }
      const sorted = entries.sort((a, b) => {
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
      dailyStats[dateStr].isLate = first.log.isLate || false;

      if (sorted.length > 1 && last.timeStr !== first.timeStr) {
        dailyStats[dateStr].out = last.timeStr;
        if (last.log.correctedOutTime) {
          dailyStats[dateStr].correctedOutTime = getAttendanceTimePart(last.log.correctedOutTime);
          dailyStats[dateStr].correctionReason = last.log.correctionReason;
        }
      }
    });

    // Calculate summaries
    let workingDaysCount = 0;
    let latenessCount = 0;
    let totalHolidayWorkHours = 0;
    
    Object.entries(dailyStats).forEach(([dt, stat]) => {
      if (stat.in) workingDaysCount++;
      if (stat.isLate) latenessCount++;
      if (isDateHoliday(dt) && stat.in && stat.out) {
        const workHours = calculateWorkHours(stat.in, stat.out);
        if (workHours) {
          const h = parseFloat(workHours.split('시간')[0]);
          totalHolidayWorkHours += h;
        }
      }
    });

    return {
      targetEmp,
      cells,
      dailyStats,
      overrideMap,
      workingDaysCount,
      latenessCount,
      totalHolidayWorkHours,
    };
  }, [selectedEmployee, monthlyLoading, monthlyData, selectedMonth, visibleTrackerEmployees]);

  return (
    <div className="tracker-surface">
      
      {/* If MY_PORTAL (Regular Employee portal), show Clock-in/out manual buttons first */}
      {activeTab === 'MY_PORTAL' && (
        <div className="tracker-portal-grid" style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '20px'
        }}>
          {/* Manual checkin panel */}
          <div className="card tracker-panel tracker-panel--accent" style={{
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock style={{ width: 18, height: 18, color: 'var(--blue)' }} />
                <span>오늘 출퇴근 기록</span>
              </h3>
              <p className="card-subtitle">모바일과 PC에서 간편하게 출퇴근을 기록하고 비고를 남깁니다.</p>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
              {actionMessage && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600,
                  background: actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: actionMessage.type === 'success' ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                  color: actionMessage.type === 'success' ? '#a7f3d0' : '#fca5a5'
                }}>
                  {actionMessage.text}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>비고 및 특이사항 입력</label>
                <input 
                  type="text"
                  placeholder="예: 외근 출발, 지각 사유, 특이사항을 입력"
                  value={manualNote}
                  onChange={e => setManualNote(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <button 
                  onClick={() => handleManualCheck('출근')}
                  disabled={isCheckinLoading}
                  className="login-btn"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', marginTop: 0 }}
                >
                  출근 처리
                </button>
                <button 
                  onClick={() => handleManualCheck('퇴근')}
                  disabled={isCheckinLoading}
                  className="login-btn"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', marginTop: 0 }}
                >
                  퇴근 처리
                </button>
              </div>
            </div>
          </div>

          {/* Today's status widget for self */}
          <div className="card tracker-panel tracker-panel--soft">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 className="card-title">오늘 상태 확인</h3>
              <p className="card-subtitle">오늘의 출입 기록 현황을 확인합니다.</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}>
              {(() => {
                const today = new Date();
                const offset = today.getTimezoneOffset();
                const localDate = new Date(today.getTime() - (offset * 60 * 1000));
                const todayStr = localDate.toISOString().split('T')[0];

                const myTodayLogs = (monthlyData?.allLogs || []).filter(l => l.empNo === myEmpNo && l.logTime.startsWith(todayStr));
                if (myTodayLogs.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px' }}>
                      오늘의 출입 기록이 아직 없습니다.
                    </div>
                  );
                }

                return myTodayLogs.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-overlay-sm)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={'badge ' + (log.eventType === '출근' ? 'green' : 'gray')}>
                        {log.eventType}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>
                        {log.logTime.split(' ')[1]}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                      기록: {log.gateName}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Standard Calendar Tracker Detail */}
      <div className="card tracker-panel tracker-panel--main">
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 className="card-title">개인 근무 트래커</h3>
            <p className="card-subtitle">일별 출퇴근, 조정 근무시간, 초과 근무 현황을 확인합니다.</p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Employee combobox search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>대상 직원</span>
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  placeholder="이름 검색..."
                  value={trackerSearchQuery}
                  onFocus={() => setShowTrackerCombobox(true)}
                  onChange={e => {
                    setTrackerSearchQuery(e.target.value);
                    setShowTrackerCombobox(true);
                  }}
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)', padding: '6px 12px 6px 30px', fontSize: '14px',
                    color: 'var(--text-1)', outline: 'none'
                  }}
                />
                <Search style={{ position: 'absolute', left: '10px', top: '9px', width: '13px', height: '13px', color: 'var(--text-2)' }} />
                {showTrackerCombobox && (
                  <div style={{
                    position: 'absolute', top: '38px', left: 0, right: 0, background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 100,
                    maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px rgba(0,0,0,0.5)'
                  }}>
                    {visibleTrackerEmployees
                      .filter(e => (e.name || '').includes(trackerSearchQuery))
                      .map(e => (
                        <div
                          key={e.empNo}
                          onClick={() => {
                            setSelectedEmployee(e.empNo);
                            setTrackerSearchQuery(e.name);
                            setShowTrackerCombobox(false);
                          }}
                          style={{
                            padding: '8px 12px', cursor: 'pointer', fontSize: '14px',
                            background: selectedEmployee === e.empNo ? 'rgba(79, 142, 247, 0.12)' : 'transparent',
                            color: 'var(--text-1)'
                          }}
                        >
                          {e.name} ({e.dept})
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Month Select */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>조회 월</span>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  color: 'var(--text-1)', padding: '6px 14px', borderRadius: 'var(--r-sm)',
                  fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                }}
              >
                {getMonthsList().map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Correction Overlay Panel */}
        {correctionTarget && (
          <div className="tracker-correction" style={{ background: 'rgba(79, 142, 247, 0.08)', border: '1px solid var(--blue)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            <form onSubmit={handleCorrectionSubmit} style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.85fr 1.2fr auto', gap: '12px', alignItems: 'stretch' }}>
              <div className="tracker-correction__dateblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '210px' }}>
                <span className="tracker-correction__label" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>수정 대상 일자</span>
                <span className="tracker-correction__value" style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{correctionTarget.workDate}</span>
                <span className="tracker-correction__sub" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>대상 {correctionTarget.empName}</span>
              </div>
              <div className="tracker-correction__timeblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="tracker-correction__label" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>퇴근 시간 (수정)</span>
                <input 
                  type="time" 
                  value={correctedOutTime}
                  onChange={e => setCorrectedOutTime(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff' }}
                  required
                />
              </div>
              <div className="tracker-correction__reasonblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <span style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>사유</span>
                <input 
                  type="text" 
                  placeholder="예: 초과근무 반영, 퇴근 입력 누락 보정"
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff', width: '100%' }}
                  required
                />
              </div>
              <div className="tracker-correction__actions" style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                <button type="submit" className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--blue)' }}>변경 확인</button>
                <button type="button" onClick={() => setCorrectionTarget(null)} className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--bg-overlay-md)' }}>취소</button>
              </div>
            </form>
          </div>
        )}

        {monthlyLoading ? (
          <div className="tracker-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: '10px' }}>
            <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>근태 데이터를 불러오는 중...</span>
          </div>
        ) : (
          <TrackerCalendarSection
            trackerGridData={trackerGridData}
            selectedEmployee={selectedEmployee}
            monthlyData={monthlyData}
            isAdmin={isAdmin}
            isLeader={isLeader}
            setCorrectionTarget={setCorrectionTarget}
            setCorrectedOutTime={setCorrectedOutTime}
          />
        )}
      </div>

    </div>
  );
}
