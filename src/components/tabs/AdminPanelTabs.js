'use client';

import React, { memo, useMemo, useState } from 'react';
import { CheckCircle, Plus, Upload } from 'lucide-react';
import { getKstDateKey, shiftKstDateKey } from '../../lib/kstDate';

const rankOptions = ['선임', '책임', '수석', '상무보', '상무', '전무', '대표이사'];
const positionOptions = ['팀원', '팀장', '실장', '대표이사'];

const formatKstTimePart = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parseTarget = hasTimezone ? raw : `${normalized}+09:00`;
  const date = new Date(parseTarget);

  if (Number.isNaN(date.getTime())) {
    if (raw.includes('T')) return raw.split('T')[1].substring(0, 5);
    if (raw.includes(' ')) return raw.split(' ')[1].substring(0, 5);
    return raw.substring(0, 5);
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const parseRequestNote = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    // ignore
  }
  return { reason: raw };
};

const getKstDateOnlyPart = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw.slice(0, 10);
  }
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

function AdminPanelTabs({
  activeTab,
  isAdmin,
  isLeader,
  myDept,
  monthlyData,
  employeeAdminData,
  data,
  theme,
  refreshData,
}) {
  // --- Manual Approval States & Handlers ---
  const [manualDateFrom, setManualDateFrom] = useState(() => shiftKstDateKey(getKstDateKey(new Date()), -7));
  const [manualDateTo, setManualDateTo] = useState(() => getKstDateKey(new Date()));
  const [manualStatusFilter, setManualStatusFilter] = useState('all');
  const [manualNameQuery, setManualNameQuery] = useState('');

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

  const filteredManualCheckins = useMemo(() => {
    const requests = monthlyData?.manualCheckins || [];
    if (isAdmin) return requests;
    if (!isLeader) return [];
    const deptKey = String(myDept || '').trim().replace(/\s+/g, '');
    if (!deptKey) return [];
    const employeeDeptMap = new Map(
      (monthlyData?.allEmployees || data?.allEmployees || [])
        .map((emp) => [String(emp.empNo || '').trim(), String(emp.dept || '').trim()])
        .filter(([empNo]) => !!empNo)
    );
    return requests.filter((req) => {
      const empDept = String(employeeDeptMap.get(String(req.emp_no || '').trim()) || '').trim().replace(/\s+/g, '');
      return empDept && empDept === deptKey;
    });
  }, [monthlyData?.manualCheckins, monthlyData?.allEmployees, data?.allEmployees, isAdmin, isLeader, myDept]);

  const visibleManualCheckins = useMemo(() => {
    return (filteredManualCheckins || []).filter((req) => {
      const workDate = String(req.work_date || '').slice(0, 10);
      const createdDate = getKstDateOnlyPart(req.created_at);
      const statusKey = String(req.admin_decision || 'pending');
      const emp = (monthlyData?.allEmployees || data?.allEmployees || []).find((e) => String(e.empNo || '').trim() === String(req.emp_no || '').trim());
      const empName = String(emp?.name || '').trim();
      if (manualDateFrom && workDate < manualDateFrom && createdDate < manualDateFrom) return false;
      if (manualDateTo && workDate > manualDateTo && createdDate > manualDateTo) return false;
      if (manualStatusFilter !== 'all' && statusKey !== manualStatusFilter) return false;
      if (manualNameQuery && !empName.includes(manualNameQuery.trim())) return false;
      return true;
    });
  }, [filteredManualCheckins, manualDateFrom, manualDateTo, manualStatusFilter, manualNameQuery, monthlyData?.allEmployees, data?.allEmployees]);

  const approvalRows = useMemo(() => {
    const allLogs = monthlyData?.allLogs || [];
    const employeeMap = new Map(
      (monthlyData?.allEmployees || data?.allEmployees || [])
        .map((emp) => [String(emp.empNo || '').trim(), emp])
        .filter(([empNo]) => !!empNo)
    );

    const sortedManualCheckins = [...visibleManualCheckins].sort((a, b) => {
      const aDate = String(a.work_date || '').slice(0, 10);
      const bDate = String(b.work_date || '').slice(0, 10);
      if (aDate !== bDate) return aDate.localeCompare(bDate);

      const aCreated = String(a.created_at || a.decided_at || a.check_time || '');
      const bCreated = String(b.created_at || b.decided_at || b.check_time || '');
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

      const aName = String(employeeMap.get(String(a.emp_no || '').trim())?.name || '');
      const bName = String(employeeMap.get(String(b.emp_no || '').trim())?.name || '');
      return aName.localeCompare(bName);
    });

    return sortedManualCheckins.map((req) => {
      const emp = employeeMap.get(String(req.emp_no || '').trim()) || null;
      const reqDate = String(req.work_date || '').slice(0, 10);
      const reqType = String(req.check_type || '').trim();
      const isCheckinFix = reqType.includes('출근');
      const isCheckoutFix = reqType.includes('퇴근');
      const isScheduleRequest = reqType.includes('일정');
      const requestMeta = parseRequestNote(req.note);
      const dayLogs = allLogs.filter((log) => String(log.empNo || '').trim() === String(req.emp_no || '').trim() && String(log.workDate || '').slice(0, 10) === reqDate);
      const rawDayLogs = dayLogs.filter((log) => !log.isManual);
      const sortedLogs = [...rawDayLogs].sort((a, b) => String(a.logTime || '').localeCompare(String(b.logTime || '')));
      const requestTime = formatKstTimePart(req.check_time);
      const requestCreatedAt = req.created_at
        ? new Date(req.created_at).toLocaleTimeString('ko-KR', {
            hour12: false,
            timeZone: 'Asia/Seoul',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-';
      const originalTime = isCheckinFix
        ? formatKstTimePart(sortedLogs[0]?.logTime)
        : isCheckoutFix
          ? formatKstTimePart(sortedLogs[sortedLogs.length - 1]?.logTime)
          : isScheduleRequest
            ? `${String(emp?.scheduleTime || emp?.baseScheduleTime || '-').substring(0, 5)}${String(emp?.scheduleEndTime || emp?.baseScheduleEndTime || '') ? ` - ${String(emp?.scheduleEndTime || emp?.baseScheduleEndTime || '').substring(0, 5)}` : ''}`
            : '';
      const displayRequestTime = isScheduleRequest
        ? `${String(requestMeta.scheduleStart || '').substring(0, 5) || '-'}${String(requestMeta.scheduleEnd || '').trim() ? ` - ${String(requestMeta.scheduleEnd || '').substring(0, 5)}` : ''}`
        : requestTime;
      const reasonText = String(requestMeta.reason || '').trim() || '-';

      return {
        req,
        emp,
        originalTime,
        requestTime: displayRequestTime,
        requestCreatedAt,
        isScheduleRequest,
        reasonText,
      };
    });
  }, [visibleManualCheckins, monthlyData?.allLogs, monthlyData?.allEmployees, data?.allEmployees]);

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
          <h3 className="card-title">수동 요청 내역</h3>
          <p className="card-subtitle">출퇴근 수정 요청과 근무일정 조정 요청을 함께 심사합니다.</p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '12px',
          marginBottom: '14px',
          padding: '14px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--bg-overlay-sm)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>시작일</label>
            <input
              type="date"
              value={manualDateFrom}
              onChange={(e) => setManualDateFrom(e.target.value)}
              className="form-input"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>종료일</label>
            <input
              type="date"
              value={manualDateTo}
              onChange={(e) => setManualDateTo(e.target.value)}
              className="form-input"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>상태</label>
            <select
              value={manualStatusFilter}
              onChange={(e) => setManualStatusFilter(e.target.value)}
              className="form-input"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            >
              <option value="all">전체</option>
              <option value="pending">대기중</option>
              <option value="approved">승인완료</option>
              <option value="rejected">반려됨</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>사원명</label>
            <input
              type="text"
              value={manualNameQuery}
              onChange={(e) => setManualNameQuery(e.target.value)}
              className="form-input"
              placeholder="이름 검색"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table manual-approval-table">
            <thead>
              <tr>
                <th>대상일자</th>
                <th>요청 시각</th>
                <th>사원명</th>
                <th>기록 구분</th>
                <th>수정 전 시간</th>
                <th>수정 요청 시간</th>
                <th style={{ width: '18%' }}>사유</th>
                <th>결재 상태</th>
                <th className="text-right">결정</th>
              </tr>
            </thead>
            <tbody>
              {(!visibleManualCheckins || visibleManualCheckins.length === 0) ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>
                    수동 출퇴근 기록 심사 요청 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                approvalRows.map((row, i) => {
                  const { req, emp, originalTime, requestTime, requestCreatedAt } = row;
                  return (
                    <tr key={i}>
                      <td className="table-compact-date">{req.work_date}</td>
                      <td className="table-compact-time">{requestCreatedAt}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp ? emp.name : '-'}</td>
                      <td>
                        <span className={'badge ' + (row.isScheduleRequest ? 'blue' : req.check_type === '출근' ? 'green' : 'gray')}>
                          {row.isScheduleRequest ? '근무일정조정' : req.check_type}
                        </span>
                      </td>
                      <td className="table-compact-time">{originalTime || '-'}</td>
                      <td className="table-compact-time" style={{ color: 'var(--blue)' }}>{requestTime}</td>
                      <td className="table-compact-note" style={{ maxWidth: '220px' }}>{row.reasonText}</td>
                      <td>
                        <span className={'badge ' + (
                          req.admin_decision === 'approved' ? 'blue' :
                          req.admin_decision === 'rejected' ? 'gray' : 'amber'
                        )}>
                          {req.admin_decision === 'approved' ? '승인완료' :
                           req.admin_decision === 'rejected' ? '반려됨' : '대기중'}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="manual-approval-actions">
                          {req.admin_decision === null && (
                            <>
                              <button
                                onClick={() => handleDecideCheckin(req.id, 'approved')}
                                className="manual-approval-btn manual-approval-btn--approve"
                              >
                                승인
                              </button>
                              <button
                                onClick={() => handleDecideCheckin(req.id, 'rejected')}
                                className="manual-approval-btn manual-approval-btn--reject"
                              >
                                반려
                              </button>
                            </>
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

export default memo(AdminPanelTabs);
