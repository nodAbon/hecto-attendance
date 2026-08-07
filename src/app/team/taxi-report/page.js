'use client';

import { useEffect, useMemo, useState } from 'react';
import EmployeeAdminShell from '@/app/admin/employees/EmployeeAdminShell';
import {
  CarTaxiFront,
  Calendar,
  Search,
  RefreshCcw,
  Building2,
  Clock,
  Banknote,
  Coins,
  FileText,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  AlertCircle,
  TrendingUp,
  Award,
  Sparkles,
  Zap,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { getKstDateKey, shiftKstDateKey } from '@/lib/kstDate';

function formatCurrency(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

function StatBadge({ tone = 'blue', children }) {
  const tones = {
    purple: { bg: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.25)' },
    amber: { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)' },
    blue: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' },
    green: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.25)' },
    rose: { bg: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.25)' },
    gray: { bg: 'var(--bg-card-2, #f1f5f9)', color: 'var(--text-2, #64748b)', border: 'var(--border, #cbd5e1)' },
  };

  const current = tones[tone] || tones.gray;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function TaxiReportPage() {
  const today = getKstDateKey();
  const initialStart = shiftKstDateKey(today, -29);

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(today);
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [meta, setMeta] = useState({ permissionScope: 'SINGLE_DEPT', userDept: '', allowedDepts: null });

  // 부서별 현황 View 모드: 'both' | 'kpi' | 'table'
  const [deptViewMode, setDeptViewMode] = useState('both');

  // 전체 이용내역 검색어
  const [tableSearch, setTableSearch] = useState('');

  const fetchReport = async (start = startDate, end = endDate, deptFilter = selectedDept) => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/team/taxi-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: start, endDate: end, dept: deptFilter }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '리포트 데이터를 불러오지 못했습니다.');

      setReportData(json.data || null);
      if (json.meta) {
        setMeta(json.meta);
      }
    } catch (err) {
      console.error('[Taxi Report Fetch Error]', err);
      setError(err?.message || '리포트 데이터를 불러오는 도중 오류가 발생했습니다.');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(initialStart, today, 'ALL');
  }, []);

  // Quick Date presets
  const handleQuickPreset = (days) => {
    const end = getKstDateKey();
    let start = end;

    if (days === 'thisMonth') {
      start = `${end.slice(0, 7)}-01`;
    } else if (days === 'lastMonth') {
      const parts = end.split('-');
      let y = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) - 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
      const lastMonthStr = `${y}-${String(m).padStart(2, '0')}`;
      start = `${lastMonthStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const lastMonthEnd = `${lastMonthStr}-${String(lastDay).padStart(2, '0')}`;
      setStartDate(start);
      setEndDate(lastMonthEnd);
      fetchReport(start, lastMonthEnd, selectedDept);
      return;
    } else {
      start = shiftKstDateKey(end, -days + 1);
    }

    setStartDate(start);
    setEndDate(end);
    fetchReport(start, end, selectedDept);
  };

  const handleDeptChange = (e) => {
    const deptVal = e.target.value;
    setSelectedDept(deptVal);
    fetchReport(startDate, endDate, deptVal);
  };

  // Filtered rows for full transaction table
  const filteredRows = useMemo(() => {
    if (!reportData?.rows) return [];
    const query = tableSearch.trim().toLowerCase();
    if (!query) return reportData.rows;

    return reportData.rows.filter((r) => {
      const haystack = [
        r.employeeName,
        r.dept,
        r.reason,
        r.pickup,
        r.dropoff,
        r.rideTime,
        r.orderId,
        r.verticalProductName,
        r.taxiKind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [reportData?.rows, tableSearch]);

  const summary = reportData?.summary;
  const deptStats = reportData?.deptStats || [];
  const timeWindowStats = reportData?.timeWindowStats;
  const extraFeeStats = reportData?.extraFeeStats;
  const reasonStats = reportData?.reasonStats || [];
  const dailyStats = reportData?.dailyStats || [];
  const availableDepts = reportData?.availableDepts || [];

  return (
    <EmployeeAdminShell activeTab="/team/taxi-report">
      <div style={{ paddingBottom: 60, maxWidth: 1300, margin: '0 auto' }}>
        {/* Header Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <CarTaxiFront size={28} style={{ color: 'var(--amber, #f59e0b)' }} />
              카카오T 이용 분석 리포트
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-2, #64748b)', margin: '4px 0 0 0' }}>
              기간별 카카오T 택시 이용 현황, 부서별/시간대별 패턴, 추가 호출비 및 이용사유 집계 리포트입니다.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 권한 영역 표시 배지 */}
            <StatBadge tone={meta.permissionScope === 'ADMIN' ? 'purple' : meta.permissionScope === 'EXTERNAL_BIZ' ? 'amber' : 'blue'}>
              <ShieldCheck size={13} style={{ marginRight: 4 }} />
              {meta.permissionScope === 'ADMIN' && '전체 부서 조회 권한 (관리자)'}
              {meta.permissionScope === 'EXTERNAL_BIZ' && '외부사업 4개 팀 공유 권한'}
              {meta.permissionScope === 'SINGLE_DEPT' && `${meta.userDept || '소속팀'} 전용 권한`}
            </StatBadge>

            <button
              onClick={() => fetchReport()}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--bg-card, #ffffff)',
                color: 'var(--text-1, #1e293b)',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
              새로고침
            </button>
          </div>
        </div>

        {/* 1. 최상단 날짜 및 부서 선택바 (Date & Dept Range Picker Bar) */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '16px 20px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Calendar size={18} style={{ color: 'var(--blue, #3b82f6)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>조회 기간:</span>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--bg-main, #f8fafc)',
                fontSize: 14,
                color: 'inherit',
              }}
            />
            <span style={{ color: 'var(--text-2, #64748b)' }}>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--bg-main, #f8fafc)',
                fontSize: 14,
                color: 'inherit',
              }}
            />

            {/* 부서 필터 선택 (권한별 구분) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <Building2 size={16} style={{ color: 'var(--indigo, #6366f1)' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>부서 선택:</span>
              {meta.permissionScope === 'SINGLE_DEPT' ? (
                <span
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-main, #f1f5f9)',
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--blue, #2563eb)',
                  }}
                >
                  {meta.userDept || '소속팀'}
                </span>
              ) : (
                <select
                  value={selectedDept}
                  onChange={handleDeptChange}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #cbd5e1)',
                    backgroundColor: 'var(--bg-main, #f8fafc)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL">
                    {meta.permissionScope === 'ADMIN' ? '전체 부서 (All)' : '외부사업팀 전체 (4개 부서)'}
                  </option>
                  {meta.permissionScope === 'EXTERNAL_BIZ' ? (
                    <>
                      <option value="사업개발팀">사업개발팀</option>
                      <option value="사업관리1팀">사업관리1팀</option>
                      <option value="사업관리2팀">사업관리2팀</option>
                      <option value="사업관리3팀">사업관리3팀</option>
                    </>
                  ) : (
                    availableDepts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            <button
              onClick={() => fetchReport()}
              disabled={loading}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                backgroundColor: 'var(--blue, #2563eb)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginLeft: 4,
              }}
            >
              <Search size={15} />
              조회
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2, #64748b)', marginRight: 4 }}>빠른 선택:</span>
            <button
              onClick={() => handleQuickPreset(7)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: '1px solid var(--border, #e2e8f0)',
                backgroundColor: 'var(--bg-main, #f1f5f9)',
                cursor: 'pointer',
              }}
            >
              최근 7일
            </button>
            <button
              onClick={() => handleQuickPreset(30)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: '1px solid var(--border, #e2e8f0)',
                backgroundColor: 'var(--bg-main, #f1f5f9)',
                cursor: 'pointer',
              }}
            >
              최근 30일
            </button>
            <button
              onClick={() => handleQuickPreset('thisMonth')}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: '1px solid var(--border, #e2e8f0)',
                backgroundColor: 'var(--bg-main, #f1f5f9)',
                cursor: 'pointer',
              }}
            >
              이번 달
            </button>
            <button
              onClick={() => handleQuickPreset('lastMonth')}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                border: '1px solid var(--border, #e2e8f0)',
                backgroundColor: 'var(--bg-main, #f1f5f9)',
                cursor: 'pointer',
              }}
            >
              지난 달
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 10,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertCircle size={18} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* Global Summary KPI Grid (KRW 아이콘 표시 반영) */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--bg-card, #ffffff)',
                borderRadius: 12,
                padding: 18,
                border: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-2, #64748b)', fontSize: 13, marginBottom: 6 }}>
                <span>총 이용건수</span>
                <CarTaxiFront size={18} style={{ color: 'var(--blue, #3b82f6)' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{summary.totalCount.toLocaleString()}건</div>
            </div>

            {/* 총 이용금액: KRW (원) 표시 아이콘 반영 */}
            <div
              style={{
                backgroundColor: 'var(--bg-card, #ffffff)',
                borderRadius: 12,
                padding: 18,
                border: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-2, #64748b)', fontSize: 13, marginBottom: 6 }}>
                <span>총 이용금액</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Coins size={17} style={{ color: 'var(--amber, #f59e0b)' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber, #f59e0b)', letterSpacing: 0.5 }}>KRW (원)</span>
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(summary.totalAmount)}원</div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-card, #ffffff)',
                borderRadius: 12,
                padding: 18,
                border: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-2, #64748b)', fontSize: 13, marginBottom: 6 }}>
                <span>건당 평균 금액</span>
                <TrendingUp size={18} style={{ color: 'var(--purple, #a855f7)' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{formatCurrency(summary.avgAmount)}원</div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-card, #ffffff)',
                borderRadius: 12,
                padding: 18,
                border: '1px solid var(--border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-2, #64748b)', fontSize: 13, marginBottom: 6 }}>
                <span>이용 부서 / 사원 수</span>
                <Building2 size={18} style={{ color: 'var(--green, #22c55e)' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>
                {summary.activeDeptsCount}개 부서 <span style={{ fontSize: 16, color: 'var(--text-2, #64748b)', fontWeight: 500 }}>({summary.activeEmployeesCount}명)</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. 부서별 이용 현황 (Department Breakdown: Both KPI & Table view options) */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '20px 24px',
            border: '1px solid var(--border, #e2e8f0)',
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={20} style={{ color: 'var(--indigo, #6366f1)' }} />
                기간 내 부서별 이용 현황
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-2, #64748b)', margin: '4px 0 0 0' }}>
                부서명, 이용건수, 총 이용금액, 이용건수 비중(%), 이용금액 비중(%)을 보여줍니다.
              </p>
            </div>

            {/* View Mode Toggle: 둘 다 보기 / 카드만 / 테이블만 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--bg-main, #f1f5f9)', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setDeptViewMode('both')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: deptViewMode === 'both' ? 'var(--bg-card, #fff)' : 'transparent',
                  fontWeight: deptViewMode === 'both' ? 700 : 500,
                  fontSize: 12,
                  color: 'inherit',
                  cursor: 'pointer',
                  boxShadow: deptViewMode === 'both' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                둘 다 함께 보기 (비교용)
              </button>
              <button
                onClick={() => setDeptViewMode('kpi')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: deptViewMode === 'kpi' ? 'var(--bg-card, #fff)' : 'transparent',
                  fontWeight: deptViewMode === 'kpi' ? 700 : 500,
                  fontSize: 12,
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: deptViewMode === 'kpi' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <LayoutGrid size={14} />
                KPI 카드 뷰
              </button>
              <button
                onClick={() => setDeptViewMode('table')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: deptViewMode === 'table' ? 'var(--bg-card, #fff)' : 'transparent',
                  fontWeight: deptViewMode === 'table' ? 700 : 500,
                  fontSize: 12,
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: deptViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                <TableIcon size={14} />
                테이블 뷰
              </button>
            </div>
          </div>

          {deptStats.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-2, #64748b)', fontSize: 14 }}>
              해당 기간의 부서별 이용 데이터가 없습니다.
            </div>
          ) : (
            <div>
              {/* Option A: KPI Card View */}
              {(deptViewMode === 'both' || deptViewMode === 'kpi') && (
                <div style={{ marginBottom: deptViewMode === 'both' ? 24 : 0 }}>
                  {deptViewMode === 'both' && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue, #3b82f6)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutGrid size={15} /> [형식 A] KPI 카드형 뷰
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {deptStats.map((item, idx) => (
                      <div
                        key={item.dept || idx}
                        style={{
                          backgroundColor: 'var(--bg-main, #f8fafc)',
                          borderRadius: 12,
                          padding: 16,
                          border: '1px solid var(--border, #e2e8f0)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>{item.dept}</span>
                          <StatBadge tone={idx === 0 ? 'purple' : idx === 1 ? 'blue' : 'gray'}>
                            {idx + 1}위
                          </StatBadge>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>이용건수 (비중)</div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                              {item.count}건 <span style={{ fontSize: 12, color: 'var(--blue, #3b82f6)' }}>({item.countRatio}%)</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>총 이용금액 (비중)</div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
                              {formatCurrency(item.amount)}원 <span style={{ fontSize: 12, color: 'var(--amber, #f59e0b)' }}>({item.amountRatio}%)</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--border, #e2e8f0)', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, item.amountRatio)}%`,
                              backgroundColor: idx === 0 ? '#a855f7' : idx === 1 ? '#3b82f6' : '#22c55e',
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Option B: Table View */}
              {(deptViewMode === 'both' || deptViewMode === 'table') && (
                <div>
                  {deptViewMode === 'both' && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green, #22c55e)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TableIcon size={15} /> [형식 B] 테이블 집계 뷰
                    </div>
                  )}

                  <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-main, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                          <th style={{ padding: '12px 16px', fontWeight: 600 }}>부서명</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>이용건수</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>이용건수 비중 (%)</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>총 이용금액</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>이용금액 비중 (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptStats.map((item, idx) => (
                          <tr key={item.dept || idx} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.dept}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{item.count.toLocaleString()}건</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--blue, #3b82f6)', fontWeight: 600 }}>{item.countRatio}%</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.amount)}원</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--amber, #f59e0b)', fontWeight: 600 }}>{item.amountRatio}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. 일자별 시간대별 이용 현황 & 4. 추가 호출비 발생 현황 (2 Columns Grid) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 24 }}>
          {/* 3. 시간대별 이용 현황 (19:00~24:00 & 00:00~06:00) */}
          <div
            style={{
              backgroundColor: 'var(--bg-card, #ffffff)',
              borderRadius: 14,
              padding: '20px 24px',
              border: '1px solid var(--border, #e2e8f0)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={20} style={{ color: 'var(--amber, #f59e0b)' }} />
              시간대별 이용 현황
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-2, #64748b)', margin: '0 0 16px 0' }}>
              저녁/야근(19~24시)과 심야/새벽(00~06시) 핵심 시간대 이용 패턴입니다.
            </p>

            {timeWindowStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 저녁/야근 (19:00 - 24:00) */}
                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.06)', borderRadius: 10, padding: 16, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#d97706', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🌆 {timeWindowStats.evening.label}
                    </span>
                    <StatBadge tone="amber">{timeWindowStats.evening.countRatio}%</StatBadge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                    <span>이용건수: <strong>{timeWindowStats.evening.count}건</strong></span>
                    <span>이용금액: <strong>{formatCurrency(timeWindowStats.evening.amount)}원</strong></span>
                  </div>
                </div>

                {/* 심야/새벽 (00:00 - 06:00) */}
                <div style={{ backgroundColor: 'rgba(168, 85, 247, 0.06)', borderRadius: 10, padding: 16, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🌙 {timeWindowStats.lateNight.label}
                    </span>
                    <StatBadge tone="purple">{timeWindowStats.lateNight.countRatio}%</StatBadge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                    <span>이용건수: <strong>{timeWindowStats.lateNight.count}건</strong></span>
                    <span>이용금액: <strong>{formatCurrency(timeWindowStats.lateNight.amount)}원</strong></span>
                  </div>
                </div>

                {/* 주간/기타 (06:00 - 19:00) */}
                <div style={{ backgroundColor: 'var(--bg-main, #f8fafc)', borderRadius: 10, padding: 14, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2, #64748b)' }}>
                      ☀️ {timeWindowStats.daytime.label}
                    </span>
                    <StatBadge tone="gray">{timeWindowStats.daytime.countRatio}%</StatBadge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-2, #64748b)' }}>
                    <span>이용건수: {timeWindowStats.daytime.count}건</span>
                    <span>이용금액: {formatCurrency(timeWindowStats.daytime.amount)}원</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. 추가 호출비 발생 현황 분석 */}
          <div
            style={{
              backgroundColor: 'var(--bg-card, #ffffff)',
              borderRadius: 14,
              padding: '20px 24px',
              border: '1px solid var(--border, #e2e8f0)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={20} style={{ color: 'var(--rose, #f43f5e)' }} />
              추가 호출비 발생 현황 분석
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-2, #64748b)', margin: '0 0 16px 0' }}>
              플랫폼 이용료, 기본/스마트 호출료 등 추가비용이 발생한 건의 통계입니다.
            </p>

            {extraFeeStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    backgroundColor: 'rgba(244, 63, 94, 0.05)',
                    border: '1px solid rgba(244, 63, 94, 0.2)',
                    borderRadius: 12,
                    padding: 18,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#e11d48', fontWeight: 600, marginBottom: 4 }}>
                    추가 호출비 발생건 비중
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>
                    {extraFeeStats.tripCount}건 <span style={{ fontSize: 18 }}>({extraFeeStats.tripRatio}%)</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ backgroundColor: 'var(--bg-main, #f8fafc)', borderRadius: 10, padding: 14, border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>추가 호출비 총 금액</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: 'var(--rose, #f43f5e)' }}>
                      {formatCurrency(extraFeeStats.totalFeeAmount)}원
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-main, #f8fafc)', borderRadius: 10, padding: 14, border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>전체 결제액 대비 비중</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: 'var(--rose, #f43f5e)' }}>
                      {extraFeeStats.amountRatio}%
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)', backgroundColor: 'var(--bg-main, #f1f5f9)', padding: 10, borderRadius: 8, lineHeight: 1.5 }}>
                  💡 <strong>참고:</strong> 빠른 배차를 위해 스마트호출/플랫폼 사용료가 부과된 이용건에 대한 추가 비용 집계입니다.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. 주요 이용사유 현황 (TOP 4만 1행 카드 형태) */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '20px 24px',
            border: '1px solid var(--border, #e2e8f0)',
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} style={{ color: 'var(--blue, #3b82f6)' }} />
            주요 이용사유 현황 (TOP 4)
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-2, #64748b)', margin: '0 0 16px 0' }}>
            카카오T 승차 시 선택한 용도/사유 상위 4개 항목의 이용 건수 및 금액 집계입니다.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {reasonStats.slice(0, 4).map((item, idx) => (
              <div
                key={item.reason || idx}
                style={{
                  backgroundColor: 'var(--bg-main, #f8fafc)',
                  borderRadius: 10,
                  padding: 14,
                  border: '1px solid var(--border, #e2e8f0)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{item.reason}</span>
                  <StatBadge tone={idx === 0 ? 'purple' : idx === 1 ? 'blue' : 'gray'}>{item.countRatio}%</StatBadge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{item.count}건</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(item.amount)}원</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. 일자별 이용 현황 (Daily Breakdown Table) */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '20px 24px',
            border: '1px solid var(--border, #e2e8f0)',
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={20} style={{ color: 'var(--green, #22c55e)' }} />
            일자별 이용 현황
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-2, #64748b)', margin: '0 0 16px 0' }}>
            선택된 기간 내 각 일자별 이용 건수, 총 금액, 평균 금액 및 시간대 집계입니다.
          </p>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, maxHeight: 350 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--bg-main, #f8fafc)' }}>
                <tr style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>일자 (Date)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>이용건수</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>총 이용금액</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>건당 평균금액</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>야근/심야 건수</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((row) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{row.date}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{row.count}건</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(row.amount)}원</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-2, #64748b)' }}>{formatCurrency(row.avgAmount)}원</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {(row.eveningCount > 0 || row.lateNightCount > 0) ? (
                        <StatBadge tone="amber">
                          야근 {row.eveningCount}건 / 심야 {row.lateNightCount}건
                        </StatBadge>
                      ) : (
                        <span style={{ color: 'var(--text-2, #94a3b8)' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 7. 최하단 전체 이용내역 상세 표 (Full Transactions Table) */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '20px 24px',
            border: '1px solid var(--border, #e2e8f0)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CarTaxiFront size={20} style={{ color: 'var(--purple, #a855f7)' }} />
                전체 이용내역 상세 목록 ({filteredRows.length}건)
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-2, #64748b)', margin: '4px 0 0 0' }}>
                선택 기간 동안의 카카오T 이용내역 전체 상세 목록입니다.
              </p>
            </div>

            {/* Table Search input */}
            <div style={{ position: 'relative', minWidth: 260 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-2, #64748b)' }} />
              <input
                type="text"
                placeholder="사원명, 부서, 사유, 출발/도착지 검색..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #cbd5e1)',
                  backgroundColor: 'var(--bg-main, #f8fafc)',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-main, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>승차 일시</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>사원명</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>부서</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>이용목적 (사유)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>출발지 ➔ 도착지</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>호출/차종</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>결제금액</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>추가호출비</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-2, #64748b)' }}>
                      조회된 이용내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.rideTime}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{row.employeeName}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <StatBadge tone="gray">{row.dept}</StatBadge>
                      </td>
                      <td style={{ padding: '10px 14px' }}>{row.reason}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-1, #1e293b)' }}>{row.pickup || '-'}</span>
                        <span style={{ color: 'var(--text-2, #94a3b8)', margin: '0 4px' }}>➔</span>
                        <span style={{ color: 'var(--text-1, #1e293b)' }}>{row.dropoff || '-'}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2, #64748b)' }}>
                        {row.verticalProductName || row.taxiKind || '일반'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                        {formatCurrency(row.amount)}원
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {row.hasExtraFee ? (
                          <span style={{ color: 'var(--rose, #f43f5e)', fontWeight: 600 }}>
                            +{formatCurrency(row.platformFee)}원
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-2, #94a3b8)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </EmployeeAdminShell>
  );
}
