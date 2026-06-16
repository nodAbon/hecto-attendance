'use client';

import React, { useState } from 'react';
import { CheckCircle, Plus, Upload } from 'lucide-react';

const rankOptions = ['선임', '책임', '수석', '상무보', '상무', '전무', '대표이사'];
const positionOptions = ['팀원', '팀장', '실장', '대표이사'];

export default function AdminPanelTabs({
  activeTab,
  isAdmin,
  isLeader,
  monthlyData,
  employeeAdminData,
  data,
  theme,
  refreshData,
}) {
  // --- Manual Approval States & Handlers ---
  const handleDecideCheckin = async (id, decision) => {
    try {
      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision })
      });
      const json = await res.json();
      if (json.success) {
        alert(decision === 'approved' ? '승인 완료' : '반려 완료');
        if (refreshData) await refreshData();
      } else {
        alert(json.error);
      }
    } catch {
      alert('오류가 발생했습니다.');
    }
  };

  // --- User Registration States & Handlers ---
  const [regEmpNo, setRegEmpNo] = useState('');
  const [regName, setRegName] = useState('');
  const [regUserId, setRegUserId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRank, setRegRank] = useState('');
  const [regPosition, setRegPosition] = useState('');
  const [regTeam, setRegTeam] = useState('');
  const [regIsAdmin, setRegIsAdmin] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [showRegTeamSuggestions, setShowRegTeamSuggestions] = useState(false);

  const regFieldStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    width: '100%'
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
    .map((emp) => emp?.dept)
    .filter((dept) => dept && dept !== '부서없음'))).sort((a, b) => a.localeCompare(b, 'ko'));

  const regTeamSuggestions = regTeamOptions
    .filter((team) => team.includes(regTeam.trim()))
    .slice(0, 8);

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!regEmpNo || !regName || !regUserId || !regPassword) {
      alert('필수 입력 항목을 확인해주세요.');
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: regEmpNo,
          name: regName,
          userId: regUserId,
          tempPassword: regPassword,
          rank: regRank,
          position: regPosition,
          team: regTeam.trim(),
          isAdmin: regIsAdmin
        })
      });
      const json = await res.json();
      if (json.success) {
        alert(json.message || '계정이 정상적으로 등록되었습니다.');
        setRegEmpNo('');
        setRegName('');
        setRegUserId('');
        setRegPassword('');
        setRegRank('');
        setRegPosition('');
        setRegTeam('');
        setShowRegTeamSuggestions(false);
        setRegIsAdmin(false);
        if (refreshData) await refreshData();
      } else {
        alert(json.error || '계정 등록에 실패했습니다.');
      }
    } catch (err) {
      alert('계정 등록 요청 중 오류가 발생했습니다.');
    } finally {
      setRegLoading(false);
    }
  };

  // --- CAPS Attendance Upload States & Handlers ---
  const [capsUploadFile, setCapsUploadFile] = useState(null);
  const [capsUploadLoading, setCapsUploadLoading] = useState(false);
  const [capsUploadResult, setCapsUploadResult] = useState(null);

  const handleCapsAttendanceUpload = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!capsUploadFile) {
      alert('업로드할 파일을 선택해주세요.');
      return;
    }

    setCapsUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', capsUploadFile);

      const res = await fetch('/api/admin/caps-attendance/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      const importedRows = Number(json?.importedRows || 0);
      const hasImportedRows = json?.success === true || importedRows > 0;

      if (hasImportedRows) {
        setCapsUploadResult(json);
        setCapsUploadFile(null);
        if (form && typeof form.reset === 'function') {
          form.reset();
        }
        alert(json.message || `캡스 출입기록 ${importedRows}건이 반영되었습니다.`);
        if (refreshData) {
          try {
            await refreshData();
          } catch (refreshErr) {
            console.warn('Caps upload refresh failed:', refreshErr);
          }
        }
        if (Array.isArray(json?.warnings) && json.warnings.length > 0) {
          console.warn('Caps upload warnings:', json.warnings);
        }
      } else {
        alert(json.error || '캡스 출입기록 업로드에 실패했습니다.');
      }
    } catch (err) {
      alert('캡스 출입기록 업로드 요청 중 오류가 발생했습니다.');
    } finally {
      setCapsUploadLoading(false);
    }
  };

  // --- Conditional Render based on activeTab ---
  if (activeTab === 'MANUAL_APPROVAL' && (isAdmin || isLeader)) {
    return (
      <div className="card">
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 className="card-title">수동 출퇴근 결재 요청</h3>
          <p className="card-subtitle">직원이 출입 오류나 누락으로 수동 기입 제출한 내역 목록입니다.</p>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>사원명</th>
                <th>기록 구분</th>
                <th>기록 시각</th>
                <th>대상 일자</th>
                <th>사유</th>
                <th>결재 상태</th>
                <th className="text-right">결정</th>
              </tr>
            </thead>
            <tbody>
              {(!monthlyData?.manualCheckins || monthlyData.manualCheckins.length === 0) ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>
                    제출된 수동 출퇴근 요청 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                monthlyData.manualCheckins.map((req, i) => {
                  const emp = (monthlyData?.allEmployees || []).find(e => e.empNo === req.emp_no);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp ? emp.name : req.emp_no} ({req.emp_no})</td>
                      <td>
                        <span className={'badge ' + (req.check_type === '출근' ? 'green' : 'gray')}>
                          {req.check_type}
                        </span>
                      </td>
                      <td className="time-display">
                        {new Date(req.check_time).toLocaleTimeString('ko-KR', { hour12: false })}
                      </td>
                      <td className="time-display">{req.work_date}</td>
                      <td>{req.note}</td>
                      <td>
                        <span className={'badge ' + (
                          req.admin_decision === 'approved' ? 'green' : 
                          req.admin_decision === 'rejected' ? 'red' : 'amber'
                        )}>
                          {req.admin_decision === 'approved' ? '승인완료' : 
                           req.admin_decision === 'rejected' ? '반려됨' : '대기중'}
                        </span>
                      </td>
                      <td className="text-right" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {req.admin_decision === null && (
                          <>
                            <button 
                              onClick={() => handleDecideCheckin(req.id, 'approved')}
                              style={{ padding: '4px 10px', background: 'var(--green)', border: 'none', borderRadius: '4px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                            >
                              승인
                            </button>
                            <button 
                              onClick={() => handleDecideCheckin(req.id, 'rejected')}
                              style={{ padding: '4px 10px', background: 'var(--red)', border: 'none', borderRadius: '4px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                            >
                              반려
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (activeTab === 'USER_REGISTER' && isAdmin) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto', background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus className="h-5 w-5" style={{ color: 'var(--blue)' }} />
            <span>신규 로그인 계정 등록</span>
          </h3>
          <p className="card-subtitle">시스템 로그인을 위한 커스텀 아이디와 사원번호 정보를 연결해 등록합니다.</p>
        </div>
        
        <form onSubmit={handleRegisterUser} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>사원번호</label>
              <input
                type="text"
                placeholder="예: 20260001"
                value={regEmpNo}
                onChange={(e) => setRegEmpNo(e.target.value)}
                className="form-input"
                style={regFieldStyle}
                required
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>이름</label>
              <input
                type="text"
                placeholder="예: 홍길동"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="form-input"
                style={regFieldStyle}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>로그인 아이디</label>
            <input
              type="text"
              placeholder="예: user01 또는 사번"
              value={regUserId}
              onChange={(e) => setRegUserId(e.target.value)}
              className="form-input"
              style={regFieldStyle}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>임시 비밀번호</label>
            <input
              type="password"
              placeholder="8자 이상으로 입력"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              className="form-input"
              style={regFieldStyle}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>직급 (선택)</label>
              <select
                value={regRank}
                onChange={(e) => setRegRank(e.target.value)}
                className="form-input"
                style={regSelectStyle}
              >
                <option value="" style={{ color: theme === 'light' ? '#111827' : '#fff', backgroundColor: theme === 'light' ? '#fff' : '#0f172a' }}>선택하세요</option>
                {rankOptions.map((rank) => (
                  <option key={rank} value={rank} style={{ color: theme === 'light' ? '#111827' : '#fff', backgroundColor: theme === 'light' ? '#fff' : '#0f172a' }}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>직책 (선택 - 팀장 입력 시 권한 부여)</label>
              <select
                value={regPosition}
                onChange={(e) => setRegPosition(e.target.value)}
                className="form-input"
                style={regSelectStyle}
              >
                <option value="" style={{ color: theme === 'light' ? '#111827' : '#fff', backgroundColor: theme === 'light' ? '#fff' : '#0f172a' }}>선택하세요</option>
                {positionOptions.map((position) => (
                  <option key={position} value={position} style={{ color: theme === 'light' ? '#111827' : '#fff', backgroundColor: theme === 'light' ? '#fff' : '#0f172a' }}>
                    {position}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>팀 (선택)</label>
            <input
              type="text"
              value={regTeam}
              onChange={(e) => {
                setRegTeam(e.target.value);
                setShowRegTeamSuggestions(true);
              }}
              onFocus={() => setShowRegTeamSuggestions(true)}
              onBlur={() => setTimeout(() => setShowRegTeamSuggestions(false), 120)}
              placeholder="팀 입력 후 검색"
              className="form-input"
              style={regFieldStyle}
            />
            {showRegTeamSuggestions && regTeamSuggestions.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '74px',
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                zIndex: 50,
                maxHeight: '220px',
                overflowY: 'auto',
                boxShadow: '0 10px 24px rgba(0,0,0,0.18)'
              }}>
                {regTeamSuggestions.map((team) => (
                  <div
                    key={team}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setRegTeam(team);
                      setShowRegTeamSuggestions(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: 'var(--text-1)',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    {team}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-overlay-sm)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              id="regIsAdmin"
              checked={regIsAdmin}
              onChange={(e) => setRegIsAdmin(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="regIsAdmin" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer' }}>
              이 계정에 시스템 관리자(Admin) 권한을 부여합니다.
            </label>
          </div>

          <button
            type="submit"
            disabled={regLoading}
            className="login-btn"
            style={{
              background: 'linear-gradient(135deg, var(--blue), #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              opacity: regLoading ? 0.7 : 1,
              marginTop: '10px'
            }}
          >
            {regLoading ? '사용자 등록 중...' : '신규 사용자 등록'}
          </button>
        </form>
      </div>
    );
  }

  if (activeTab === 'CAPS_UPLOAD' && isAdmin) {
    return (
      <div className="card" style={{ maxWidth: '760px', margin: '0 auto', background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload className="h-5 w-5" style={{ color: 'var(--blue)' }} />
            <span>캡스 출입기록 업로드</span>
          </h3>
          <p className="card-subtitle">매일 다운로드한 Caps 출입기록 CSV 또는 TSV 파일을 업로드하면 사번 기준으로 출입기록이 반영됩니다.</p>
        </div>

        <form onSubmit={handleCapsAttendanceUpload} style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>업로드 파일</label>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.log,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="form-input"
                style={regFieldStyle}
                onChange={(e) => {
                  setCapsUploadFile(e.target.files?.[0] || null);
                  setCapsUploadResult(null);
                }}
                required
              />
              <div style={{ fontSize: '12px', color: 'var(--text-3)', lineHeight: 1.6 }}>
                사번과 일시 컬럼이 있는 CSV/TSV를 권장합니다. <br />
                예시 컬럼: <code>사번</code>, <code>출입일시</code> 또는 <code>a_time</code>, <code>card_no</code>, <code>flag1</code>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>반영 방식</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-1)', lineHeight: 1.6 }}>
                  1. 업로드 파일에서 사번과 일시를 읽습니다.<br />
                  2. 기존 <code>sa_attendance</code>와는 <code>sabun + a_time</code> 기준으로 중복을 막습니다.<br />
                  3. 반영된 기록은 월간 보고서와 트래커에서 바로 조회됩니다.
                </div>
              </div>
            </div>
          </div>

          {capsUploadResult && (
            <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>
                {capsUploadResult.message || '업로드가 완료되었습니다.'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                원본 {capsUploadResult.totalRows || 0}행 · 반영 {capsUploadResult.importedRows || 0}행 · 건너뜀 {capsUploadResult.skippedRows || 0}행
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={capsUploadLoading}
            className="login-btn"
            style={{
              background: 'linear-gradient(135deg, var(--blue), #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              opacity: capsUploadLoading ? 0.7 : 1,
              marginTop: '4px'
            }}
          >
            {capsUploadLoading ? '업로드 반영 중...' : '캡스 기록 업로드'}
          </button>
        </form>
      </div>
    );
  }

  return null;
}
