'use client';

import React, { useState, useMemo } from 'react';
import { Users, UserCheck, Clock, Calendar, Search } from 'lucide-react';
import DashboardCalendarWidget from '../DashboardCalendarWidget';
import { getLeaveMeta, getStatusBadgeMeta } from '../../lib/leaveRules';

// Donut Chart Helpers
function toXY(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({ segments }) {
  const centerX = 80, centerY = 80, outerR = 66, innerR = 46, gap = 4;
  const total = segments.reduce((s, d) => s + (d.value || 0), 0);

  if (total === 0) {
    return (
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx={centerX} cy={centerY} r={(outerR + innerR) / 2} fill="none"
          style={{ stroke: 'var(--bg-overlay-md)' }} strokeWidth={outerR - innerR} />
      </svg>
    );
  }

  const nonZero = segments.filter(s => (s.value || 0) > 0);
  const gapTotal = nonZero.length * gap;
  const arcs = nonZero.reduce((acc, seg) => {
    const sweep = (seg.value / total) * (360 - gapTotal);
    const start = acc.length === 0 ? 0 : acc[acc.length - 1].end + gap;
    const end = start + sweep;
    acc.push({ ...seg, start, end });
    return acc;
  }, []);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx={centerX} cy={centerY} r={(outerR + innerR) / 2} fill="none"
        style={{ stroke: 'var(--bg-overlay-md)' }} strokeWidth={outerR - innerR} />
      {arcs.map((arc, i) => {
        const sweep = arc.end - arc.start;
        const os = toXY(centerX, centerY, outerR, arc.start);
        const oe = toXY(centerX, centerY, outerR, arc.end);
        const ie = toXY(centerX, centerY, innerR, arc.end);
        const is_ = toXY(centerX, centerY, innerR, arc.start);
        const lg = sweep > 180 ? 1 : 0;
        const d = [
          'M ' + os.x.toFixed(2) + ' ' + os.y.toFixed(2),
          'A ' + outerR + ' ' + outerR + ' 0 ' + lg + ' 1 ' + oe.x.toFixed(2) + ' ' + oe.y.toFixed(2),
          'L ' + ie.x.toFixed(2) + ' ' + ie.y.toFixed(2),
          'A ' + innerR + ' ' + innerR + ' 0 ' + lg + ' 0 ' + is_.x.toFixed(2) + ' ' + is_.y.toFixed(2),
          'Z',
        ].join(' ');
        return <path key={i} d={d} fill={arc.color} />;
      })}
    </svg>
  );
}

// Dept utilities
const normalizeDeptName = (value) => String(value ?? '').trim();

const matchesDeptFilter = (dept, filter) => {
  const normalizedFilter = normalizeDeptName(filter);
  return !normalizedFilter || normalizedFilter === 'ALL' || normalizeDeptName(dept) === normalizedFilter;
};

