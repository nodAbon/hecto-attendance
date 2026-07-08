'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Save } from 'lucide-react';
import EmployeeAdminShell from '../EmployeeAdminShell';

const rankOptions = ['선임', '책임', '수석', '상무보', '상무', '전무', '대표이사'];
const positionOptions = ['팀원', '팀장', '실장', '대표이사'];

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const empNo = useMemo(() => String(params?.empNo || ''), [params]);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [draft, setDraft] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/employees', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '직원 정보를 불러오지 못했습니다.');
        if (!alive) return;
        const nextEmployees = json.employees || [];
        setEmployees(nextEmployees);
        const initialEmployee = nextEmployees.find((emp) => emp.empNo === empNo);
        if (initialEmployee) {
          setDraft({
            name: initialEmployee.name || '',
            dept: initialEmployee.dept || '',
            rank: initialEmployee.rank || '',
            position: initialEmployee.position || '',
            isAdmin: !!initialEmployee.isAdmin,
            profileId: initialEmployee.profileId || '',
            status: initialEmployee.status || 'active',
          });
        }
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [empNo]);

  const employee = useMemo(() => employees.find((emp) => emp.empNo === empNo), [employees, empNo]);
  const deptOptions = useMemo(() => {
    const depts = (employees || []).map((emp) => emp.dept).filter(Boolean);
    return Array.from(new Set(depts)).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [employees]);
  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          empNo,
          profileId: draft.profileId || employee?.profileId || '',
          name: draft.name,
          dept: draft.dept,
          rank: draft.rank,
          position: draft.position,
          isAdmin: !!draft.isAdmin,
          status: draft.status || 'active',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setMessage(json.message || '저장되었습니다.');
      const refreshed = await fetch('/api/admin/employees', { credentials: 'include' }).then((r) => r.json());
      setEmployees(refreshed.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!resetPassword || resetPassword.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    try {
      setResetting(true);
      setMessage('');
      const res = await fetch('/api/admin/employees/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ empNo, newPassword: resetPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '초기화 실패');
      setMessage(json.message || '비밀번호가 초기화되었습니다.');
      setResetPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!resetPassword || resetPassword.length < 8) {
      setError('임시 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    try {
      setCreating(true);
      setMessage('');
      setError('');
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          empNo,
          name: draft.name || employee?.name || '',
          tempPassword: resetPassword,
          isAdmin: !!draft.isAdmin,
          userId: employee?.loginId || empNo,
          rank: draft.rank || '',
          position: draft.position || '',
          team: draft.dept || employee?.dept || ''
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '계정 생성 실패');
      setMessage(json.message || '계정이 생성되었습니다.');
      setResetPassword('');
      const refreshed = await fetch('/api/admin/employees', { credentials: 'include' }).then((r) => r.json());
      setEmployees(refreshed.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <EmployeeAdminShell
      title={employee?.name ? `${employee.name} 상세` : '직원 상세'}
      subtitle="직원 기본 정보와 비밀번호 초기화를 분리된 화면에서 처리합니다."
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Link href="/admin/employees" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', textDecoration: 'none', fontWeight: 700 }}>
          <ArrowLeft size={16} /> 직원 목록
        </Link>
        <button type="button" className="login-btn" style={{ marginTop: 0, padding: '10px 14px', background: 'var(--blue)', color: '#fff' }} onClick={() => router.refresh()}>
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-2)' }}>직원 정보를 불러오는 중입니다...</div>
      ) : error ? (
        <div className="card" style={{ padding: 20, color: 'var(--red)' }}>{error}</div>
      ) : !employee ? (
        <div className="card" style={{ padding: 20, color: 'var(--text-2)' }}>직원 정보를 찾을 수 없습니다.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.9fr)', gap: 20 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <Field label="이름">
                <input className="form-input" style={inputStyle} value={draft.name ?? ''} onChange={(e) => updateDraft({ name: e.target.value })} />
              </Field>
              <Field label="사번">
                <input className="form-input time-display" style={inputStyle} value={employee.empNo} readOnly />
              </Field>
              <Field label="로그인 아이디">
                <input className="form-input" style={inputStyle} value={employee.loginId || '-'} readOnly />
              </Field>
              <Field label="팀">
                <select className="form-input" style={selectStyle} value={draft.dept ?? ''} onChange={(e) => updateDraft({ dept: e.target.value })}>
                  <option value="">선택</option>
                  {deptOptions.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              </Field>
              <Field label="직급">
                <select className="form-input" style={selectStyle} value={draft.rank ?? ''} onChange={(e) => updateDraft({ rank: e.target.value })}>
                  <option value="">선택</option>
                  {rankOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="직책">
                <select className="form-input" style={selectStyle} value={draft.position ?? ''} onChange={(e) => updateDraft({ position: e.target.value })}>
                  <option value="">선택</option>
                  {positionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="재직여부">
                <select className="form-input" style={selectStyle} value={draft.status ?? 'active'} onChange={(e) => updateDraft({ status: e.target.value })}>
                  <option value="active">재직</option>
                  <option value="leave">휴직</option>
                  <option value="resigned">퇴사</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-1)', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={!!draft.isAdmin}
                  onChange={(e) => updateDraft({ isAdmin: e.target.checked })}
                />
                시스템 관리자 권한
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={handleSave} className="login-btn" style={{ marginTop: 0, padding: '10px 16px', background: 'var(--blue)' }} disabled={saving}>
                <Save size={16} /> {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>계정 상태</h3>
              <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
                <Row label="계정" value={employee.hasAccount ? '있음' : '없음'} />
                <Row label="관리자" value={employee.isAdmin ? '예' : '아니오'} />
                <Row label="비밀번호 변경 필요" value={employee.mustChangePassword ? '예' : '아니오'} />
              </div>
            </div>

            {!employee.hasAccount ? (
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>계정 생성</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="임시 비밀번호 (8자 이상)"
                    className="form-input"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    className="login-btn"
                    style={{ marginTop: 0, padding: '10px 16px', background: 'var(--green)', color: '#fff' }}
                    disabled={creating}
                  >
                    <KeyRound size={16} /> {creating ? '생성 중...' : '계정 생성'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>비밀번호 초기화</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="새 임시 비밀번호"
                    className="form-input"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={handleReset}
                    className="login-btn"
                    style={{ marginTop: 0, padding: '10px 16px', background: 'rgba(239, 68, 68, 0.18)', color: 'var(--red)' }}
                    disabled={resetting}
                  >
                    <KeyRound size={16} /> {resetting ? '초기화 중...' : '비밀번호 초기화'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {message && <div style={{ marginTop: 14, color: 'var(--green)', fontWeight: 700 }}>{message}</div>}
    </EmployeeAdminShell>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{value}</span>
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-1)',
  borderRadius: '8px',
  padding: '10px 12px',
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
  colorScheme: 'dark',
};
