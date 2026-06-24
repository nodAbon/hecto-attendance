'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CarTaxiFront, RefreshCcw, Search, Send, Upload, X } from 'lucide-react';
import EmployeeAdminShell from '../employees/EmployeeAdminShell';
import { getKstDateKey, shiftKstDateKey } from '@/lib/kstDate';

function Badge({ children, tone = 'gray' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function formatDateTime(value) {
  if (!value || value === '-') return '-';
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
}

function formatCurrency(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  const num = Number(text);
  if (!Number.isFinite(num)) return text || '-';
  return new Intl.NumberFormat('ko-KR').format(Math.round(num));
}

function normalizeKeyword(value) {
  return String(value || '').trim().toLowerCase();
}

function isNumericKeyword(value) {
  return /^\d+$/.test(String(value || '').trim());
}

export default function TaxiAuditPage() {
  const legacyFileInputRef = useRef(null);

  const today = getKstDateKey();
  const initialStart = shiftKstDateKey(today, -10);

  const [queryStartDate, setQueryStartDate] = useState(initialStart);
  const [queryEndDate, setQueryEndDate] = useState(today);
  const [searchText, setSearchText] = useState('');
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('kakao');
  const [queryMeta, setQueryMeta] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [legacyFileName, setLegacyFileName] = useState('');
  const [legacyPassword, setLegacyPassword] = useState('');
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [sendingId, setSendingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const displayRows = useMemo(() => {
    const keyword = normalizeKeyword(searchText);
    if (!keyword) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.employeeName,
        row.empNo,
        row.memberIdentifier,
        row.dept,
        row.reason,
        row.rideTime,
        row.rideTimeRaw,
        row.actualOutTime,
        row.pickup,
        row.dropoff,
        row.callTime,
        row.ticketNo,
        row.orderId,
        row.amount,
      ]
        .map((item) => normalizeKeyword(item))
        .join(' ');
      return haystack.includes(keyword);
    });
  }, [rows, searchText]);

  const summary = useMemo(() => {
    const employeeCount = new Set(displayRows.map((row) => row.employeeName).filter(Boolean)).size;
    return {
      total: rows.length,
      visible: displayRows.length,
      employees: employeeCount,
    };
  }, [rows, displayRows]);

  const resetQuery = () => {
    setQueryStartDate(initialStart);
    setQueryEndDate(today);
    setSearchText('');
    setRows([]);
    setMode('kakao');
    setQueryMeta(null);
    setError('');
    setNotice('');
  };

  const runKakaoQuery = async (event) => {
    event.preventDefault();
    setQueryLoading(true);
    setError('');
    setNotice('');

    try {
      const memberIdentifier = isNumericKeyword(searchText) ? String(searchText).trim() : '';
      const res = await fetch('/api/admin/taxi-audit/kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: queryStartDate,
          endDate: queryEndDate,
          memberIdentifier,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '카카오T 내역을 불러오지 못했습니다.');

      setRows(Array.isArray(json.rows) ? json.rows : []);
      setMode('kakao');
      setQueryMeta(json.meta || null);
      setNotice('이름 검색은 결과 내 필터로 동작합니다.');
    } catch (err) {
      setRows([]);
      setQueryMeta(null);
      setError(err?.message || '카카오T 내역을 불러오지 못했습니다.');
    } finally {
      setQueryLoading(false);
    }
  };

  const openLegacyFilePicker = () => legacyFileInputRef.current?.click();

  const resetLegacyUpload = () => {
    setLegacyFileName('');
    setLegacyPassword('');
    setError('');
    setNotice('');
    if (legacyFileInputRef.current) legacyFileInputRef.current.value = '';
    if (mode === 'legacy') {
      setRows([]);
      setQueryMeta(null);
      setMode('kakao');
    }
  };

  const handleLegacyFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLegacyLoading(true);
    setError('');
    setNotice('');
    setLegacyFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', legacyPassword);

      const res = await fetch('/api/admin/taxi-audit/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '업로드 파일을 미리 볼 수 없습니다.');

      setRows(Array.isArray(json.rows) ? json.rows : []);
      setMode('legacy');
      setQueryMeta({ sheetName: json.sheetName || '', headers: json.headers || [] });
      setNotice('업로드한 파일도 이름 검색은 결과 내 필터로 동작합니다.');
    } catch (err) {
      setRows([]);
      setQueryMeta(null);
      setError(err?.message || '업로드 파일을 미리 볼 수 없습니다.');
    } finally {
      setLegacyLoading(false);
    }
  };

  const requestExplanation = async (row) => {
    if (!row?.empNo && !row?.memberIdentifier) {
      setError('직원 식별 정보를 찾을 수 없습니다.');
      return;
    }

    const confirmed = window.confirm(
      `${row.employeeName || row.empNo || row.memberIdentifier}에게 소명 요청 메일을 보내시겠습니까?`,
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
      if (!res.ok) throw new Error(json.error || '소명 요청 메일을 보내지 못했습니다.');

      setNotice(json.message || '소명 요청 메일을 보냈습니다.');
    } catch (err) {
      setError(err?.message || '소명 요청 메일을 보내지 못했습니다.');
    } finally {
      setSendingId('');
    }
  };

  return (
    <EmployeeAdminShell
      title="소명 관리"
      subtitle="카카오T 비즈니스 이용내역을 기준으로 22시 이후 탑승했지만 실제 퇴근이 22시 이전인 것만 보여줍니다."
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
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>소명 관리</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                카카오T 비즈니스 이용내역을 기준으로 22시 이후 탑승했지만 실제 퇴근이 22시 이전인 것만 보여줍니다.
              </div>
            </div>
          </div>

          <form
            onSubmit={runKakaoQuery}
            style={{
              display: 'grid',
              gap: 12,
              padding: 12,
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--bg-overlay-sm)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '160px 160px minmax(220px, 1fr) auto', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>시작일</span>
                <input
                  type="date"
                  className="search-input"
                  value={queryStartDate}
                  onChange={(e) => setQueryStartDate(e.target.value)}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>종료일</span>
                <input
                  type="date"
                  className="search-input"
                  value={queryEndDate}
                  onChange={(e) => setQueryEndDate(e.target.value)}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>이름 검색</span>
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="결과 내 필터"
                  className="search-input"
                />
              </label>

              <button
                type="submit"
                className="login-btn"
                disabled={queryLoading}
                style={{ minWidth: 122, height: 42, whiteSpace: 'nowrap' }}
              >
                <Search size={16} />
                {queryLoading ? '조회 중...' : '카카오T 조회'}
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Badge tone="amber">22시 이후 탑승 / 22시 이전 퇴근만 표시</Badge>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>이름 검색은 결과 내 필터로 동작합니다.</div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button type="button" className="tab-btn" onClick={resetQuery} style={{ minHeight: 40 }}>
                <RefreshCcw size={14} />
                초기화
              </button>
            </div>
          </form>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>조회 방식</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>
                {mode === 'kakao' ? '카카오T API' : '업로드 파일'}
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>보이는 건수</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>{summary.visible}건</div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>전체 건수</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>{summary.total}건</div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>매칭 직원 수</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 6 }}>{summary.employees}명</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {queryMeta?.startDate && queryMeta?.endDate ? (
              <Badge tone="purple">
                {queryMeta.startDate} ~ {queryMeta.endDate}
              </Badge>
            ) : null}
            {notice ? <div style={{ fontSize: 12, color: 'var(--blue)' }}>{notice}</div> : null}
            {error ? (
              <div style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} />
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <details className="card" style={{ padding: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            업로드 파일로 조회
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              업로드한 엑셀 파일도 같은 기준으로 필터링합니다. 소명 대상이 되는 22시 이후 탑승, 22시 이전 퇴근 건만 표시합니다.
            </div>

            <input
              ref={legacyFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              onChange={handleLegacyFileChange}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-overlay-sm)' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>파일 비밀번호</span>
                  <input
                    value={legacyPassword}
                    onChange={(e) => setLegacyPassword(e.target.value)}
                    placeholder="암호화된 파일일 때만 입력"
                    className="search-input"
                    style={{ maxWidth: 260 }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      {legacyFileName || '업로드된 파일이 없습니다.'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      파일을 선택하면 22시 이후 탑승 / 22시 이전 퇴근 대상만 표시합니다.
                    </div>
                  </div>
                  {legacyFileName ? <Badge tone="blue">업로드 완료</Badge> : <Badge tone="gray">대기</Badge>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="login-btn" onClick={openLegacyFilePicker} style={{ marginTop: 0 }}>
                  <Upload size={16} />
                  파일 선택
                </button>
                <button
                  type="button"
                  className="tab-btn"
                  onClick={resetLegacyUpload}
                  disabled={!rows.length && !legacyFileName}
                  style={{ minHeight: 42 }}
                >
                  <X size={14} />
                  초기화
                </button>
              </div>
            </div>
          </div>
        </details>

        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>소명 대상 목록</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                카카오T 비즈니스 이용내역을 기준으로 22시 이후 탑승이면서 실제 퇴근이 22시 이전인 건만 표시합니다.
              </div>
            </div>
            <Badge tone={mode === 'kakao' ? 'blue' : 'gray'}>{queryLoading || legacyLoading ? '조회 중...' : '표시 중'}</Badge>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '68vh', overflow: 'auto' }}>
            {queryLoading || legacyLoading ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-2)' }}>불러오는 중입니다...</div>
            ) : displayRows.length === 0 ? (
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
                조회된 소명 대상이 없습니다. 날짜 범위나 이름 검색 필터를 다시 확인해 주세요.
              </div>
            ) : (
              <table className="table" style={{ minWidth: 1160, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>탑승일시</th>
                    <th style={{ width: 200 }}>직원명</th>
                    <th style={{ width: 140 }}>실제 퇴근시간</th>
                    <th>이용사유</th>
                    <th style={{ width: 130 }}>결제금액</th>
                    <th style={{ width: 140 }}>소명요청</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: 'var(--text-1)' }}>
                          {formatDateTime(row.rideTime || row.rideTimeRaw)}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-1)' }}>
                        <div style={{ fontWeight: 600 }}>{row.employeeName || '-'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{row.dept || '-'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                          {formatDateTime(row.actualOutTime || '-')}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-2)', lineHeight: 1.45, fontWeight: 400 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{row.reason || '-'}</div>
                        {(row.pickup || row.dropoff || row.callTime) ? (
                          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-2)' }}>
                            {row.pickup || row.dropoff ? `${row.pickup || '-'} → ${row.dropoff || '-'}` : row.callTime || '-'}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                        {formatCurrency(row.amount)}
                        </div>
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
                          {sendingId === row.id ? '전송 중...' : '소명요청'}
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
