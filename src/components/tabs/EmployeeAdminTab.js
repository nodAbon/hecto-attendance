'use client';

import React, { memo, useState, useEffect } from 'react';
import { Search, RefreshCw } from 'lucide-react';

const rankOptions = ['선임', '책임', '수석', '상무보', '상무', '전무', '대표이사'];
const positionOptions = ['팀원', '팀장', '실장', '대표이사'];

function EmployeeAdminTab({
  isAdmin,
  data,
  monthlyData,
  theme,
  refreshData,
}) {
  const [employeeAdminData, setEmployeeAdminData] = useState([]);
  const [employeeAdminLoading, setEmployeeAdminLoading] = useState(false);
  const [employeeAdminSearch, setEmployeeAdminSearch] = useState('');
  const [employeeAdminDrafts, setEmployeeAdminDrafts] = useState({});
  const [employeeAdminSaving, setEmployeeAdminSaving] = useState({});
  const [employeeAdminResetting, setEmployeeAdminResetting] = useState({});
  const [employeeAdminBackfilling, setEmployeeAdminBackfilling] = useState({});
  const [employeeAdminCreating, setEmployeeAdminCreating] = useState({});

  const regFieldStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none'
  };

  const regSelectStyle = {
    ...regFieldStyle,
    colorScheme: theme === 'light' ? 'light' : 'dark',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    appearance: 'none'
  };

  const regTeamOptions = Array.from(new Set([
    ...(data?.allEmployees || []),
    ...(monthlyData?.allEmployees || []),
    ...(employeeAdminData || [])
  ]
    .map((emp) => emp?.dept || emp?.team)
    .filter((dept) => dept && dept !== '부서없음'))).sort((a, b) => a.localeCompare(b, 'ko'));

  const fetchEmployeeAdminData = async () => {
    setEmployeeAdminLoading(true);
    try {
      const res = await fetch('/api/admin/employees');
      const json = await res.json();
      if (json.success) {
        const list = json.employees || [];
        setEmployeeAdminData(list);
        const draftMap = {};
        list.forEach((emp) => {
          draftMap[emp.empNo] = {
            name: emp.name || '',
            dept: emp.dept || '',
            rank: emp.rank || '',
            position: emp.position || '',
            isAdmin: !!emp.isAdmin,
            status: emp.status || 'active',
            resetPassword: ''
          };
        });
        setEmployeeAdminDrafts(draftMap);
      } else {
        alert(json.error || '직원 정보를 불러오지 못했습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('직원 정보를 불러오지 못했습니다.');
    } finally {
      setEmployeeAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchEmployeeAdminData();
    }
  }, [isAdmin]);

  const updateEmployeeAdminDraft = (empNo, patch) => {
    setEmployeeAdminDrafts((prev) => ({
      ...prev,
      [empNo]: {
        ...(prev[empNo] || {}),
        ...patch
      }
    }));
  };

  const handleEmployeeInfoSave = async (empNo) => {
    const draft = employeeAdminDrafts[empNo];
    if (!draft) return;

    setEmployeeAdminSaving((prev) => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo,
          name: draft.name?.trim() || '',
          dept: draft.dept?.trim() || '',
          rank: draft.rank || '',
          position: draft.position || '',
          isAdmin: !!draft.isAdmin,
          status: draft.status || 'active'
        })
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '직원 정보 수정에 실패했습니다.');
        return;
      }
      await fetchEmployeeAdminData();
      alert(json.message || '직원 정보가 수정되었습니다.');
      if (refreshData) await refreshData({ empNo });
    } catch (e) {
      console.error(e);
      alert('직원 정보 수정 중 오류가 발생했습니다.');
    } finally {
      setEmployeeAdminSaving((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  const handleEmployeePasswordReset = async (empNo) => {
    const draft = employeeAdminDrafts[empNo];
    const newPassword = draft?.resetPassword?.trim() || '';
    if (newPassword.length < 8) {
      alert('초기 비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setEmployeeAdminResetting((prev) => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/admin/employees/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo,
          newPassword
        })
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '암호 초기화에 실패했습니다.');
        return;
      }
      updateEmployeeAdminDraft(empNo, { resetPassword: '' });
      alert(json.message || '암호가 초기화되었습니다.');
    } catch (e) {
      console.error(e);
      alert('암호 초기화 중 오류가 발생했습니다.');
    } finally {
      setEmployeeAdminResetting((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  const handleEmployeeLeaveBackfill = async (empNo) => {
    setEmployeeAdminBackfilling((prev) => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/admin/leave-backfill/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '연차 백필 요청에 실패했습니다.');
        return;
      }
      alert(json.message || '연차 백필 요청이 등록되었습니다.');
    } catch (e) {
      console.error(e);
      alert('연차 백필 요청 중 오류가 발생했습니다.');
    } finally {
      setEmployeeAdminBackfilling((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  const handleCreateAccount = async (empNo) => {
    const emp = employeeAdminData.find((e) => e.empNo === empNo);
    if (!emp) return;
    const draft = employeeAdminDrafts[empNo] || {};
    const tempPassword = draft.resetPassword?.trim() || '';

    if (!tempPassword) {
      alert('임시 비밀번호를 입력해주세요.');
      return;
    }
    if (tempPassword.length < 8) {
      alert('임시 비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    setEmployeeAdminCreating((prev) => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo,
          name: draft.name?.trim() || emp.name || '',
          tempPassword,
          isAdmin: !!draft.isAdmin,
          userId: emp.loginId || empNo,
          rank: draft.rank || '',
          position: draft.position || '',
          team: draft.dept?.trim() || emp.dept || ''
        })
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '계정 생성에 실패했습니다.');
        return;
      }
      updateEmployeeAdminDraft(empNo, { resetPassword: '' });
      await fetchEmployeeAdminData();
      alert(json.message || '계정이 생성되었습니다.');
      if (refreshData) await refreshData({ empNo });
    } catch (e) {
      console.error(e);
      alert('계정 생성 중 오류가 발생했습니다.');
    } finally {
      setEmployeeAdminCreating((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  const q = employeeAdminSearch.trim().toLowerCase();
  const filtered = employeeAdminData.filter((emp) =>
    String(emp.name || '') + ' ' + String(emp.empNo || '') + ' ' + String(emp.dept || '') + ' ' + String(emp.rank || '') + ' ' + String(emp.position || '')
      .toLowerCase()
      .includes(q)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card">
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 className="card-title">직원 정보 및 암호 초기화</h3>
            <p className="card-subtitle">이름, 팀, 직급, 직책을 수정하고 계정 비밀번호를 관리자 권한으로 초기화합니다.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '280px', flex: '1 1 320px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
              <input
                type="text"
                value={employeeAdminSearch}
                onChange={(e) => setEmployeeAdminSearch(e.target.value)}
                placeholder="이름, 사번, 팀 검색"
                className="form-input"
                style={{ ...regFieldStyle, width: '100%', paddingLeft: '34px' }}
              />
              <Search style={{ position: 'absolute', left: '11px', top: '11px', width: '14px', height: '14px', color: 'var(--text-2)' }} />
            </div>
            <button
              type="button"
              onClick={fetchEmployeeAdminData}
              className="login-btn"
              style={{ marginTop: 0, padding: '10px 14px', background: 'var(--bg-overlay-md)', color: 'var(--text-1)' }}
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: '180px' }}>이름 / 사번</th>
                <th style={{ minWidth: '180px' }}>팀</th>
                <th style={{ minWidth: '150px' }}>직급</th>
                <th style={{ minWidth: '150px' }}>직책</th>
                <th style={{ minWidth: '130px' }}>재직여부</th>
                <th style={{ minWidth: '110px' }}>관리자</th>
                <th style={{ minWidth: '220px' }}>초기 비밀번호</th>
                <th className="text-right" style={{ minWidth: '220px' }}>작업</th>
              </tr>
            </thead>
            <tbody>
               {employeeAdminLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-2)' }}>
                    직원 정보를 불러오는 중...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-2)' }}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const draft = employeeAdminDrafts[emp.empNo] || {};
                  const saving = employeeAdminSaving[emp.empNo];
                  const resetting = employeeAdminResetting[emp.empNo];

                  return (
                    <tr key={emp.empNo}>
                      <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input
                            type="text"
                            value={draft.name ?? emp.name}
                            onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { name: e.target.value })}
                            className="form-input"
                            style={{ ...regFieldStyle, width: '100%', padding: '8px 10px', fontWeight: 700 }}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
                            {emp.empNo}
                          </span>
                          <span style={{ fontSize: '12px', color: emp.hasAccount ? 'var(--green)' : 'var(--text-2)' }}>
                            {emp.hasAccount ? '계정 등록됨' : '계정 없음'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <input
                          type="text"
                          value={draft.dept ?? emp.dept ?? ''}
                          onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { dept: e.target.value })}
                          className="form-input"
                          style={{ ...regFieldStyle, width: '100%', padding: '8px 10px' }}
                          list="employee-admin-team-options"
                        />
                      </td>

                      <td>
                        <select
                          value={draft.rank ?? emp.rank ?? ''}
                          onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { rank: e.target.value })}
                          className="form-input"
                          style={{ ...regSelectStyle, width: '100%', padding: '8px 10px' }}
                        >
                          <option value="">선택</option>
                          {rankOptions.map((rank) => (
                            <option key={rank} value={rank}>{rank}</option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <select
                          value={draft.position ?? emp.position ?? ''}
                          onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { position: e.target.value })}
                          className="form-input"
                          style={{ ...regSelectStyle, width: '100%', padding: '8px 10px' }}
                        >
                          <option value="">선택</option>
                          {positionOptions.map((position) => (
                            <option key={position} value={position}>{position}</option>
                          ))}
                        </select>
                      </td>

                       <td>
                        <select
                          value={draft.status ?? emp.status ?? 'active'}
                          onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { status: e.target.value })}
                          className="form-input"
                          style={{ ...regSelectStyle, width: '100%', padding: '8px 10px' }}
                        >
                          <option value="active">재직</option>
                          <option value="leave">휴직</option>
                          <option value="resigned">퇴사</option>
                        </select>
                      </td>

                      <td>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-1)', fontSize: '14px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={!!(draft.isAdmin ?? emp.isAdmin)}
                            onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { isAdmin: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                          />
                          Admin
                        </label>
                      </td>

                      <td>
                        <input
                          type="password"
                          value={draft.resetPassword || ''}
                          onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { resetPassword: e.target.value })}
                          placeholder={emp.hasAccount ? '새 비밀번호' : '임시 비밀번호'}
                          className="form-input"
                          style={{ ...regFieldStyle, width: '100%', padding: '8px 10px' }}
                        />
                      </td>

                      <td className="text-right" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {emp.hasAccount ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEmployeeInfoSave(emp.empNo)}
                              disabled={!!saving}
                              style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                background: 'var(--blue)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: saving ? 'default' : 'pointer'
                              }}
                            >
                              {saving ? '저장 중' : '정보 저장'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEmployeePasswordReset(emp.empNo)}
                              disabled={!!resetting}
                              style={{
                                padding: '6px 12px',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: 'var(--amber)',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: resetting ? 'default' : 'pointer',
                              }}
                            >
                              {resetting ? '초기화 중' : '암호 초기화'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCreateAccount(emp.empNo)}
                            disabled={!!employeeAdminCreating[emp.empNo]}
                            style={{
                              padding: '6px 12px',
                              border: 'none',
                              borderRadius: '6px',
                              background: 'var(--green)',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: employeeAdminCreating[emp.empNo] ? 'default' : 'pointer'
                            }}
                          >
                            {employeeAdminCreating[emp.empNo] ? '생성 중' : '계정 생성'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEmployeeLeaveBackfill(emp.empNo)}
                          disabled={!!employeeAdminBackfilling[emp.empNo]}
                          title="연차 백필 요청"
                          aria-label="연차 백필 요청"
                          style={{
                            width: '36px',
                            height: '36px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.10)',
                            color: 'var(--blue)',
                            cursor: employeeAdminBackfilling[emp.empNo] ? 'default' : 'pointer',
                            opacity: employeeAdminBackfilling[emp.empNo] ? 0.6 : 1
                          }}
                        >
                          <RefreshCw size={16} style={{ animation: employeeAdminBackfilling[emp.empNo] ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <datalist id="employee-admin-team-options">
        {regTeamOptions.map((team) => (
          <option key={team} value={team} />
        ))}
      </datalist>
    </div>
  );
}

export default memo(EmployeeAdminTab);