export default function DashboardTab({
  data,
  viewDeptFilter,
  isAdmin,
  isLeader,
  myDept,
  myEmpNo,
  calendarMonth,
  setCalendarMonth,
  selectedCalendarDate,
  setSelectedCalendarDate,
  visibleDashboardLeaves,
  calendarEmployeeNameLookup,
}) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const deptFilterValue = normalizeDeptName(viewDeptFilter) || 'ALL';

  // Helper to determine if an employee has any leave status today
  const isLeaveStatus = (emp) => {
    if (!emp) return false;
    if (emp.todayLeave) return true;
    const status = emp.status || '';
    return ['연차', '오전반차', '오후반차', '오전반반차', '오후반반차', '기타휴가', '공가', '경조휴가', '휴가'].includes(status) || 
           status.endsWith('휴가') || 
           status.endsWith('반차') || 
           status.endsWith('반일') ||
           status === '공가';
  };

  const filteredStatuses = useMemo(() => {
    return data?.employeeStatuses?.filter(emp => {
      const deptMatch = matchesDeptFilter(emp.dept, deptFilterValue);
      const matchSearch = (emp.name || '').includes(searchQuery) || (emp.empNo || '').includes(searchQuery) || (emp.dept || '').includes(searchQuery);
      if (!deptMatch) return false;
      if (statusFilter === 'ALL') return matchSearch;
      if (statusFilter === 'PRESENT') return matchSearch && emp.status === '근무중';
      if (statusFilter === 'ABSENT') return matchSearch && emp.status === '미출근';
      if (statusFilter === 'LATE') return matchSearch && emp.isLate;
      if (statusFilter === 'LEAVE') return matchSearch && isLeaveStatus(emp);
      return matchSearch;
    }) || [];
  }, [data?.employeeStatuses, deptFilterValue, searchQuery, statusFilter]);

  const deptFilteredStatuses = useMemo(() => {
    return data?.employeeStatuses?.filter(emp => {
      return matchesDeptFilter(emp.dept, deptFilterValue);
    }) || [];
  }, [data?.employeeStatuses, deptFilterValue]);

  const visibleDashboardStats = useMemo(() => {
    return deptFilteredStatuses.reduce((acc, emp) => {
      acc.totalEmployees += 1;
      if (emp.status === '근무중') acc.present += 1;
      if (emp.isLate) acc.late += 1;
      if (isLeaveStatus(emp)) acc.leave += 1;
      if (emp.status === '근무중' && (emp.checkOut === '-' || !emp.checkOut)) acc.workingNow += 1;
      return acc;
    }, { totalEmployees: 0, present: 0, late: 0, leave: 0, workingNow: 0 });
  }, [deptFilteredStatuses]);

  const visibleDeptData = useMemo(() => {
    return (data?.deptData || []).filter((dept) => deptFilterValue === 'ALL' || dept.name === deptFilterValue);
  }, [data?.deptData, deptFilterValue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Real-time Status Card Grid */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => setStatusFilter('ALL')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="kpi-label">전체 재직 임직원</span>
            <div className="kpi-icon blue"><Users style={{ width: 18, height: 18 }} /></div>
          </div>
          <span className="kpi-value">{visibleDashboardStats.totalEmployees} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
          <span className="kpi-desc">등록된 전체 활성 사원 수</span>
        </div>

        <div className="kpi-card" onClick={() => setStatusFilter('PRESENT')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="kpi-label">오늘 정상 근무자</span>
            <div className="kpi-icon green"><UserCheck style={{ width: 18, height: 18 }} /></div>
          </div>
          <span className="kpi-value">{visibleDashboardStats.present} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
          <span className="kpi-desc">출근 완료 및 실시간 근무중</span>
        </div>

        <div className="kpi-card" onClick={() => setStatusFilter('LATE')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="kpi-label">오늘 지각 발생건</span>
            <div className="kpi-icon amber"><Clock style={{ width: 18, height: 18 }} /></div>
          </div>
          <span className="kpi-value" style={{ color: visibleDashboardStats.late > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
            {visibleDashboardStats.late} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>건</small>
          </span>
          <span className="kpi-desc">출근 기준시간 대비 지각자</span>
        </div>

        <div className="kpi-card" onClick={() => setStatusFilter('LEAVE')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="kpi-label">오늘 휴가/연차자</span>
            <div className="kpi-icon purple"><Calendar style={{ width: 18, height: 18 }} /></div>
          </div>
          <span className="kpi-value" style={{ color: 'var(--purple)' }}>{visibleDashboardStats.leave} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
          <span className="kpi-desc">반차/연차 결근 처리 포함</span>
        </div>
      </div>

      {/* Split layout (Real-time grid + Dept chart) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '20px' }}>
        
        {/* Real-time employee status table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">실시간 임직원 근태 목록</h3>
              <p className="card-subtitle">오늘 기준 전체 직원의 상태와 출퇴근 기록</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '9px', width: '13px', height: '13px', color: 'var(--text-2)' }} />
                <input
                  type="text"
                  placeholder="이름/사번/부서 검색"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
          </div>

          <div className="table-wrapper status-table-wrapper">
            <table className="table status-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>사원 정보</th>
                  <th>부서</th>
                  <th>기준 출근</th>
                  <th>출근</th>
                  <th>현재 상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatuses.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>
                      검색 조건에 맞는 직원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredStatuses.map((emp, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp.name}</td>
                      <td style={{ color: 'var(--text-2)' }}>{emp.dept}</td>
                      <td style={{ fontSize: '13.5px', fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{emp.scheduleTime}</td>
                      <td style={{
                        fontSize: '13.5px',
                        color: emp.isLate ? 'var(--amber)' : 'var(--green)',
                        fontWeight: emp.isLate ? 700 : 500,
                        fontFamily: 'var(--font)',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {emp.checkIn}
                        {emp.isLate && <span className="status-dot amber" style={{ display: 'inline-block', marginLeft: '6px' }} title="지각" />}
                      </td>
                                            <td>
                        {(() => {
                          const badgeMeta = getStatusBadgeMeta(emp.todayLeave?.leaveName || emp.status, emp.todayLeave || emp);
                          return (
                            <span className={badgeMeta.className} style={badgeMeta.style}>
                              {badgeMeta.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right sidebar: Calendar widget + Today leaves + Dept chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <DashboardCalendarWidget
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            calendarLeaves={visibleDashboardLeaves}
            employeeNameLookup={calendarEmployeeNameLookup}
            selectedCalendarDate={selectedCalendarDate}
            setSelectedCalendarDate={setSelectedCalendarDate}
          />

          {/* 부서별 출근 현황 */}
          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <h3 className="card-title">부서별 출근 현황</h3>
              <p className="card-subtitle">부서별 정시율 및 실시간 출근 현황</p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
              {visibleDeptData.map((dept, idx) => {
                const rate = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-1)' }}>{dept.name}</span>
                      <span style={{ color: 'var(--text-2)' }}>
                        {dept.present}/{dept.total} 명({rate}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-overlay-md)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: rate + '%', height: '100%', background: 'var(--blue)', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
