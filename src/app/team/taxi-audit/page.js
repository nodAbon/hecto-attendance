'use client';

import { useEffect, useState } from 'react';
import EmployeeAdminShell from '@/app/admin/employees/EmployeeAdminShell';
import {
  CarTaxiFront,
  Search,
  CheckCircle2,
  Clock,
  FileText,
  X,
  RefreshCcw,
  User,
  ArrowRight,
  ListFilter,
  Calendar,
} from 'lucide-react';

function Badge({ tone = 'blue', children }) {
  const tones = {
    green: { bg: 'rgba(34, 197, 94, 0.12)', color: 'var(--green, #22c55e)', border: 'rgba(34, 197, 94, 0.25)' },
    orange: { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--orange, #f59e0b)', border: 'rgba(245, 158, 11, 0.25)' },
    blue: { bg: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue, #3b82f6)', border: 'rgba(59, 130, 246, 0.25)' },
    gray: { bg: 'var(--bg-card-2, #f1f5f9)', color: 'var(--text-2, #64748b)', border: 'var(--border, #cbd5e1)' },
  };

  const current = tones[tone] || tones.gray;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: 9999,
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

function formatCurrency(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

export default function TeamTaxiAuditPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [deptName, setDeptName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);

  const fetchTeamExplanations = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/team/taxi-audit');
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || '팀원 소명 내역을 불러올 수 없습니다.');
      }

      setRows(json.rows || []);
      setDeptName(json.dept || '');
    } catch (err) {
      setError(err?.message || '소명 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamExplanations();
  }, []);

  const filteredRows = rows.filter((r) => {
    const queryLower = searchQuery.trim().toLowerCase();
    const rideTimeStr = String(r.ride_time || '');
    const requestedAtStr = String(r.requested_at || '');

    // 텍스트/이름/날짜 검색
    const textMatch =
      !queryLower ||
      String(r.employee_name || '').toLowerCase().includes(queryLower) ||
      String(r.emp_no || '').toLowerCase().includes(queryLower) ||
      String(r.explanation_text || '').toLowerCase().includes(queryLower) ||
      rideTimeStr.includes(queryLower) ||
      requestedAtStr.includes(queryLower);

    // 상태 필터
    const statusMatch =
      statusFilter === 'ALL' ||
      (statusFilter === 'SUBMITTED' && r.status === 'SUBMITTED') ||
      (statusFilter === 'PENDING' && r.status !== 'SUBMITTED');

    // 날짜 기간 필터 (YYYY-MM-DD)
    let dateMatch = true;
    if (startDate || endDate) {
      const rowDate = rideTimeStr.substring(0, 10); // "YYYY-MM-DD"
      if (startDate && rowDate && rowDate < startDate) dateMatch = false;
      if (endDate && rowDate && rowDate > endDate) dateMatch = false;
    }

    return textMatch && statusMatch && dateMatch;
  });

  const totalCount = rows.length;
  const submittedCount = rows.filter((r) => r.status === 'SUBMITTED').length;
  const pendingCount = totalCount - submittedCount;

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  return (
    <EmployeeAdminShell
      title={`팀원 택시 소명 현황 ${deptName ? `(${deptName})` : ''}`}
      subtitle="22시 이후 부서 팀원들의 법인 택시 이용건 및 제출된 소명 사유를 확인합니다."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top Summary Header Banner */}
        <div className="card" style={{ padding: '14px 18px', borderRadius: 'var(--r-md, 10px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: 'var(--blue)',
                }}
              >
                <CarTaxiFront size={18} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                  부서 소명 현황 요약 {deptName && <span style={{ color: 'var(--blue)' }}>({deptName})</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  팀원이 제출한 야간 택시 소명 사유가 이메일 및 시스템에 실시간 연동됩니다.
                </div>
              </div>
            </div>

            {/* Compact Stat Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--bg-card-2)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>전체 대상: </span>
                <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>{totalCount}건</span>
              </div>
              <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', fontSize: 12 }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>소명 완료: </span>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{submittedCount}건</span>
              </div>
              <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: 12 }}>
                <span style={{ color: 'var(--orange)', fontWeight: 600 }}>소명 대기: </span>
                <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{pendingCount}건</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Main Card with Toolbar & Table */}
        <div className="card" style={{ padding: 0, borderRadius: 'var(--r-md, 10px)', overflow: 'hidden' }}>
          {/* Integrated Toolbar Header */}
          <div
            style={{
              padding: '10px 16px',
              background: 'var(--bg-card-2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            {/* Left: Filter Tabs & Date Range Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ListFilter size={14} style={{ color: 'var(--text-3)' }} />
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className={`tab-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                    style={{ padding: '3px 10px', fontSize: 12, minHeight: 26 }}
                  >
                    전체 ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('SUBMITTED')}
                    className={`tab-btn ${statusFilter === 'SUBMITTED' ? 'active' : ''}`}
                    style={{ padding: '3px 10px', fontSize: 12, minHeight: 26 }}
                  >
                    소명 완료 ({submittedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('PENDING')}
                    className={`tab-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
                    style={{ padding: '3px 10px', fontSize: 12, minHeight: 26 }}
                  >
                    소명 대기 ({pendingCount})
                  </button>
                </div>
              </div>

              {/* Date Range Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', padding: '3px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <Calendar size={13} style={{ color: 'var(--blue)' }} />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-1)',
                    fontSize: 12,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-1)',
                    fontSize: 12,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}
                    title="날짜 초기화"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Search Input & Refresh Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', width: 200 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="팀원명 / 날짜 / 사유 검색..."
                  style={{
                    width: '100%',
                    padding: '5px 10px 5px 28px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-1)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>

              {(searchQuery || statusFilter !== 'ALL' || startDate || endDate) && (
                <button
                  type="button"
                  className="tab-btn"
                  onClick={resetFilters}
                  style={{ padding: '5px 8px', fontSize: 11, minHeight: 28, color: 'var(--text-3)' }}
                >
                  필터 초기화
                </button>
              )}

              <button
                type="button"
                className="tab-btn"
                onClick={fetchTeamExplanations}
                disabled={loading}
                style={{ padding: '5px 10px', fontSize: 12, minHeight: 28, gap: 4 }}
              >
                <RefreshCcw size={12} className={loading ? 'spin' : ''} />
                새로고침
              </button>
            </div>
          </div>

          {/* Table Area */}
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>팀원명 / 부서</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>택시 탑승 일시</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>실제 퇴근 시각</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>출발지 ➔ 도착지</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>결제 금액</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>소명 상태</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>소명 사유</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                      팀원 소명 내역을 불러오는 중...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                      {searchQuery || startDate || endDate ? '검색/필터 조건에 해당하는 소명 건이 없습니다.' : '등록된 팀원 택시 소명 내역이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr
                      key={row.id || row.token || idx}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={13} color="var(--text-3)" />
                          <span>{row.employee_name || '-'}</span>
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-2)' }}>({row.dept || '-'})</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--red)', fontWeight: 700 }}>
                        {row.ride_time || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--blue)', fontWeight: 700 }}>
                        {row.actual_out_time || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: 12 }}>
                        {row.pickup || row.dropoff ? `${row.pickup || '-'} ➔ ${row.dropoff || '-'}` : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>
                        {formatCurrency(row.amount)}원
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {row.status === 'SUBMITTED' ? (
                          <Badge tone="green">
                            <CheckCircle2 size={11} style={{ marginRight: 3 }} />
                            소명 완료
                          </Badge>
                        ) : (
                          <Badge tone="orange">
                            <Clock size={11} style={{ marginRight: 3 }} />
                            소명 대기
                          </Badge>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {row.status === 'SUBMITTED' ? (
                          <button
                            type="button"
                            className="tab-btn"
                            onClick={() => setSelectedRow(row)}
                            style={{
                              padding: '3px 8px',
                              minHeight: 26,
                              fontSize: 12,
                              color: 'var(--green)',
                              borderColor: 'rgba(34, 197, 94, 0.3)',
                              background: 'rgba(34, 197, 94, 0.08)',
                            }}
                          >
                            <FileText size={12} style={{ marginRight: 3 }} />
                            사유 보기
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>미작성</span>
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

      {/* Modal for viewing submitted explanation */}
      {selectedRow ? (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 9999,
          padding: 16,
          backdropFilter: 'blur(6px)',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 540,
            padding: 22,
            borderRadius: 'var(--r-lg, 14px)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-1)',
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            gap: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(91, 136, 214, 0.14)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--blue)',
                }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>팀원 소명 사유 상세</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>팀원이 작성하여 제출한 야간 택시 이용 사유입니다.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  padding: 4,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              padding: 12,
              borderRadius: 'var(--r-md, 10px)',
              background: 'var(--bg-card-2)',
              border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>팀원명 / 부서</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                  {selectedRow.employee_name} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>({selectedRow.dept || '-'})</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>결제 금액</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>
                  {formatCurrency(selectedRow.amount)}원
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>🚖 탑승 일시</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginTop: 2 }}>
                  {selectedRow.ride_time}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>⏰ 실제 퇴근 기록</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginTop: 2 }}>
                  {selectedRow.actual_out_time}
                </div>
              </div>
              {selectedRow.pickup || selectedRow.dropoff ? (
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>출발지 ➔ 도착지</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginTop: 2 }}>
                    {selectedRow.pickup || '-'} ➔ {selectedRow.dropoff || '-'}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>작성된 소명 사유</div>
                <Badge tone="green">
                  <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                  소명 제출 완료
                </Badge>
              </div>
              <div style={{
                padding: '14px 16px',
                borderRadius: 'var(--r-md, 10px)',
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-1)',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                minHeight: 90,
              }}>
                {selectedRow.explanation_text || '(작성된 사유가 없습니다)'}
              </div>
            </div>

            {selectedRow.submitted_at && (
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>
                제출 시각: {new Date(selectedRow.submitted_at).toLocaleString('ko-KR')}
              </div>
            )}

            <button
              type="button"
              className="tab-btn primary"
              onClick={() => setSelectedRow(null)}
              style={{ width: '100%', height: 38, justifyContent: 'center', marginTop: 4, fontWeight: 700 }}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </EmployeeAdminShell>
  );
}
