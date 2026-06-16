import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Trash2 } from 'lucide-react';
import { NIGHT_SCHEDULE_PRESETS, SERVICE2_NIGHT_SCHEDULE_DEPT, isService2NightScheduleDept } from '../lib/nightScheduleRules';

const formatMonthLabel = (yearMonth) => {
  const [year, month] = String(yearMonth || '').split('-');
  if (!year || !month) return '';
  return `${Number(year)}년 ${Number(month)}월`;
};

const formatDateLabel = (dateStr) => {
  if (!dateStr) return '-';
  const [year, month, day] = String(dateStr).split('-');
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
};

const resolvePreset = (presetCode) => NIGHT_SCHEDULE_PRESETS.find((preset) => preset.code === presetCode) || NIGHT_SCHEDULE_PRESETS[0];

export default function Service2NightSchedulePanel({
  month,
  patterns = [],
  onRefresh,
  canManage = false,
}) {
  const [workDate, setWorkDate] = useState('');
  const [presetCode, setPresetCode] = useState('N1');
  const [scheduleStart, setScheduleStart] = useState('18:00');
  const [scheduleEnd, setScheduleEnd] = useState('06:00');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const preset = resolvePreset(presetCode);
    if (preset.code !== 'OFF') {
      setScheduleStart(preset.start);
      setScheduleEnd(preset.end);
    } else {
      setScheduleStart('');
      setScheduleEnd('');
    }
  }, [presetCode]);

  const rows = useMemo(() => {
    return (patterns || [])
      .filter((row) => isService2NightScheduleDept(row?.dept_name))
      .sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')));
  }, [patterns]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!workDate) {
      alert('적용 날짜를 선택해 주세요.');
      return;
    }
    const preset = resolvePreset(presetCode);
    if (preset.code !== 'OFF' && !scheduleStart) {
      alert('시작 시간을 선택해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/employees/team-schedule-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deptName: SERVICE2_NIGHT_SCHEDULE_DEPT,
          workDate,
          patternCode: preset.code,
          patternName: preset.label,
          scheduleStart: scheduleStart || null,
          scheduleEnd: scheduleEnd || null,
          note,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNote('');
        if (preset.code !== 'OFF') {
          setPresetCode('N1');
        }
        onRefresh?.();
      } else {
        alert(json.error || '야간 근무패턴 저장에 실패했습니다.');
      }
    } catch (error) {
      alert('야간 근무패턴 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (workDateValue) => {
    if (!canManage) return;
    if (typeof window !== 'undefined' && !window.confirm('해당 날짜의 야간 근무패턴을 삭제하시겠습니까?')) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/employees/team-schedule-patterns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deptName: SERVICE2_NIGHT_SCHEDULE_DEPT,
          workDate: workDateValue,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onRefresh?.();
      } else {
        alert(json.error || '야간 근무패턴 삭제에 실패했습니다.');
      }
    } catch (error) {
      alert('야간 근무패턴 삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  return (
    <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card-header" style={{ paddingBottom: 0, borderBottom: 'none' }}>
        <div>
          <h3 className="card-title">서비스관리2팀 야간 근무패턴</h3>
          <p className="card-subtitle">
            관리자와 서비스관리1팀 팀장 겸임자만 설정할 수 있습니다.
          </p>
        </div>
        <div className="db-indicator" style={{ borderColor: 'var(--border)' }}>
          <Clock3 style={{ width: 14, height: 14, color: 'var(--purple)' }} />
          <span className="db-name">{formatMonthLabel(month)}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label">적용 날짜</label>
            <input
              type="date"
              className="form-input"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label">패턴</label>
            <select className="ui-select" value={presetCode} onChange={(e) => setPresetCode(e.target.value)}>
              {NIGHT_SCHEDULE_PRESETS.map((preset) => (
                <option key={preset.code} value={preset.code}>{preset.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label">출근 시간</label>
            <input
              type="time"
              className="form-input"
              value={scheduleStart}
              onChange={(e) => setScheduleStart(e.target.value)}
              disabled={presetCode === 'OFF'}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label">퇴근 시간</label>
            <input
              type="time"
              className="form-input"
              value={scheduleEnd}
              onChange={(e) => setScheduleEnd(e.target.value)}
              disabled={presetCode === 'OFF'}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label">메모</label>
            <input
              type="text"
              className="form-input"
              placeholder="예: 20시 출근, 08시 퇴근"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button type="submit" className="login-btn" disabled={saving}>
            {saving ? '저장 중...' : '패턴 저장'}
          </button>
        </div>
      </form>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>적용 날짜</th>
              <th>패턴</th>
              <th>시간</th>
              <th>메모</th>
              <th className="text-right">삭제</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '28px' }}>
                  아직 등록된 야간 근무패턴이 없습니다.
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={`${row.dept_name}-${row.work_date}`}>
                <td style={{ fontWeight: 700 }}>{formatDateLabel(row.work_date)}</td>
                <td>{row.pattern_name || row.pattern_code || '-'}</td>
                <td>
                  {row.schedule_start ? String(row.schedule_start).substring(0, 5) : '-'}
                  {' ~ '}
                  {row.schedule_end ? String(row.schedule_end).substring(0, 5) : '-'}
                </td>
                <td style={{ color: 'var(--text-2)' }}>{row.note || '-'}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="ui-btn"
                    style={{ padding: '7px 12px', color: 'var(--red)' }}
                    onClick={() => handleDelete(row.work_date)}
                    disabled={saving}
                  >
                    <Trash2 size={14} style={{ marginRight: '6px' }} />
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
