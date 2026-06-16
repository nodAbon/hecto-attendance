'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { isAdminRole, isExecutivePosition, isLeaderPosition } from '@/lib/roleUtils';

const TARGET_DEPTS = ['사업개발팀', '사업관리1팀', '사업관리2팀', '사업관리3팀'];
const WEEK_HOURS_MINUTES = 40 * 60;

const normalizeDept = (value = '') => String(value || '').trim().replace(/\s+/g, '');

const formatDuration = (minutes = 0) => {
  const safeMinutes = Math.abs(Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}시간 ${String(mins).padStart(2, '0')}분`;
};

const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '-';
  return `${startDate} ~ ${endDate}`;
};

const getTimePart = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const timeText = text.includes(' ') ? text.split(' ')[1] : text.includes('T') ? text.split('T')[1] : text;
  return timeText.substring(0, 5);
};

const getLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00+09:00`);

const toDateOnly = (date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
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

export default function OvertimeTab({
  isAdmin,
  visibleMonthlyEmployees,
  monthlyData,
  myPosition,
  myDept,
  refreshData,
}) {
  const [roundsData, setRoundsData] = useState({});
  const [savingEmp, setSavingEmp] = useState(null);
  const [saveSuccessEmp, setSaveSuccessEmp] = useState(null);
  const [saveErrorEmp, setSaveErrorEmp] = useState(null);
  const [rangeData, setRangeData] = useState({
    logs: [],
    leaves: [],
    corrections: [],
  });
  const [rangeLoading, setRangeLoading] = useState(false);

  const isLeader = isLeaderPosition(myPosition);
  const isExecutive = isExecutivePosition(myPosition);
  const isAuthorized = isAdmin || isLeader || isExecutive || isAdminRole({ position: myPosition, isAdmin });
  const isTeamLeaderOnly = isLeader && !isExecutive && !isAdmin;

  useEffect(() => {
    if (!monthlyData?.overtimeRounds) return;
    const map = {};
    monthlyData.overtimeRounds.forEach((row) => {
      map[row.emp_no] = {
        roundName: row.round_name || '1차',
        startDate: row.start_date || '',
        endDate: row.end_date || '',
      };
    });
    setRoundsData(map);
  }, [monthlyData]);

  const filteredEmployees = useMemo(() => {
    const normalizedTargets = TARGET_DEPTS.map(normalizeDept);
    return (visibleMonthlyEmployees || []).filter((emp) => {
      const dept = normalizeDept(emp.dept);
      const isTarget = normalizedTargets.includes(dept);
      if (!isTarget) return false;
      if (isTeamLeaderOnly) return String(emp.dept || '').trim() === String(myDept || '').trim();
      return true;
    });
  }, [visibleMonthlyEmployees, isTeamLeaderOnly, myDept]);

  const periodMonths = useMemo(() => {
    const dates = Object.values(roundsData)
      .flatMap((row) => [row?.startDate, row?.endDate])
      .filter(Boolean)
      .sort();

    if (dates.length === 0) return [];

    const start = getLocalDate(dates[0]);
    const end = getLocalDate(dates[dates.length - 1]);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= endCursor) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }, [roundsData]);

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
      if (!periodMonths.length) {
        setRangeData({ logs: [], leaves: [], corrections: [] });
        return;
      }

      setRangeLoading(true);
      try {
        const responses = await Promise.all(
          periodMonths.map(async (month) => {
            const res = await fetch(`/api/attendance?month=${month}`);
            const json = await res.json();
            return json?.success ? json : null;
          })
        );

        if (cancelled) return;

        const datasets = [monthlyData, ...responses.filter(Boolean)];
        const mergedLogs = mergeUnique(
          datasets.flatMap((data) => data?.allLogs || []),
          (log) => String(log?.id || `${log?.empNo || ''}_${log?.logTime || ''}_${log?.gateName || ''}_${log?.eventType || ''}`)
        );
        const mergedLeaves = mergeUnique(
          datasets.flatMap((data) => data?.leaves || []),
          (leave) => String(
            leave?.empNo || ''
          ) + '_' + String(leave?.startDate || '') + '_' + String(leave?.endDate || '') + '_' + String(leave?.leaveCode || '') + '_' + String(leave?.leaveName || '')
        );
        const mergedCorrections = mergeUnique(
          datasets.flatMap((data) => data?.corrections || []),
          (corr) => `${corr?.emp_no || ''}_${corr?.work_date || ''}`
        );

        setRangeData({
          logs: mergedLogs,
          leaves: mergedLeaves,
          corrections: mergedCorrections,
        });
      } catch (err) {
        console.error('[OvertimeTab] range data load failed:', err);
        if (!cancelled) {
          setRangeData({ logs: monthlyData?.allLogs || [], leaves: monthlyData?.leaves || [], corrections: monthlyData?.corrections || [] });
        }
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    };

    loadRangeData();
    return () => {
      cancelled = true;
    };
  }, [monthlyData, periodMonths]);

  const handleSave = async (empNo, roundName, startDate, endDate, employeeDept) => {
    if (!empNo || !roundName || !startDate || !endDate) return;
    setSavingEmp(empNo);
    setSaveSuccessEmp(null);
    setSaveErrorEmp(null);
    try {
      const res = await fetch('/api/attendance/overtime-rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo, roundName, startDate, endDate, employeeDept }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccessEmp(empNo);
        if (refreshData) await refreshData();
        setTimeout(() => setSaveSuccessEmp(null), 1800);
      } else {
        setSaveErrorEmp(empNo);
        alert(json.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error(err);
      setSaveErrorEmp(empNo);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingEmp(null);
    }
  };

  const getOvertimeStats = (empNo, startDate, endDate) => {
    if (!startDate || !endDate || !monthlyData) {
      return {
        averageWeeklyMinutes: 0,
        residualMinutes: 0,
      };
    }

    const logs = rangeData.logs || monthlyData.allLogs || [];
    const leaves = rangeData.leaves || monthlyData.leaves || [];
    const corrections = rangeData.corrections || monthlyData.corrections || [];
    const correctionMap = new Map();

    corrections.forEach((c) => {
      correctionMap.set(`${c.emp_no}_${c.work_date}`, c.corrected_out_time);
    });

    const dailyLogs = {};
    logs
      .filter((log) => log.empNo === empNo && log.workDate >= startDate && log.workDate <= endDate)
      .forEach((log) => {
        if (!dailyLogs[log.workDate]) dailyLogs[log.workDate] = [];
        dailyLogs[log.workDate].push(log);
      });

    const dayTotals = new Map();
    const start = getLocalDate(startDate);
    const end = getLocalDate(endDate);

    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const dateStr = toDateOnly(day);
      const dateCompact = dateStr.replace(/-/g, '');
      const leave = leaves.find((row) => row.empNo === empNo && dateCompact >= row.startDate && dateCompact <= row.endDate);
      const leaveWorkedMinutes = getLeaveWorkedMinutes(leave);

      const dayLogs = (dailyLogs[dateStr] || []).slice().sort((a, b) => {
        const orderA = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : 0;
        const orderB = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : 0;
        return orderA - orderB || String(a.logTime || '').localeCompare(String(b.logTime || ''));
      });

      let dayWorkMinutes = 0;
      if (dayLogs.length > 0) {
        const firstLog = dayLogs[0];
        const correctedOut = correctionMap.get(`${empNo}_${dateStr}`);
        const inTime = getTimePart(firstLog.logTime);
        let outTime = null;

        if (correctedOut) {
          outTime = new Date(correctedOut).toLocaleTimeString('ko-KR', { hour12: false }).substring(0, 5);
        } else {
          const lastLog = dayLogs.length >= 2 ? dayLogs[dayLogs.length - 1] : null;
          if (lastLog && lastLog.logTime !== firstLog.logTime) {
            outTime = getTimePart(lastLog.logTime);
          }
        }

        if (inTime && outTime) {
          const [inH, inM] = inTime.split(':').map(Number);
          const [outH, outM] = outTime.split(':').map(Number);
          let diff = (outH * 60 + outM) - (inH * 60 + inM);
          if (diff < 0) diff += 24 * 60;
          dayWorkMinutes = diff >= 300 ? diff - 60 : diff;
        }
      }

      const dayTotalMinutes = Math.min(24 * 60, dayWorkMinutes + leaveWorkedMinutes);
      dayTotals.set(dateStr, dayTotalMinutes);
    }

    const weeklyTotals = [];
    for (let periodStart = new Date(start); periodStart <= end; periodStart.setDate(periodStart.getDate() + 7)) {
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);

      let weekMinutes = 0;
      for (let day = new Date(periodStart); day <= periodEnd && day <= end; day.setDate(day.getDate() + 1)) {
        const dateStr = toDateOnly(day);
        weekMinutes += Number(dayTotals.get(dateStr) || 0);
      }
      weeklyTotals.push(weekMinutes);
    }

    const totalWorkMinutes = weeklyTotals.reduce((sum, minutes) => sum + minutes, 0);
    const averageWeeklyMinutes = weeklyTotals.length > 0
      ? Math.round(totalWorkMinutes / weeklyTotals.length)
      : 0;
    const residualMinutes = averageWeeklyMinutes - WEEK_HOURS_MINUTES;

    return {
      averageWeeklyMinutes,
      residualMinutes,
    };
  };

  const formatResidual = (minutes) => {
    if (!minutes) {
      return { text: '0시간 00분', tone: 'var(--text-2)' };
    }
    return {
      text: `${minutes > 0 ? '초과' : '부족'} ${formatDuration(minutes)}`,
      tone: minutes > 0 ? 'var(--amber)' : 'var(--blue)',
    };
  };

  if (!isAuthorized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', flexDirection: 'column', gap: '12px' }}>
        <AlertCircle style={{ width: 40, height: 40, color: 'var(--red)' }} />
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-1)' }}>접근 권한이 없습니다.</span>
        <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>초과근무 관리 메뉴는 지정 직급 이상만 조회할 수 있습니다.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 className="card-title">초과근무 관리</h3>
            <p className="card-subtitle">
              {isTeamLeaderOnly ? `${myDept} 소속 초과근무 대상자 현황` : '사업개발팀 및 사업관리 1~3팀 초과근무 관리'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ padding: '10px 14px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)', minWidth: '160px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>표시 기준</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>주 40시간</div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: '14px', border: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.08)', minWidth: '160px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>평균 산출</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>주간 평균 근무시간</div>
            </div>
            {rangeLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)', minWidth: '160px' }}>
                <RefreshCw style={{ width: 14, height: 14, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>기간 전체 로그 불러오는 중</div>
              </div>
            )}
          </div>
        </div>

        <div className="table-wrapper" style={{ overflowX: 'auto', padding: '10px 0 4px' }}>
          <table className="table" style={{ borderCollapse: 'separate', borderSpacing: '0 10px', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-2)', width: '96px' }}>차수</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: 'var(--text-2)', width: '220px' }}>직원</th>
                <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-2)' }}>기간</th>
                <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-2)', width: '170px' }}>주간 평균 근무시간</th>
                <th style={{ textAlign: 'center', padding: '10px 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-2)', width: '170px' }}>잔여 조정</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '56px 24px' }}>
                    조회 가능한 초과근무 대상 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const empRound = roundsData[emp.empNo] || {
                    roundName: '1차',
                    startDate: '2026-04-01',
                    endDate: '2026-06-26',
                  };
                  const stats = getOvertimeStats(emp.empNo, empRound.startDate, empRound.endDate);
                  const residual = formatResidual(stats.residualMinutes);
                  const averageText = formatDuration(stats.averageWeeklyMinutes);

                  return (
                    <tr key={emp.empNo}>
                      <td style={{ padding: '0 8px 0 0', verticalAlign: 'middle' }}>
                        <select
                          value={empRound.roundName}
                          onChange={(e) => {
                            const newRound = e.target.value;
                            setRoundsData((prev) => ({
                              ...prev,
                              [emp.empNo]: { ...empRound, roundName: newRound },
                            }));
                            handleSave(emp.empNo, newRound, empRound.startDate, empRound.endDate, emp.dept);
                          }}
                          style={{
                            width: '88px',
                            height: '46px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-1)',
                            padding: '6px 8px',
                            borderRadius: '12px',
                            fontSize: '13px',
                            fontWeight: 700,
                            outline: 'none',
                            cursor: 'pointer',
                            textAlign: 'center',
                            marginLeft: '6px',
                          }}
                        >
                          <option value="1차">1차</option>
                          <option value="2차">2차</option>
                          <option value="3차">3차</option>
                          <option value="4차">4차</option>
                          <option value="5차">5차</option>
                        </select>
                      </td>

                      <td style={{ padding: '0 12px 0 0', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start', padding: '12px 0' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-1)' }}>{emp.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{emp.dept}</span>
                        </div>
                      </td>

                      <td style={{ padding: '0 8px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 14px',
                            gap: '10px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-overlay-sm)',
                          }}>
                            <span style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: 'var(--text-2)',
                              background: 'var(--bg-overlay-md)',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              minWidth: '52px',
                              textAlign: 'center',
                            }}>시작</span>
                            <input
                              type="date"
                              value={empRound.startDate}
                              onChange={(e) => {
                                const newStart = e.target.value;
                                setRoundsData((prev) => ({
                                  ...prev,
                                  [emp.empNo]: { ...empRound, startDate: newStart },
                                }));
                                handleSave(emp.empNo, empRound.roundName, newStart, empRound.endDate, emp.dept);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-1)',
                                fontSize: '13px',
                                outline: 'none',
                                cursor: 'pointer',
                                width: '140px',
                              }}
                            />
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 14px',
                            gap: '10px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-overlay-sm)',
                          }}>
                            <span style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: 'var(--text-2)',
                              background: 'var(--bg-overlay-md)',
                              padding: '3px 9px',
                              borderRadius: '999px',
                              minWidth: '52px',
                              textAlign: 'center',
                            }}>종료</span>
                            <input
                              type="date"
                              value={empRound.endDate}
                              onChange={(e) => {
                                const newEnd = e.target.value;
                                setRoundsData((prev) => ({
                                  ...prev,
                                  [emp.empNo]: { ...empRound, endDate: newEnd },
                                }));
                                handleSave(emp.empNo, empRound.roundName, empRound.startDate, newEnd, emp.dept);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-1)',
                                fontSize: '13px',
                                outline: 'none',
                                cursor: 'pointer',
                                width: '140px',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '0 8px', verticalAlign: 'middle' }}>
                        <div style={{
                          minHeight: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-overlay-sm)',
                          color: 'var(--text-1)',
                          fontSize: '14px',
                          fontWeight: 700,
                        }}>
                          {averageText}
                        </div>
                      </td>

                      <td style={{ padding: '0 8px', verticalAlign: 'middle' }}>
                        <div style={{
                          minHeight: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          border: '1px solid var(--border)',
                          background: 'rgba(59, 130, 246, 0.06)',
                          color: residual.tone,
                          fontSize: '14px',
                          fontWeight: 700,
                          gap: '8px',
                        }}>
                          <span>{residual.text}</span>
                          {savingEmp === emp.empNo && (
                            <RefreshCw style={{ width: 12, height: 12, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
                          )}
                          {saveSuccessEmp === emp.empNo && (
                            <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--green)' }} />
                          )}
                          {saveErrorEmp === emp.empNo && (
                            <AlertCircle style={{ width: 12, height: 12, color: 'var(--red)' }} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
