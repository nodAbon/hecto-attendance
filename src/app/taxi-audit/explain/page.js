'use client';

import { useEffect, useState, use } from 'react';
import { CheckCircle2, CarTaxiFront, Clock, AlertTriangle, Send, ShieldCheck, ArrowRight } from 'lucide-react';

function formatCurrency(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

export default function TaxiExplainPage({ searchParams: searchParamsPromise }) {
  const searchParams = searchParamsPromise ? use(searchParamsPromise) : {};
  const token = searchParams?.token || '';

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [explanationText, setExplanationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setError('유효한 소명 토큰이 메일 링크에 포함되어 있지 않습니다.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/taxi-audit/explain?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!res.ok || !json.data) {
          throw new Error(json.error || '소명 정보를 찾을 수 없습니다.');
        }

        if (isMounted) {
          setRecord(json.data);
          if (json.data.explanation_text) {
            setExplanationText(json.data.explanation_text);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || '소명 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!explanationText.trim()) {
      setError('소명 사유를 작성해 주세요.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccessMsg('');

      const res = await fetch('/api/taxi-audit/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          explanationText: explanationText.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '제출에 실패했습니다.');

      setRecord(json.data || { ...record, explanation_text: explanationText, status: 'SUBMITTED' });
      setSuccessMsg('소명 사유가 제출되었습니다. 승인 대기 중입니다.');
    } catch (err) {
      setError(err?.message || '제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8fafc 0%, #edf2f7 100%)',
      padding: '24px 16px 48px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 640,
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
      }}>
        {/* Top Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: '#ffffff',
          padding: '32px 28px 24px',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.18)',
              display: 'grid',
              placeItems: 'center',
              backdropFilter: 'blur(4px)',
            }}>
              <CarTaxiFront size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#93c5fd', textTransform: 'uppercase' }}>
                HECTO Q&M 근태관리시스템
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>
                야간 택시 이용 소명 작성
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#dbeafe', lineHeight: 1.5 }}>
            22시 이후 택시 이용 건에 대해 실제 퇴근 시각 기준과 대조하여 소명 사유를 수집합니다.
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: 28 }}>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>소명 정보를 불러오는 중...</div>
            </div>
          ) : error && !record ? (
            <div style={{
              padding: 20,
              borderRadius: 16,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}>
              <AlertTriangle size={20} style={{ shrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>오류가 발생했습니다</div>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{error}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 24 }}>
              {/* Submission Status Alert */}
              {record?.status === 'SUBMITTED' ? (
                <div style={{
                  padding: '16px 20px',
                  borderRadius: 16,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <CheckCircle2 size={22} color="#16a34a" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>소명 제출이 완료되었습니다</div>
                    <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                      제출 시각: {record?.submitted_at ? new Date(record.submitted_at).toLocaleString('ko-KR') : '방금 전'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '14px 18px',
                  borderRadius: 16,
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 600,
                }}>
                  <Clock size={18} color="#d97706" />
                  <div>아래 내역을 확인하시고 소명 사유를 적어 제출해 주세요.</div>
                </div>
              )}

              {/* Taxi Audit Item Details */}
              <div style={{
                borderRadius: 18,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 18px',
                  background: '#f1f5f9',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>이용 상세 내역</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                    티켓번호: {record?.ticket_no || record?.order_id || '-'}
                  </span>
                </div>

                <div style={{ padding: 18, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 12, border: '1px solid #edf2f7' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>직원명 / 부서</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                        {record?.employee_name || '-'} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({record?.dept || '-'})</span>
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 12, border: '1px solid #edf2f7' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>결제 금액</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                        {formatCurrency(record?.amount)}원
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: '#fff5f5', padding: '12px 14px', borderRadius: 12, border: '1px solid #fed7d7' }}>
                      <div style={{ fontSize: 11, color: '#e53e3e', fontWeight: 700 }}>🚖 택시 탑승 시각</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#c53030', marginTop: 4 }}>
                        {record?.ride_time || '-'}
                      </div>
                    </div>

                    <div style={{ background: '#ebf8ff', padding: '12px 14px', borderRadius: 12, border: '1px solid #bee3f8' }}>
                      <div style={{ fontSize: 11, color: '#3182ce', fontWeight: 700 }}>⏰ 실제 퇴근 기록 시각</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#2b6cb0', marginTop: 4 }}>
                        {record?.actual_out_time || '-'}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 12, border: '1px solid #edf2f7' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>출발지 ➔ 도착지</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{record?.pickup || '-'}</span>
                      <ArrowRight size={14} color="#94a3b8" />
                      <span>{record?.dropoff || '-'}</span>
                    </div>
                  </div>

                  {record?.use_reason && (
                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 12, border: '1px solid #edf2f7' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>카카오T 신청 사유</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#334155', marginTop: 4 }}>
                        {record.use_reason}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Explanation Textarea Form */}
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                    소명 사유 작성 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={explanationText}
                    onChange={(e) => setExplanationText(e.target.value)}
                    placeholder="예: 22시까지 야근 업무 진행 후 사무실 철수하여 22:15경 택시 탑승하여 귀가했습니다. 근태 기록 누락 여부 확인 부탁드립니다."
                    style={{
                      width: '100%',
                      padding: 14,
                      borderRadius: 14,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: '#0f172a',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#2563eb')}
                    onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 6 }}>
                    <span>구체적인 사유를 작성해 주시면 빠른 승인 처리에 도움이 됩니다.</span>
                    <span>{explanationText.length} 자</span>
                  </div>
                </div>

                {error && (
                  <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '10px 14px', borderRadius: 10 }}>
                    {error}
                  </div>
                )}

                {successMsg && (
                  <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, background: '#f0fdf4', padding: '10px 14px', borderRadius: 10 }}>
                    {successMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !explanationText.trim()}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: 14,
                    background: submitting || !explanationText.trim() ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 700,
                    border: 'none',
                    cursor: submitting || !explanationText.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: submitting || !explanationText.trim() ? 'none' : '0 4px 14px rgba(37,99,235,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  <Send size={18} />
                  {submitting ? '제출 중...' : record?.status === 'SUBMITTED' ? '소명 사유 수정 제출하기' : '소명 사유 제출하기'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                <ShieldCheck size={16} color="#94a3b8" />
                <span>제출된 소명 내역은 근태 관리 시스템 DB에 안전하게 저장됩니다.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
