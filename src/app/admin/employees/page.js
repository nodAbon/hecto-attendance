'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import EmployeeAdminShell from './EmployeeAdminShell';

export default function EmployeeAdminPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/employees', { credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '직원 목록을 불러오지 못했습니다.');
        if (!alive) return;
        setEmployees(json.employees || []);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((emp) =>
      `${emp.name} ${emp.empNo} ${emp.dept || ''} ${emp.rank || ''} ${emp.position || ''} ${emp.loginId || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [employees, query]);

  return (
    <EmployeeAdminShell
      title="직원 관리"
      subtitle="직원을 선택하면 상세 정보와 비밀번호 초기화를 따로 처리할 수 있습니다."
    >
      <div className="card">
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', padding: '16px 18px', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 사번, 팀, 직급, 직책, 아이디 검색"
              className="search-input"
            />
            <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-2)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}>{filtered.length}명</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="login-btn"
              style={{ marginTop: 0, padding: '10px 14px', background: 'var(--blue)', color: '#fff' }}
            >
              <RefreshCw size={16} /> 새로고침
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>직원 목록을 불러오는 중입니다...</div>
          ) : error ? (
            <div style={{ padding: 20, color: 'var(--red)' }}>{error}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>사번</th>
                  <th>아이디</th>
                  <th>팀</th>
                  <th>직급</th>
                  <th>직책</th>
                  <th>권한</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr
                    key={emp.empNo}
                    onClick={() => router.push(`/admin/employees/${emp.empNo}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 800 }}>{emp.name}</td>
                    <td className="time-display">{emp.empNo}</td>
                    <td style={{ color: 'var(--text-2)' }}>{emp.loginId || '-'}</td>
                    <td>{emp.dept || '-'}</td>
                    <td>{emp.rank || '-'}</td>
                    <td>{emp.position || '-'}</td>
                    <td>
                      <span className={`badge ${emp.isAdmin ? 'blue' : 'gray'}`}>
                        {emp.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${emp.hasAccount ? 'green' : 'gray'}`}>
                        {emp.hasAccount ? '계정 있음' : '계정 없음'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </EmployeeAdminShell>
  );
}
