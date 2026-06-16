'use client';

import React from 'react';
import { getHolidayName, getLeaveMeta } from '../../../lib/leaveRules';

const getLeaveVariantClass = (meta) => {
  return String(meta?.variantClassName || '').trim();
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
  return `${h}시간 ${m}분`;
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
    return { text: `${Math.floor(diff / 60)}시간 ${diff % 60}분` };
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
  return { text: `${h}시간 ${m}분` };
}

export default function TrackerCalendarSection({
  trackerGridData,
  selectedEmployee,
  monthlyData,
  isAdmin,
  isLeader,
  setCorrectionTarget,
  setCorrectedOutTime,
}) {
  if (!selectedEmployee) {
    return (
      <div className="tracker-empty" style={{ display: 'flex', flex: 1, minHeight: '300px', alignItems: 'center', justifyContent: 'center' }}>
        사원을 선택해주세요.
      </div>
    );
  }

  if (!trackerGridData) return null;
  const { targetEmp, cells, dailyStats, overrideMap, workingDaysCount, latenessCount, totalHolidayWorkHours } = trackerGridData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="tracker-summary" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
        background: 'var(--bg-overlay-sm)', borderRadius: 'var(--r-md)',
        padding: '12px 18px', border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>조회 사원</span>
          <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-1)' }}>
            {targetEmp.name} <small style={{ fontWeight: 500, color: 'var(--text-2)' }}>({targetEmp.dept})</small>
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>기본 출근 시각: {targetEmp.scheduleTime || '08:00'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>출근 일수</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--green)' }}>
            {workingDaysCount} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>일</small>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>지각 횟수</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: latenessCount > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
            {latenessCount} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>회</small>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--purple)' }}>대체휴가 대상</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--purple)' }}>
            {Math.floor(totalHolidayWorkHours)} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>시간</small>
          </span>
        </div>
      </div>

      <div className="tracker-calendar-shell" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <div className="tracker-calendar-head" style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'var(--bg-overlay-md)', borderBottom: '1px solid var(--border)',
          textAlign: 'center', padding: '10px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-2)'
        }}>
          <div style={{ color: 'var(--red)' }}>일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div style={{ color: 'var(--blue)' }}>토</div>
        </div>

        <div className="tracker-calendar-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(92px, 1fr)', background: 'var(--bg-card)'
        }}>
          {cells.map((cell, idx) => {
            if (cell.empty) {
              return <div key={idx} className="tracker-day-cell tracker-day-cell--empty" style={{ background: 'var(--bg-overlay-sm)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />;
            }

            const stat = dailyStats[cell.dateStr];
            const hasClockIn = stat && stat.in;
            const hasClockOut = stat && (stat.out || stat.correctedOutTime);
            const holidayName = getHolidayName(cell.dateStr);
            const dayOfWeek = idx % 7;
            const dayOverride = overrideMap[cell.dateStr];
            const dateCompact = cell.dateStr.replace(/-/g, '');
            const dayLeave = (monthlyData?.leaves || []).find(l =>
              l.empNo === selectedEmployee &&
              dateCompact >= l.startDate &&
              dateCompact <= l.endDate
            );

            let dayNumColor = 'var(--text-1)';
            if (dayOfWeek === 0 || holidayName) dayNumColor = 'var(--red)';
            else if (dayOfWeek === 6) dayNumColor = 'var(--blue)';
            const isLateDay = !!stat?.isLate;

            const workHoursStr = calculateWorkHours(stat?.in, stat?.correctedOutTime || stat?.out);
            const isOTTeam = targetEmp && ['사업관리1팀', '사업관리2팀', '사업관리3팀', '사업개발팀'].includes(targetEmp.dept);
            const overtimeStr = (isOTTeam && hasClockOut) ? calculateOvertime(stat?.in, stat?.correctedOutTime || stat?.out) : null;

            return (
              <div key={idx} className="tracker-day-cell" style={{
                padding: '8px', borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)', display: 'flex',
                flexDirection: 'column', gap: '3px', position: 'relative',
                background: isLateDay
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(245, 158, 11, 0.12))'
                  : dayOfWeek === 0
                    ? 'rgba(239, 68, 68, 0.05)'
                    : dayOfWeek === 6
                      ? 'rgba(59, 130, 246, 0.04)'
                      : 'transparent',
                boxShadow: isLateDay ? 'inset 4px 0 0 rgba(245, 158, 11, 0.95), inset 0 0 0 1px rgba(245, 158, 11, 0.45)' : 'none',
                minHeight: '92px'
              }}>
                <div className="tracker-day-cell__top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="tracker-day-cell__date" style={{ fontSize: '14px', fontWeight: 700, color: dayNumColor }}>{cell.dayNum}</span>
                  {dayOverride && (
                    <span className="tracker-day-cell__override" style={{ fontSize: '10px', background: 'var(--blue)', color: '#fff', padding: '1px 3px', borderRadius: '3px' }} title={dayOverride.note}>
                      수정
                    </span>
                  )}
                  {holidayName && (
                    <span className="tracker-day-cell__holiday" style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 700 }} title={holidayName}>
                      {holidayName}
                    </span>
                  )}
                </div>

                <div className="tracker-day-cell__body" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                  {dayLeave && (() => {
                    const leaveMeta = getLeaveMeta(dayLeave, stat);
                    return (
                      <span
                        className={`tracker-day-cell__leave ${getLeaveVariantClass(leaveMeta)}`.trim()}
                        style={{
                          fontSize: '11px',
                          color: leaveMeta.color,
                          background: leaveMeta.bg,
                          border: '1px solid ' + leaveMeta.border,
                          padding: '2px 6px',
                          borderRadius: '999px',
                          width: 'fit-content',
                          whiteSpace: 'nowrap',
                          fontWeight: 700,
                          lineHeight: 1.2
                        }}
                        title={dayLeave.leaveName}
                      >
                        {leaveMeta.label}
                      </span>
                    );
                  })()}

                  {hasClockIn && (
                    <div className="tracker-day-cell__metric tracker-day-cell__in" style={{ fontSize: '12.5px', color: isLateDay ? 'var(--amber)' : 'var(--green)', fontWeight: 700 }}>
                      <span className="tracker-day-cell__metric-label">출근</span>
                      <span className="tracker-day-cell__metric-value">{stat.in}</span>
                    </div>
                  )}

                  {hasClockOut && (
                    <div className="tracker-day-cell__metric tracker-day-cell__out" style={{ fontSize: '12.5px', color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="tracker-day-cell__metric-main">
                        <span className="tracker-day-cell__metric-label">퇴근</span>
                        <span className="tracker-day-cell__metric-value">
                          {stat.correctedOutTime ? (
                            <span style={{ color: 'var(--blue)' }} title={'원래 시간: ' + stat.out + ' (사유: ' + stat.correctionReason + ')'}>
                              {stat.correctedOutTime}*
                            </span>
                          ) : stat.out}
                        </span>
                      </span>

                      {(isAdmin || isLeader) && (
                        <button
                          onClick={() => {
                            setCorrectionTarget({ empNo: selectedEmployee, workDate: cell.dateStr, empName: targetEmp.name, originalOut: stat.out });
                            setCorrectedOutTime(stat.correctedOutTime || stat.out || '18:00');
                          }}
                          className="tracker-day-cell__edit"
                          style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '10.5px', cursor: 'pointer', padding: '1px 3px' }}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  )}

                  {workHoursStr && (
                    <div className="tracker-day-cell__metric tracker-day-cell__work" style={{ fontSize: '11.5px', color: 'var(--text-2)', fontWeight: 500, marginTop: '2px' }}>
                      <span className="tracker-day-cell__metric-label">근무</span>
                      <span className="tracker-day-cell__metric-value">{workHoursStr}</span>
                    </div>
                  )}

                  {overtimeStr && (
                    <div className="tracker-day-cell__metric tracker-day-cell__overtime" style={{ fontSize: '11px', color: 'var(--amber)', background: 'rgba(245, 158, 11, 0.1)', padding: '1px 3px', borderRadius: '3px', width: 'fit-content', marginTop: '2px', fontWeight: 600 }}>
                      <span className="tracker-day-cell__metric-label">초과</span>
                      <span className="tracker-day-cell__metric-value">{overtimeStr.text}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
