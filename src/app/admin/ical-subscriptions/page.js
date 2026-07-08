'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Link2, RefreshCw, Shield, Trash2, RotateCcw } from 'lucide-react';
import EmployeeAdminShell from '../employees/EmployeeAdminShell';

const DEFAULT_DEPTS = ['경영지원실', '경영지원팀'];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function DeptChip({ dept, checked, onChange }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 36,
        padding: '7px 10px',
        borderRadius: 12,
        border: `1px solid ${checked ? 'var(--blue)' : 'var(--border)'}`,
        background: checked ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-overlay-sm)',
        color: 'var(--text-1)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 14, height: 14, margin: 0, accentColor: 'var(--blue)' }}
      />
      <span style={{ fontSize: 13, fontWeight: 700 }}>{dept}</span>
    </label>
  );
}

function SubscriptionCard({ item, onCopyUrl, onCopyWebcal, onToggleActive, onDelete }) {
  const [open, setOpen] = useState(false);
  const active = item.isActive;

  return (
    <div
      className="card"
      style={{
        padding: 10,
        borderRadius: 14,
        borderColor: active ? 'var(--border)' : 'rgba(148, 163, 184, 0.32)',
        background: active ? 'var(--bg-card)' : 'rgba(148, 163, 184, 0.05)',
        opacity: active ? 1 : 0.82,
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{item.label}</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: active ? 'rgba(59, 130, 246, 0.12)' : 'rgba(148, 163, 184, 0.14)',
                  color: active ? 'var(--blue)' : 'var(--text-2)',
                }}
              >
                {active ? '활성' : '비활성'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              생성 {formatDateTime(item.createdAt)}
              {item.revokedAt ? ` · 변경 ${formatDateTime(item.revokedAt)}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="tab-btn" onClick={onCopyUrl} style={{ padding: '6px 10px' }}>
              <Copy size={14} /> URL
            </button>
            <button type="button" className="tab-btn" onClick={onCopyWebcal} style={{ padding: '6px 10px' }}>
              <Copy size={14} /> webcal
            </button>
            <button
              type="button"
              className="tab-btn"
              onClick={() => onToggleActive(active)}
              style={{
                padding: '6px 10px',
                borderColor: active ? 'rgba(239, 68, 68, 0.32)' : 'rgba(34, 197, 94, 0.32)',
                color: active ? 'var(--red)' : 'var(--green)',
              }}
            >
              <RotateCcw size={14} />
              {active ? '비활성' : '활성화'}
            </button>
            <button
              type="button"
              className="tab-btn"
              onClick={onDelete}
              style={{ padding: '6px 10px', borderColor: 'rgba(239, 68, 68, 0.32)', color: 'var(--red)' }}
            >
              <Trash2 size={14} /> 삭제
            </button>
            <button type="button" className="tab-btn" onClick={() => setOpen((v) => !v)} style={{ padding: '6px 10px' }}>
              <ChevronDown
                size={14}
                style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s ease' }}
              />
              {open ? '접기' : '상세'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(item.depts || []).map((dept) => (
            <span
              key={`${item.id}-${dept}`}
              style={{
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 999,
                background: 'var(--bg-overlay-sm)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
            >
              {dept}
            </span>
          ))}
        </div>

        {open ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 8,
              padding: 10,
              borderRadius: 12,
              background: 'var(--bg-overlay-sm)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>URL</div>
              <code style={{ wordBreak: 'break-all', color: 'var(--text-1)', fontSize: 12 }}>{item.url}</code>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>webcal</div>
              <code style={{ wordBreak: 'break-all', color: 'var(--text-1)', fontSize: 12 }}>{item.webcalUrl}</code>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function IcalSubscriptionPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState(DEFAULT_DEPTS);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [creating, setCreating] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [reloadNotice, setReloadNotice] = useState('');
  const copyNoticeTimer = useRef(null);
  const reloadNoticeTimer = useRef(null);

  const employeeDepartments = useMemo(() => {
    return Array.from(
      new Set(
        (employees || [])
          .map((employee) => String(employee.dept || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [employees]);

  const selectedCount = selectedDepts.length;
  const activeCount = subscriptions.filter((item) => item.isActive).length;

  const autoLabel = useMemo(() => {
    if (selectedDepts.length === 0) return '캘린더 링크';
    if (selectedDepts.length === 1) return `${selectedDepts[0]} 캘린더 링크`;
    return `${selectedDepts[0]} 외 ${selectedDepts.length - 1}개 부서 캘린더 링크`;
  }, [selectedDepts]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingEmployees(true);
        const res = await fetch('/api/admin/employees', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '직원 목록을 불러오지 못했습니다.');
        if (!alive) return;
        setEmployees(json.employees || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoadingEmployees(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingSubscriptions(true);
        const res = await fetch('/api/ical/subscriptions', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '구독 목록을 불러오지 못했습니다.');
        if (!alive) return;
        setSubscriptions(json.subscriptions || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoadingSubscriptions(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (employeeDepartments.length === 0) return;
    setSelectedDepts((current) => {
      if (current.length > 0) {
        const next = current.filter((dept) => employeeDepartments.includes(dept));
        return next.length > 0 ? next : employeeDepartments.slice(0, 2);
      }
      return employeeDepartments.slice(0, 2);
    });
  }, [employeeDepartments]);

  const toggleDept = (dept, checked) => {
    setSelectedDepts((current) => {
      if (checked) return current.includes(dept) ? current : [...current, dept];
      return current.filter((item) => item !== dept);
    });
  };

  const refreshSubscriptions = async () => {
    const res = await fetch('/api/ical/subscriptions', { credentials: 'include' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '구독 목록을 다시 불러오지 못했습니다.');
    setSubscriptions(json.subscriptions || []);
  };

  const refreshSubscriptionsWithNotice = async () => {
    await refreshSubscriptions();
    setReloadNotice('기존 목록을 새 형식으로 다시 표시했습니다.');
    if (reloadNoticeTimer.current) {
      window.clearTimeout(reloadNoticeTimer.current);
    }
    reloadNoticeTimer.current = window.setTimeout(() => {
      setReloadNotice('');
      reloadNoticeTimer.current = null;
    }, 1800);
  };

  const createSubscription = async () => {
    setCreating(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/ical/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          depts: selectedDepts,
          label: autoLabel,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '구독 URL 생성에 실패했습니다.');

      setMessage('구독 링크를 생성했습니다.');
      await refreshSubscriptions();
      await navigator.clipboard?.writeText?.(json.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (token, active) => {
    try {
      const res = await fetch(`/api/ical/subscriptions/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '상태 변경에 실패했습니다.');
      await refreshSubscriptions();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteSubscription = async (token, labelText) => {
    const confirmed = window.confirm(`"${labelText}" 구독을 완전히 삭제할까요?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/ical/subscriptions/${encodeURIComponent(token)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '삭제에 실패했습니다.');
      await refreshSubscriptions();
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = async (value, label) => {
    if (!value) return;
    await navigator.clipboard?.writeText?.(value);
    setCopyNotice(`${label}가 복사되었습니다.`);
    if (copyNoticeTimer.current) {
      window.clearTimeout(copyNoticeTimer.current);
    }
    copyNoticeTimer.current = window.setTimeout(() => {
      setCopyNotice('');
      copyNoticeTimer.current = null;
    }, 1800);
  };

  return (
    <EmployeeAdminShell
      title="캘린더 링크 생성"
      subtitle="부서를 선택해 캘린더 구독 링크를 만들고, 목록에서 링크를 복사하거나 활성화/삭제를 관리합니다."
      activeHref="/admin/ical-subscriptions"
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield style={{ width: 18, height: 18, color: 'var(--blue)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>링크 생성</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>이름은 자동으로 지정되며, 선택한 부서원들의 연차 일정만 구독 URL에 노출됩니다.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                  부서 선택 {selectedCount > 0 ? `(${selectedCount})` : ''}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="tab-btn"
                    onClick={() => setSelectedDepts(employeeDepartments)}
                    style={{ padding: '5px 10px' }}
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    className="tab-btn"
                    onClick={() => setSelectedDepts([])}
                    style={{ padding: '5px 10px' }}
                  >
                    해제
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
                  gap: 6,
                  maxHeight: 118,
                  overflow: 'auto',
                  paddingRight: 2,
                }}
              >
                {loadingEmployees ? (
                  <div style={{ color: 'var(--text-2)', fontSize: 13 }}>직원 정보를 불러오는 중...</div>
                ) : employeeDepartments.length === 0 ? (
                  <div style={{ color: 'var(--text-2)', fontSize: 13 }}>선택할 부서가 없습니다.</div>
                ) : (
                  employeeDepartments.map((dept) => (
                    <DeptChip
                      key={dept}
                      dept={dept}
                      checked={selectedDepts.includes(dept)}
                      onChange={(checked) => toggleDept(dept, checked)}
                    />
                  ))
                )}
              </div>
            </div>

            <button
              type="button"
              className="login-btn"
              onClick={createSubscription}
              disabled={creating || selectedCount === 0}
              style={{ marginTop: 0, minWidth: 92, background: 'linear-gradient(135deg, var(--blue), #2563eb)', color: '#fff' }}
            >
              {creating ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={16} />}
              생성
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              자동 이름: <strong style={{ color: 'var(--text-1)' }}>{autoLabel}</strong>
            </div>
            {message ? <div style={{ fontSize: 12, color: 'var(--green)' }}>{message}</div> : null}
            {error ? <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div> : null}
            {reloadNotice ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--blue)',
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'rgba(59, 130, 246, 0.1)',
                }}
              >
                {reloadNotice}
              </div>
            ) : null}
            {copyNotice ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--blue)',
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'rgba(59, 130, 246, 0.1)',
                }}
              >
                {copyNotice}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>구독 목록</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                활성 {activeCount}개 · 전체 {subscriptions.length}개
              </div>
            </div>
            <button type="button" className="tab-btn" onClick={refreshSubscriptionsWithNotice} disabled={loadingSubscriptions}>
              {loadingSubscriptions ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              새 형식 반영
            </button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {loadingSubscriptions ? (
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>구독 목록을 불러오는 중...</div>
            ) : subscriptions.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>아직 생성된 구독이 없습니다.</div>
            ) : (
              subscriptions.map((item) => (
                <SubscriptionCard
                  key={item.id}
                  item={item}
                  onCopyUrl={() => copy(item.url, 'URL')}
                  onCopyWebcal={() => copy(item.webcalUrl, 'webcal URL')}
                  onToggleActive={(active) => setActive(item.token, !active)}
                  onDelete={() => deleteSubscription(item.token, item.label)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </EmployeeAdminShell>
  );
}
