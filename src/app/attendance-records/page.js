'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, RefreshCw, RotateCcw, Save, Search, Sun } from 'lucide-react';
import AppSidebar from '../../components/AppSidebar';
import { formatClockTime } from '../../lib/clock';
import { getMainSidebarItems, sidebarActionIcons } from '../../lib/sidebarConfig';
import { isAdminRole, isExecutivePosition, isLeaderPosition } from '../../lib/roleUtils';
import { usePersistentTheme } from '../../lib/usePersistentTheme';
import { uiText } from '../../lib/uiText';

const COPY = uiText.attendanceRecords;
const COMMON = uiText.common;
const DASHBOARD_COPY = uiText.page.dashboard;

const getLocalDateInput = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const getMonthStart = (date = new Date()) => `${getLocalDateInput(date).slice(0, 7)}-01`;

const normalizeText = (value = '') => String(value || '').trim().toLowerCase();

const getSourceLabel = (source = '') => {
  const normalized = normalizeText(source);
  if (normalized === 'caps') return '캡스';
  if (normalized === 'secom') return '세콤';
  if (normalized === 'manual') return '수동';
  return source || '-';
};

const buildDraft = (log) => ({
  workDate: log.workDate || log.rawWorkDate || '',
  adjustedRole: log.adjustedRole || '',
  note: log.adjustmentNote || '',
});

