'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CarTaxiFront, Send, Upload, X } from 'lucide-react';
import EmployeeAdminShell from '../employees/EmployeeAdminShell';

function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function formatDateTime(value) {
  if (!value || value === '-') return '-';
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
}

function formatCurrency(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  const num = Number(text);
  if (!Number.isFinite(num)) return text || '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

export default function TaxiAuditPage() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [password, setPassword] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const summary = useMemo(() => {
    const employees = new Set(rows.map((row) => row.employeeName).filter(Boolean));
    return {
      total: rows.length,
      employees: employees.size,
    };
  }, [rows]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setNotice('');
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', password);

      const res = await fetch('/api/admin/taxi-audit/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '파일을 불러오지 못했습니다.');

      setRows(json.rows || []);
      setNotice(json.message || `"${file.name}" 파일을 불러왔습니다.`);
    } catch (err) {
      setRows([]);
      setError(err?.message || '파일을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const resetFile = () => {
    setRows([]);
    setFileName('');
    setError('');
    setNotice('');
    setSendingId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const requestExplanation = async (row) => {
    if (!row?.empNo) {
      setError('직원 정보를 찾지 못했습니다.');
      return;
    }

    const confirmed = window.confirm(
      `${row.employeeName || row.empNo}에게 소명 요청 메일을 바로 발송할까요?`,
    );
    if (!confirmed) return;

    setSendingId(row.id);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/admin/taxi-audit/send-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ row }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '소명 요청 메일 발송에 실패했습니다.');
      setNotice(json.message || '소명 요청 메일을 발송했습니다.');
    } catch (err) {
      setError(err?.message || '소명 요청 메일 발송에 실패했습니다.');
    } finally {
      setSendingId('');
    }
  };

  return (
    <EmployeeAdminShell
      title="택시 이용내역"
      subtitle="22시 이후 또는 새벽 택시 이용 내역 중 실제 퇴근이 22시 이전인 건만 보여줍니다. 암호를 푼 파일을 바로 올리면 됩니다."
      activeHref="/admin/taxi-audit"
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--blue)',
              }}
            >
              <CarTaxiFront size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>파일 업로드</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                비밀번호가 걸린 이용내역 파일을 업로드하면 실제 소명 대상만 바로 확인할 수 있습니다.
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--bg-overlay-sm)',
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>파일 비밀번호(선택)</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="암호 해제 파일이면 비워도 됩니다"
                  className="search-input"
                  style={{ maxWidth: 260 }}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {fileName || '파일을 선택해 주세요'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    암호를 푼 이용내역 파일을 올리면 직원명, 탑승일시, 실제 퇴근시간, 결제금액을 자동으로 매칭합니다.
                  </div>
                </div>
                {fileName ? <Badge tone="blue">업로드 완료</Badge> : <Badge tone="gray">대기</Badge>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="login-btn" onClick={openFilePicker} style={{ marginTop: 0 }}>
                <Upload size={16} />
                파일 선택
              </button>
              <button
                type="button"
                className="tab-btn"
                onClick={resetFile}
                disabled={!rows.length && !fileName}
                style={{ minHeight: 42 }}
              >
                <X size={14} />
                초기화
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Badge tone="purple">총 {summary.total}건</Badge>
            <Badge tone="green">직원 {summary.employees}명</Badge>
            <Badge tone="amber">실제 퇴근 22시 이전만 표시</Badge>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>00~05시는 전날 퇴근 기록 기준으로 맞춥니다.</div>
            {notice ? <div style={{ fontSize: 12, color: 'var(--blue)' }}>{notice}</div> : null}
            {error ? (
              <div style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} />
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>소명 대상 목록</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                22시 이후 또는 새벽 택시 이용 중, 실제 퇴근이 22시 이전인 경우만 보여줍니다.
              </div>
            </div>
            <Badge tone="gray">{loading ? '불러오는 중...' : '목록 보기'}</Badge>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '68vh', overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-2)' }}>파일을 분석하는 중입니다...</div>
            ) : rows.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  borderRadius: 12,
                  background: 'var(--bg-overlay-sm)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                }}
              >
                아직 업로드된 파일이 없습니다. 상단에서 파일을 선택해 주세요.
              </div>
            ) : (
              <table className="table" style={{ minWidth: 1120, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>탑승일시</th>
                    <th style={{ width: 120 }}>직원명</th>
                    <th style={{ width: 120 }}>실제 퇴근시간</th>
                    <th>이용사유</th>
                    <th style={{ width: 120 }}>결제금액</th>
                    <th style={{ width: 140 }}>소명요청</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="time-display" style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                        {formatDateTime(row.rideTime)}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>{row.employeeName || '-'}</td>
                      <td className="time-display" style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                        {row.actualOutTime || '-'}
                      </td>
                      <td style={{ color: 'var(--text-2)', lineHeight: 1.45, fontWeight: 400 }}>
                        {row.reason || '-'}
                      </td>
                      <td className="time-display" style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="tab-btn"
                          onClick={() => requestExplanation(row)}
                          disabled={sendingId === row.id}
                          style={{
                            padding: '7px 12px',
                            minHeight: 36,
                            borderColor: 'rgba(59, 130, 246, 0.18)',
                            color: 'var(--blue)',
                            background: 'rgba(59, 130, 246, 0.08)',
                            boxShadow: 'none',
                            opacity: sendingId === row.id ? 0.7 : 1,
                          }}
                        >
                          <Send size={14} />
                          {sendingId === row.id ? '발송중' : '소명요청'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </EmployeeAdminShell>
  );
}
