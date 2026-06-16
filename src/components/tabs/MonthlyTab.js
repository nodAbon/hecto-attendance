'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { getHolidayName, getLeaveMeta } from '../../lib/leaveRules';

const getLeaveVariantClass = (meta) => {
  return String(meta?.variantClassName || '').trim();
};

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

export default function MonthlyTab({
  monthlyLoading,
  selectedMonth,
  setSelectedMonth,
  visibleMonthlyEmployees,
  monthlyData,
}) {
  const days = getDaysInMonth(selectedMonth);
  const allEmps = visibleMonthlyEmployees;
  const logs = monthlyData?.allLogs || [];

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

  return (
    <div className="card">
      <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 className="card-title">월간 출근 현황표</h3>
          <p className="card-subtitle">선택 월의 일자별 임직원 출퇴근 상세 데이터 그리드</p>
        </div>

        {/* Month selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>선택 월</span>
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

      {monthlyLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: '10px' }}>
          <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>월간 보고서를 구성 중입니다...</span>
        </div>
      ) : (
        <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 11, minWidth: '150px' }}>임직원</th>
                {days.map(d => {
                  const holidayName = getHolidayName(d.dateStr);
                  const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                  return (
                    <th key={d.dateStr} style={{ 
                      minWidth: '110px', textAlign: 'center',
                      color: d.dayOfWeek === '일' || !!holidayName ? 'var(--red)' : d.dayOfWeek === '토' ? 'var(--blue)' : 'var(--text-1)',
                      background: isWE ? 'rgba(239, 68, 68, 0.04)' : 'transparent'
                    }}>
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
                  <td style={{ 
                    position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 5,
                    fontWeight: 700, borderRight: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.2 }}>
                      <span style={{ color: 'var(--text-1)' }}>{emp.name}</span>
                      <small style={{ color: 'var(--text-2)', fontWeight: 500 }}>({emp.dept})</small>
                    </div>
                  </td>
                  {days.map(d => {
                    const dayStats = gridData[emp.empNo]?.[d.dateStr];
                    const holidayName = getHolidayName(d.dateStr);
                    const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                    
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
                      : '-';

                    return (
                      <td key={d.dateStr} style={{ 
                        textAlign: 'center', fontSize: '12px', whiteSpace: 'pre-line',
                        background: dayStats?.isLate
                          ? 'rgba(245, 158, 11, 0.12)'
                          : isWE
                            ? 'rgba(239, 68, 68, 0.04)'
                            : 'transparent',
                        color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)',
                        fontWeight: leave ? 700 : 500
                      }}>
                        {leave ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <span
                              className={`calendar-detail__name-chip ${getLeaveVariantClass(leaveMeta)}`.trim()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                maxWidth: '100%',
                                padding: '2px 7px',
                                borderRadius: '999px',
                                border: '1px solid ' + leaveMeta.border,
                                background: leaveMeta.bg,
                                color: leaveMeta.color,
                                whiteSpace: 'nowrap',
                                fontWeight: 700,
                                lineHeight: 1.2
                              }}
                            >
                              {leaveDetail}
                            </span>
                            {timeText !== '-' && (
                              <span style={{ fontSize: '12px', color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)', fontWeight: 600, lineHeight: 1.25, whiteSpace: 'pre-line' }}>
                                {timeText}
                              </span>
                            )}
                          </div>
                        ) : (
                          timeText
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
    </div>
  );
}