export default function AttendanceRecordsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = usePersistentTheme('dark');
  const [time, setTime] = useState('');
  const [profile, setProfile] = useState({
    name: '',
    rank: '',
    loginId: '',
    empNo: '',
    team: '',
    position: '',
    isAdmin: false,
  });
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpNo, setSelectedEmpNo] = useState('');
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(getLocalDateInput());
  const [logs, setLogs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMounted(true);
    const tick = () => setTime(formatClockTime(new Date()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const syncProfile = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();
        if (!json?.success || !json.user) {
          router.push('/login');
          return;
        }

        const nextProfile = {
          name: json.user.name || '',
          rank: json.user.rank || '',
          loginId: json.user.loginId || '',
          empNo: json.user.empNo || '',
          team: json.user.team || '',
          position: json.user.position || '',
          isAdmin: !!json.user.isAdmin,
        };

        const allowed = nextProfile.isAdmin || isLeaderPosition(nextProfile.position) || isExecutivePosition(nextProfile.position) || isAdminRole(nextProfile);
        if (!allowed) {
          router.push('/');
          return;
        }

        setProfile(nextProfile);
        localStorage.setItem('user-name', nextProfile.name);
        localStorage.setItem('user-rank', nextProfile.rank);
        localStorage.setItem('user-login-id', nextProfile.loginId);
        localStorage.setItem('user-emp-no', nextProfile.empNo);
        localStorage.setItem('user-team', nextProfile.team);
        localStorage.setItem('user-position', nextProfile.position);
        localStorage.setItem('user-is-admin', String(nextProfile.isAdmin));
      } catch {
        router.push('/login');
      }
    };

    syncProfile();
  }, [mounted, router]);

  useEffect(() => {
    if (!mounted) return;
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, fromDate, toDate, profile.isAdmin, profile.position, profile.empNo]);

  useEffect(() => {
    if (!selectedEmpNo) {
      setLogs([]);
      setDrafts({});
      return;
    }
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpNo, fromDate, toDate]);

  const filteredEmployees = useMemo(() => {
    const q = normalizeText(searchQuery);
    return (employees || []).filter((employee) => {
      if (!q) return true;
      return normalizeText(`${employee.name} ${employee.emp_no} ${employee.dept || ''}`).includes(q);
    });
  }, [employees, searchQuery]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.emp_no) === String(selectedEmpNo)) || null,
    [employees, selectedEmpNo],
  );

  const summary = useMemo(() => {
    return {
      total: logs.length,
      adjusted: logs.filter((log) => log.isAdjusted).length,
      checkin: logs.filter((log) => log.adjustedRole === COPY.roleCheckin).length,
      checkout: logs.filter((log) => log.adjustedRole === COPY.roleCheckout).length,
      ignored: logs.filter((log) => log.adjustedRole === COPY.roleIgnore).length,
    };
  }, [logs]);

  const sidebarItems = useMemo(() => {
    return getMainSidebarItems({
      isAdmin: profile.isAdmin,
      isLeader: isLeaderPosition(profile.position),
      position: profile.position,
      dept: profile.team,
    }).map((item) => {
      const tabMatch = item.href?.match(/\?tab=([A-Z_]+)/);
      const itemTab = tabMatch ? tabMatch[1] : null;
      return {
        ...item,
        active: item.href === '/attendance-records' || item.activeHref === '/attendance-records',
        onClick: () => router.push(item.href),
        href: itemTab ? undefined : item.href,
      };
    });
  }, [profile, router]);

  const profileBadges = useMemo(() => {
    const badges = [];
    if (profile.isAdmin) {
      badges.push({ label: uiText.sidebar.adminBadge, background: 'var(--red)', color: '#fff' });
    }
    if (isLeaderPosition(profile.position) || isExecutivePosition(profile.position)) {
      badges.push({ label: uiText.sidebar.leaderBadge, background: 'var(--amber)', color: '#fff' });
    }
    return badges;
  }, [profile.isAdmin, profile.position]);

  const footerActions = useMemo(() => ([
    {
      label: uiText.sidebar.logout,
      icon: sidebarActionIcons.logout,
      onClick: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.removeItem('user-is-admin');
        localStorage.removeItem('user-position');
        localStorage.removeItem('user-emp-no');
        localStorage.removeItem('user-name');
        localStorage.removeItem('user-rank');
        localStorage.removeItem('user-login-id');
        localStorage.removeItem('user-team');
        router.push('/login');
      },
      color: 'var(--red)',
    },
    {
      label: uiText.sidebar.mypage,
      icon: sidebarActionIcons.mypage,
      href: '/mypage',
      color: 'var(--blue)',
    },
  ]), [router]);

  async function loadEmployees() {
    try {
      setLoadingEmployees(true);
      setError('');
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetch(`/api/attendance-records?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || COPY.employeeLoadFail);
      setEmployees(json.employees || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function loadLogs() {
    if (!selectedEmpNo) return;
    try {
      setLoadingLogs(true);
      setError('');
      setMessage('');
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        empNo: selectedEmpNo,
      });
      const res = await fetch(`/api/attendance-records?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || COPY.loading);
      setEmployees(json.employees || []);
      setLogs(json.logs || []);
      const nextDrafts = {};
      (json.logs || []).forEach((log) => {
        nextDrafts[String(log.id)] = buildDraft(log);
      });
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err.message);
      setLogs([]);
      setDrafts({});
    } finally {
      setLoadingLogs(false);
    }
  }

  const updateDraft = (logId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [String(logId)]: {
        ...(prev[String(logId)] || {}),
        ...patch,
      },
    }));
  };

  const resetDraft = async (log) => {
    const confirmed = window.confirm(COPY.deleteConfirm);
    if (!confirmed) return;

    try {
      setSavingId(log.id);
      const res = await fetch('/api/attendance-records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ attendanceId: log.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || COPY.saveError);
      setMessage(json.message || COPY.saveSuccess);
      await loadLogs();
      window.dispatchEvent(new Event('attendance-adjustments-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const saveDraft = async (log) => {
    const draft = drafts[String(log.id)] || buildDraft(log);
    const role = String(draft.adjustedRole || '').trim();
    const workDate = String(draft.workDate || '').trim();
    const note = String(draft.note || '').trim();

    if (!workDate) {
      setError(COPY.workDateRequired);
      return;
    }

    try {
      setSavingId(log.id);
      setError('');
      setMessage('');

      if (!role || role === COPY.roleAuto) {
        const res = await fetch('/api/attendance-records', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ attendanceId: log.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || COPY.saveError);
        setMessage(json.message || COPY.saveSuccess);
      } else {
        const res = await fetch('/api/attendance-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            attendanceId: log.id,
            empNo: log.empNo,
            workDate,
            adjustedRole: role,
            note,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || COPY.saveError);
        setMessage(json.message || COPY.saveSuccess);
      }

      await loadLogs();
      window.dispatchEvent(new Event('attendance-adjustments-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="ga-theme">
      <AppSidebar
        items={sidebarItems}
        profile={mounted ? {
          name: profile.name || '',
          rank: profile.rank || '',
          loginId: profile.loginId || '',
          empNo: profile.empNo || '',
          team: profile.team || '',
        } : {
          name: '',
          rank: '',
          loginId: '',
          empNo: '',
          team: '',
        }}
        profileBadges={profileBadges}
        footerActions={footerActions}
        version="v2.1.0"
      />

      <main className="main-content">
        <div className="top-bar">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{COPY.title}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, marginTop: 2 }}>{COPY.subtitle}</p>
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={loadLogs} title={COPY.loadButton}>
              <RefreshCw style={{ width: 15, height: 15 }} />
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? DASHBOARD_COPY.lightModeTooltip : DASHBOARD_COPY.darkModeTooltip}>
              {theme === 'dark' ? <Sun style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
            </button>
            <div className="time-display">{time}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.2fr) repeat(2, minmax(140px, 0.7fr)) auto', gap: 12, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{COPY.employeeLabel}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={COPY.searchPlaceholder}
                  style={{ paddingLeft: 34 }}
                />
                <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-2)' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{COPY.fromLabel}</label>
              <input className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{COPY.toLabel}</label>
              <input className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <button type="button" className="login-btn" style={{ marginTop: 0, padding: '11px 16px', background: 'var(--blue)', color: '#fff' }} onClick={loadLogs} disabled={loadingEmployees || loadingLogs}>
              <RefreshCw size={16} />
              {COPY.loadButton}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, marginTop: 14, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>{COPY.employeeLabel}</label>
              <select
                className="form-input"
                value={selectedEmpNo}
                onChange={(e) => setSelectedEmpNo(e.target.value)}
              >
                <option value="">{loadingEmployees ? COMMON.loading : COPY.employeePrompt}</option>
                {filteredEmployees.map((employee) => (
                  <option key={employee.emp_no} value={employee.emp_no}>
                    {employee.name} ({employee.emp_no}) {employee.dept ? `- ${employee.dept}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge blue">{`${COPY.summary.total}: ${summary.total}`}</span>
              <span className="badge amber">{`${COPY.summary.adjusted}: ${summary.adjusted}`}</span>
              <span className="badge green">{`${COPY.summary.checkin}: ${summary.checkin}`}</span>
              <span className="badge purple">{`${COPY.summary.checkout}: ${summary.checkout}`}</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 16, marginBottom: 16, color: 'var(--red)' }}>{error}</div>
        ) : null}

        {message ? (
          <div className="card" style={{ padding: 16, marginBottom: 16, color: 'var(--green)', fontWeight: 700 }}>{message}</div>
        ) : null}

        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid var(--border)', padding: '16px 18px', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
                {selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.emp_no})` : COPY.title}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                {selectedEmployee?.dept || COPY.employeePrompt}
              </p>
            </div>
          </div>

          <div className="table-wrapper">
            {loadingLogs ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>{COPY.loading}</div>
            ) : !selectedEmpNo ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>{COPY.employeePrompt}</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>{COPY.empty}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{COPY.logTable.time}</th>
                    <th>{COPY.logTable.workDate}</th>
                    <th>{COPY.logTable.role}</th>
                    <th>{COPY.logTable.source}</th>
                    <th>{COPY.logTable.note}</th>
                    <th>{COPY.logTable.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const draft = drafts[String(log.id)] || buildDraft(log);
                    const changed = draft.workDate !== log.rawWorkDate || draft.adjustedRole !== (log.adjustedRole || '') || draft.note !== (log.adjustmentNote || '');

                    return (
                      <tr key={log.id} style={log.isAdjusted ? { background: 'rgba(251, 191, 36, 0.08)' } : undefined}>
                        <td>
                          <div style={{ fontWeight: 800 }}>{log.logTime}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{log.rawWorkDate}</div>
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <input
                            className="form-input"
                            type="date"
                            value={draft.workDate || ''}
                            onChange={(e) => updateDraft(log.id, { workDate: e.target.value })}
                          />
                          {log.isAdjusted ? (
                            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6, fontWeight: 700 }}>
                              {log.adjustedRole || COPY.roleAuto}
                              {log.adjustmentNote ? ` · ${log.adjustmentNote}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <select
                            className="form-input"
                            value={draft.adjustedRole || ''}
                            onChange={(e) => updateDraft(log.id, { adjustedRole: e.target.value })}
                          >
                            <option value="">{COPY.roleAuto}</option>
                            <option value={COPY.roleCheckin}>{COPY.roleCheckin}</option>
                            <option value={COPY.roleCheckout}>{COPY.roleCheckout}</option>
                            <option value={COPY.roleIgnore}>{COPY.roleIgnore}</option>
                          </select>
                        </td>
                        <td>
                          <span className="badge gray">{getSourceLabel(log.source)}</span>
                        </td>
                        <td style={{ minWidth: 220 }}>
                          <input
                            className="form-input"
                            value={draft.note || ''}
                            onChange={(e) => updateDraft(log.id, { note: e.target.value })}
                            placeholder={COPY.notePlaceholder}
                          />
                        </td>
                        <td style={{ minWidth: 170 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="login-btn"
                              style={{ marginTop: 0, padding: '9px 12px', background: 'var(--blue)', color: '#fff' }}
                              onClick={() => saveDraft(log)}
                              disabled={savingId === log.id}
                            >
                              <Save size={15} /> {savingId === log.id ? COMMON.loading : COPY.save}
                            </button>
                            <button
                              type="button"
                              className="login-btn"
                              style={{ marginTop: 0, padding: '9px 12px', background: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-1)' }}
                              onClick={() => {
                                if (log.isAdjusted) {
                                  resetDraft(log);
                                  return;
                                }
                                updateDraft(log.id, { workDate: log.rawWorkDate, adjustedRole: '', note: '' });
                              }}
                              disabled={savingId === log.id}
                            >
                              <RotateCcw size={15} /> {COPY.reset}
                            </button>
                          </div>
                          {changed ? (
                            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6, fontWeight: 700 }}>
                              {COPY.save}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
