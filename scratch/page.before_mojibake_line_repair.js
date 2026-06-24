'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users, UserCheck, Clock, ShieldAlert, RefreshCw,
  Search, CalendarDays, Database, LogOut,
  LayoutDashboard, AlertTriangle, UserX, CheckCircle,
  Bell, HelpCircle, TrendingUp, MoreVertical, Sun, Moon, User,
  Calendar, Check, ChevronLeft, ChevronDown, AlertCircle,
  ChevronRight,
  Edit, Trash2, Plus, Upload, ShieldAlert as AdminIcon
} from 'lucide-react';
import AppSidebar from '../components/AppSidebar';
import { getMainSidebarItems, sidebarActionIcons } from '../lib/sidebarConfig';
import { formatClockTime } from '../lib/clock';
import { usePersistentTheme } from '../lib/usePersistentTheme';

// ?? Donut Chart ??????????????????????????????????????????????
function toXY(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({ segments }) {
  const centerX = 80, centerY = 80, outerR = 66, innerR = 46, gap = 4;
  const total = segments.reduce((s, d) => s + (d.value || 0), 0);

  if (total === 0) {
    return (
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx={centerX} cy={centerY} r={(outerR + innerR) / 2} fill="none"
          style={{ stroke: 'var(--bg-overlay-md)' }} strokeWidth={outerR - innerR} />
      </svg>
    );
  }

  const nonZero = segments.filter(s => (s.value || 0) > 0);
  const gapTotal = nonZero.length * gap;
  const arcs = nonZero.reduce((acc, seg) => {
    const sweep = (seg.value / total) * (360 - gapTotal);
    const start = acc.length === 0 ? 0 : acc[acc.length - 1].end + gap;
    const end = start + sweep;
    acc.push({ ...seg, start, end });
    return acc;
  }, []);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx={centerX} cy={centerY} r={(outerR + innerR) / 2} fill="none"
        style={{ stroke: 'var(--bg-overlay-md)' }} strokeWidth={outerR - innerR} />
      {arcs.map((arc, i) => {
        const sweep = arc.end - arc.start;
        const os = toXY(centerX, centerY, outerR, arc.start);
        const oe = toXY(centerX, centerY, outerR, arc.end);
        const ie = toXY(centerX, centerY, innerR, arc.end);
        const is_ = toXY(centerX, centerY, innerR, arc.start);
        const lg = sweep > 180 ? 1 : 0;
        const d = [
          'M ' + os.x.toFixed(2) + ' ' + os.y.toFixed(2),
          'A ' + outerR + ' ' + outerR + ' 0 ' + lg + ' 1 ' + oe.x.toFixed(2) + ' ' + oe.y.toFixed(2),
          'L ' + ie.x.toFixed(2) + ' ' + ie.y.toFixed(2),
          'A ' + innerR + ' ' + innerR + ' 0 ' + lg + ' 0 ' + is_.x.toFixed(2) + ' ' + is_.y.toFixed(2),
          'Z',
        ].join(' ');
        return <path key={i} d={d} fill={arc.color} />;
      })}
    </svg>
  );
}

// ?? Helpers for Monthly/Tracker ??????????????????????????????
const getDaysInMonth = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const days = [];
  while (date.getMonth() === month - 1) {
    const dayNum = date.getDate();
    const dayOfWeek = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    days.push({
      dateStr: year + '-' + String(month).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0'),
      formatted: month + '/' + dayNum + '(' + dayOfWeek + ')',
      dayOfWeek,
      dayNum
    });
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const getCalendarCells = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0: Sun, 6: Sat
  const totalDays = new Date(year, month, 0).getDate();
  
  const cells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ empty: true });
  }
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    cells.push({ empty: false, dayNum: d, dateStr });
  }
  return cells;
};

const getMonthsList = () => {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    list.push(yr + '-' + mo);
  }
  return list;
};

const SCHEDULE_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return h + ':' + m;
});

const getCookieValue = (name) => {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
};

const normalizeDeptName = (value) => String(value ?? '').trim();

const getAttendanceTimePart = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const timeText = text.includes(' ')
    ? text.split(' ')[1]
    : text.includes('T')
      ? text.split('T')[1]
      : text;
  return timeText.substring(0, 5);
};

const getEmployeeDept = (emp) => normalizeDeptName(emp?.dept || emp?.team || '');

const matchesDeptFilter = (dept, filter) => {
  const normalizedFilter = normalizeDeptName(filter);
  return !normalizedFilter || normalizedFilter === 'ALL' || normalizeDeptName(dept) === normalizedFilter;
};

const filterEmployeesByDept = (employees = [], filter = 'ALL') => {
  if (!Array.isArray(employees)) return [];
  const normalizedFilter = normalizeDeptName(filter);
  if (!normalizedFilter || normalizedFilter === 'ALL') return employees;
  return employees.filter((emp) => matchesDeptFilter(getEmployeeDept(emp), normalizedFilter));
};

function calculateWorkHours(inTime, outTime) {
  if (!inTime || !outTime || outTime === '-') return null;
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  if (diffMinutes < 0) return null;
  const h = Math.floor(diffMinutes / 60);
  const m = diffMinutes % 60;
  return h + '시간 ' + m + '분';
}

function calculateOvertime(inTimeOrOutTime, outTimeMaybe, threshold = '19:00') {
  const hasInTime = typeof outTimeMaybe === 'string';
  const inTime = hasInTime ? inTimeOrOutTime : null;
  const outTime = hasInTime ? outTimeMaybe : inTimeOrOutTime;

  if (!outTime || outTime === '-') return null;

  const [outH, outM] = outTime.split(':').map(Number);
  const [tH, tM] = threshold.split(':').map(Number);
  const outTotal = outH * 60 + outM;
  const tTotal = tH * 60 + tM;

  if (!hasInTime) {
    if (outTotal <= tTotal) return null;
    const diff = outTotal - tTotal;
    if (diff <= 0) return null;
    return {
      h: Math.floor(diff / 60),
      m: diff % 60,
      text: Math.floor(diff / 60) + '시간 ' + (diff % 60) + '분',
    };
  }

  if (!inTime || inTime === '-') return null;
  const [inH, inM] = inTime.split(':').map(Number);
  const inTotal = inH * 60 + inM;

  let diff = null;
  if (outTotal < inTotal) {
    diff = (outTotal + 24 * 60) - tTotal;
  } else if (outTotal > tTotal) {
    diff = outTotal - tTotal;
  }

  if (!diff || diff <= 0) return null;

  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return { h, m, text: h + '시간 ' + m + '분' };
}

// ?? 怨듯쑕???곗씠???????????????????????????????????????????
const HOLIDAYS_2025 = {
  '2025-01-01': '신정', '2025-01-28': '설날연휴', '2025-01-29': '설날',
  '2025-01-30': '설날연휴', '2025-03-01': '삼일절', '2025-05-05': '어린이날',
  '2025-05-06': '어린이날 대체', '2025-05-15': '부처님오신날', '2025-06-06': '현충일',
  '2025-08-15': '광복절', '2025-10-03': '개천절', '2025-10-05': '추석연휴',
  '2025-10-06': '추석', '2025-10-07': '추석연휴', '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날', '2025-12-25': '성탄절',
};
const HOLIDAYS_2026 = {
  '2026-01-01': '신정', '2026-02-16': '설날연휴', '2026-02-17': '설날',
  '2026-02-18': '설날연휴', '2026-03-01': '삼일절', '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '부처님오신날 대체', '2026-06-03': '임시공휴일',
  '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-09-24': '추석연휴',
  '2026-09-25': '추석', '2026-09-26': '추석연휴', '2026-10-03': '개천절',
  '2026-10-09': '한글날', '2026-12-25': '성탄절',
};
const ALL_HOLIDAYS = { ...HOLIDAYS_2025, ...HOLIDAYS_2026 };

function getHolidayName(dateStr) {
  return ALL_HOLIDAYS[dateStr] || null;
}

function isDateHoliday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6 || !!ALL_HOLIDAYS[dateStr];
}

const CALENDAR_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CALENDAR_LEGENDS = [
  { label: '연차', color: '#8B5CF6' },
  { label: '오전반차', color: '#0D9488' },
  { label: '오후반차', color: '#F59E0B' },
  { label: '공휴일', color: '#EC4899' },
];
const LEAVE_TYPE_META = {
  '연차': { label: '연차', color: '#6F52D6', bg: 'rgba(111, 82, 214, 0.18)', border: 'rgba(111, 82, 214, 0.34)' },
  '오전반차': { label: '오전반차', color: '#0F766E', bg: 'rgba(15, 118, 110, 0.18)', border: 'rgba(15, 118, 110, 0.34)' },
  '오후반차': { label: '오후반차', color: '#C98312', bg: 'rgba(201, 131, 18, 0.18)', border: 'rgba(201, 131, 18, 0.34)' },
  '오전반일': { label: '오전반일', color: '#0F766E', bg: 'rgba(15, 118, 110, 0.18)', border: 'rgba(15, 118, 110, 0.34)' },
  '오후반일': { label: '오후반일', color: '#C98312', bg: 'rgba(201, 131, 18, 0.18)', border: 'rgba(201, 131, 18, 0.34)' },
  '오전반반차': { label: '오전반반차', color: '#0F766E', bg: 'rgba(15, 118, 110, 0.18)', border: 'rgba(15, 118, 110, 0.34)' },
  '오후반반차': { label: '오후반반차', color: '#C98312', bg: 'rgba(201, 131, 18, 0.18)', border: 'rgba(201, 131, 18, 0.34)' },
  '기타휴가': { label: '기타휴가', color: '#C43E80', bg: 'rgba(196, 62, 128, 0.18)', border: 'rgba(196, 62, 128, 0.34)' },
  '공휴일': { label: '공휴일', color: '#C43E80', bg: 'rgba(196, 62, 128, 0.18)', border: 'rgba(196, 62, 128, 0.34)' },
};
const CALENDAR_LEAVE_PRIORITY = {
  '연차': 0,
  '공휴일': 1,
  '오전반차': 2,
  '오후반차': 3,
  '오전반일': 2,
  '오후반일': 3,
  '오전반반차': 2,
  '오후반반차': 3,
  '기타휴가': 4,
};

const formatCalendarMonthLabel = (yearMonthStr) => {
  const [year, month] = yearMonthStr.split('-').map(Number);
  return String(year) + '년 ' + String(month) + '월';
};

const formatLocalDateStr = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
};

const normalizeEmpNoKey = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
};

const normalizeLeaveType = (leave) => {
  const code = String(leave.leaveCode ?? leave.leave_code ?? '');
  const name = String(leave.leaveName ?? leave.leave_name ?? '');
  if (code === '12' || /연차/.test(name)) return '연차';
  if (code === '16' || code === '61' || /오전/.test(name)) return '오전반차';
  if (code === '17' || code === '62' || /오후/.test(name)) return '오후반차';
  return '기타휴가';
};

const TWO_HOUR_LEAVE_CODES = new Set(['19', '20', '21', '22', '23', '24', '25', '26', '27', '28']);

const getLeaveDisplayType = (leave, stat) => {
  const code = String(leave.leaveCode ?? leave.leave_code ?? '');
  const name = String(leave.leaveName ?? leave.leave_name ?? '');
  const normalized = normalizeLeaveType(leave);
  if (normalized !== '기타휴가') return normalized;

  const isTwoHourLeave = TWO_HOUR_LEAVE_CODES.has(code) || /2시간/.test(name);
  if (!isTwoHourLeave) return normalized;

  const rangeMatch = name.match(/\[(\d{2})(?::?(\d{2}))?[~-](\d{2})(?::?(\d{2}))?\]/);
  if (rangeMatch) {
    const startHour = parseInt(rangeMatch[1], 10);
    return startHour < 12 ? '오전반반차' : '오후반반차';
  }

  if (/오전/.test(name) || /07-09|08-10|09-11/.test(name)) return '오전반반차';
  if (/오후/.test(name) || /13-15|14-16|15-17|16-18/.test(name)) return '오후반반차';

  const inTime = stat?.in || '';
  if (inTime) return inTime < '12:00' ? '오전반반차' : '오후반반차';

  if (['19', '20', '21', '22', '23'].includes(code)) return '오전반반차';
  if (['24', '25', '26', '27', '28'].includes(code)) return '오후반반차';
  return '오전반반차';
};

const getLeaveMeta = (leave, stat) => LEAVE_TYPE_META[getLeaveDisplayType(leave, stat)] || LEAVE_TYPE_META.기타휴가;

const getLeaveDisplayName = (leave, employeeNameLookup) => {
  const empNoKey = normalizeEmpNoKey(leave.empNo);
  return (
    leave.empName ||
    leave.name ||
    employeeNameLookup?.get(empNoKey) ||
    employeeNameLookup?.get(String(leave.empNo)) ||
    leave.empNo ||
    ''
  );
};

const getLeaveDetailText = (leave) => {
  const meta = getLeaveMeta(leave);
  const original = leave.leaveName || '';
  const leaveDaysValue = Number(leave.leaveDays ?? leave.leave_days);
  const extraNote = Number.isFinite(leaveDaysValue) && leaveDaysValue === 0 ? ' (차감 없음)' : '';
  if (!original || original === meta.label) return String(meta.label || '') + extraNote;
  return String(meta.label || '') + ' (' + original + ')' + extraNote;
};

const getLeaveTimeText = (leave, stat) => {
  const label = normalizeLeaveType(leave);
  const inTime = stat?.in || '-';
  const outTime = stat?.correctedOutTime || stat?.out || '-';
  if (label === '연차') return '';
  if (!stat || (!stat.in && !stat.out && !stat.correctedOutTime)) return '';
  return String(inTime) + '/' + String(outTime);
};

const getLeaveDisplaySummary = (leave, stat) => {
  const meta = getLeaveMeta(leave, stat);
  const original = String(leave.leaveName || leave.leave_name || '').trim();
  const baseLabel = meta.label === '공휴일' && original ? original : meta.label;
  return baseLabel;
};

const sortCalendarLeaves = (leaves = [], employeeNameLookup) => {
  return [...leaves].sort((a, b) => {
    const ap = CALENDAR_LEAVE_PRIORITY[getLeaveDisplayType(a)] ?? 99;
    const bp = CALENDAR_LEAVE_PRIORITY[getLeaveDisplayType(b)] ?? 99;
    if (ap !== bp) return ap - bp;
    const an = getLeaveDisplayName(a, employeeNameLookup);
    const bn = getLeaveDisplayName(b, employeeNameLookup);
    return an.localeCompare(bn, 'ko-KR');
  });
};

function DashboardCalendarWidget({
  calendarMonth,
  setCalendarMonth,
  calendarLeaves,
  employeeNameLookup,
  selectedCalendarDate,
  setSelectedCalendarDate,
  eyebrow = '대시보드 캘린더',
}) {
  const todayStr = formatLocalDateStr();
  const cells = getCalendarCells(calendarMonth);

  const moveMonth = (delta) => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    setSelectedCalendarDate(null);
    setCalendarMonth(next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'));
  };

  const renderSelectedDetail = () => {
    if (!selectedCalendarDate) return null;
    const dc = selectedCalendarDate.replace(/-/g, '');
    const dayLeaves = sortCalendarLeaves(calendarLeaves.filter(l => dc >= l.startDate && dc <= l.endDate), employeeNameLookup);
    const holidayName = getHolidayName(selectedCalendarDate);
    return (
      <div className="calendar-detail">
        <div className="calendar-detail__title">
          <span className="calendar-detail__date">{selectedCalendarDate}</span>
          {holidayName && <span className="calendar-detail__holiday">공휴일 {holidayName}</span>}
        </div>
        {dayLeaves.length === 0 ? (
          <div className="calendar-detail__empty">휴가자 없음</div>
        ) : (
          <div className="calendar-detail__grid">
            {Object.values(
              dayLeaves.reduce((acc, leave, index) => {
                const meta = getLeaveMeta(leave);
                const key = meta.label;
                if (!acc[key]) {
                  acc[key] = { meta, leaves: [] };
                }
                acc[key].leaves.push({ leave, index });
                return acc;
              }, {})
            ).map(({ meta, leaves }) => (
              <div
                key={meta.label}
                className="calendar-detail__panel"
                style={{ background: meta.bg, borderColor: meta.border }}
              >
                <div className="calendar-detail__panel-head">
                  <div className="calendar-detail__panel-title" style={{ color: meta.color }}>{meta.label}</div>
                  <div className="calendar-detail__panel-count">{leaves.length}명</div>
                </div>
                <div className="calendar-detail__panel-body">
                  {leaves.map(({ leave, index }) => (
                    <span key={String(leave.empName || '') + '-' + String(leave.leaveName || '') + '-' + index} className="calendar-detail__name-chip">
                      {getLeaveDisplayName(leave, employeeNameLookup)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div className="calendar-widget">
        <div className="calendar-widget__header">
          <div>
            <div className="calendar-widget__eyebrow">{eyebrow}</div>
            <div className="calendar-widget__title">{formatCalendarMonthLabel(calendarMonth)} 달력</div>
          </div>
          <div className="calendar-widget__nav">
            <button
              type="button"
              className="calendar-widget__nav-btn"
              onClick={() => moveMonth(-1)}
              aria-label="이전달"
              title="이전달"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="calendar-widget__nav-btn"
              onClick={() => moveMonth(1)}
              aria-label="다음달"
              title="다음달"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="calendar-widget__legend">
          {CALENDAR_LEGENDS.map(item => (
            <div key={item.label} className="calendar-widget__legend-item">
              <span className="calendar-widget__legend-swatch" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="calendar-widget__weekday-grid">
          {CALENDAR_WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className={'calendar-widget__weekday ' + (idx === 0 ? 'is-sun' : idx === 6 ? 'is-sat' : '')}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-widget__grid">
          {cells.map((cell, idx) => {
            if (cell.empty) {
              return <div key={'empty-' + idx} className="calendar-widget__spacer" />;
            }

            const dow = idx % 7;
            const isSun = dow === 0;
            const isSat = dow === 6;
            const holidayName = getHolidayName(cell.dateStr);
            const isToday = cell.dateStr === todayStr;
            const isSelected = selectedCalendarDate === cell.dateStr;
            const isHoliday = isSun || isSat || !!holidayName;
            const dayLeaves = sortCalendarLeaves(calendarLeaves.filter(l => {
              const dc = cell.dateStr.replace(/-/g, '');
              return dc >= l.startDate && dc <= l.endDate;
            }), employeeNameLookup);

            return (
              <button
                key={cell.dateStr}
                type="button"
                className={[
                  'calendar-day',
                  isSun ? 'is-sun' : '',
                  isSat ? 'is-sat' : '',
                  isHoliday ? 'is-holiday' : '',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedCalendarDate(isSelected ? null : cell.dateStr)}
                title={holidayName || cell.dateStr}
                style={{
                  background: 'transparent',
                  borderColor: isToday
                    ? 'var(--blue)'
                    : isSelected
                      ? 'rgba(99, 102, 241, 0.5)'
                      : isHoliday
                        ? 'var(--border)'
                        : 'transparent',
                  boxShadow: isToday
                    ? 'inset 0 0 0 1px var(--blue)'
                    : isSelected
                      ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.45)'
                      : 'none',
                }}
              >
                <div className="calendar-day__top">
                  <span
                    className="calendar-day__number"
                    style={{
                      color: isToday
                        ? 'var(--blue)'
                        : isSun || !!holidayName
                          ? 'var(--red)'
                          : isSat
                            ? 'var(--blue)'
                            : 'var(--text-1)',
                      fontWeight: isToday ? 900 : 800,
                    }}
                  >
                    {cell.dayNum}
                  </span>
                  {holidayName && <span className="calendar-day__holiday">{holidayName}</span>}
                </div>

                <div className="calendar-day__leave-list">
                  {dayLeaves.slice(0, 3).map((leave, li) => {
                    const meta = getLeaveMeta(leave);
                    return (
                      <span
                        key={String(leave.empName || '') + '-' + String(leave.leaveName || '') + '-' + li}
                        className="calendar-day__leave-pill"
                        style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                        title={String(getLeaveDisplayName(leave, employeeNameLookup) || '') + ' 쨌 ' + String(meta.label || '')}
                      >
                        {getLeaveDisplayName(leave, employeeNameLookup)}
                      </span>
                    );
                  })}
                  {dayLeaves.length > 3 && (
                    <span className="calendar-day__leave-more">+{dayLeaves.length - 3}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {renderSelectedDetail()}
      </div>
    </div>
  );
}

function DashboardTabSync({ setActiveTab }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab') || 'DASHBOARD';
    setActiveTab(tab);
  }, [searchParams, setActiveTab]);

  return null;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [myEmpNo, setMyEmpNo] = useState('');
  const [myName, setMyName] = useState('');
  const [myRank, setMyRank] = useState('');
  const [myLoginId, setMyLoginId] = useState('');
  const [myDept, setMyDept] = useState('');
  const [viewDeptFilter, setViewDeptFilter] = useState('ALL');
  
  // Real-time Dashboard Data
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [time, setTime] = useState('');
  const [theme, setTheme] = usePersistentTheme('dark');
  const router = useRouter();

  // Monthly / Tracker Data State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [monthlyData, setMonthlyData] = useState(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState({});
  const [tempSchedules, setTempSchedules] = useState({});
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [showCombobox, setShowCombobox] = useState(false);

  // Tracker Employee Selector States
  const [trackerSearchQuery, setTrackerSearchQuery] = useState('');
  const [showTrackerCombobox, setShowTrackerCombobox] = useState(false);

  // Calendar Widget States (Dashboard)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  });
  const [calendarLeaves, setCalendarLeaves] = useState([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [leaveCalendarDate, setLeaveCalendarDate] = useState(null);

  // New Features States
  const [manualNote, setManualNote] = useState('');
  const [isCheckinLoading, setIsCheckinLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  
  // Correction Modal/Form State
  const [correctionTarget, setCorrectionTarget] = useState(null); // { empNo, workDate, originalOut }
  const [correctedOutTime, setCorrectedOutTime] = useState('18:00');
  const [correctionReason, setCorrectionReason] = useState('');
  
  // Schedule Override Modal/Form State
  const [overrideTarget, setOverrideTarget] = useState(null); // { empNo, name }
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideNote, setOverrideNote] = useState('');

  // Employee Admin Management State
  const [employeeAdminData, setEmployeeAdminData] = useState([]);
  const [employeeAdminLoading, setEmployeeAdminLoading] = useState(false);
  const [employeeAdminSearch, setEmployeeAdminSearch] = useState('');
  const [employeeAdminDrafts, setEmployeeAdminDrafts] = useState({});
  const [employeeAdminSaving, setEmployeeAdminSaving] = useState({});
  const [employeeAdminResetting, setEmployeeAdminResetting] = useState({});
  const [employeeAdminBackfilling, setEmployeeAdminBackfilling] = useState({});

  // Overtime Period Management States
  const [periods, setPeriods] = useState([]);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodNote, setNewPeriodNote] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  // User Registration State
  const [regEmpNo, setRegEmpNo] = useState('');
  const [regName, setRegName] = useState('');
  const [regUserId, setRegUserId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRank, setRegRank] = useState('');
  const [regPosition, setRegPosition] = useState('');
  const [regTeam, setRegTeam] = useState('');
  const [showRegTeamSuggestions, setShowRegTeamSuggestions] = useState(false);
  const [regIsAdmin, setRegIsAdmin] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [capsUploadFile, setCapsUploadFile] = useState(null);
  const [capsUploadLoading, setCapsUploadLoading] = useState(false);
  const [capsUploadResult, setCapsUploadResult] = useState(null);
  const rankOptions = ['선임', '책임', '수석', '상무보', '상무', '전무', '대표이사'];
  const positionOptions = ['팀원', '팀장', '실장', '대표이사'];
  const regFieldStyle = {
    background: theme === 'light' ? '#fff' : 'var(--bg-overlay-sm)',
    backgroundColor: theme === 'light' ? '#fff' : 'var(--bg-overlay-sm)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: theme === 'light' ? '#111827' : '#fff',
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
    .map((emp) => emp?.dept)
    .filter((dept) => dept && dept !== '부서없음'))).sort((a, b) => a.localeCompare(b, 'ko'));
  const regTeamSuggestions = regTeamOptions
    .filter((team) => team.includes(regTeam.trim()))
    .slice(0, 8);

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!regEmpNo || !regName || !regUserId || !regPassword) {
      alert('?ъ썝踰덊샇, ?대쫫, ?꾩씠?? ?꾩떆 鍮꾨?踰덊샇???꾩닔 ?낅젰 ??ぉ?낅땲??');
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
        alert(json.message || '怨꾩젙???뺤긽?곸쑝濡??깅줉?섏뿀?듬땲??');
        setRegEmpNo('');
        setRegName('');
        setRegUserId('');
        setRegPassword('');
        setRegRank('');
        setRegPosition('');
        setRegTeam('');
        setShowRegTeamSuggestions(false);
        setRegIsAdmin(false);
      } else {
        alert(json.error || '怨꾩젙 ?깅줉???ㅽ뙣?덉뒿?덈떎.');
      }
    } catch (err) {
      alert('怨꾩젙 ?깅줉 ?붿껌 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleCapsAttendanceUpload = async (e) => {
    e.preventDefault();
    if (!capsUploadFile) {
      alert('?낅줈?쒗븷 ?뚯씪???좏깮?댁＜?몄슂.');
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

      if (json.success) {
        setCapsUploadResult(json);
        setCapsUploadFile(null);
        e.currentTarget.reset();
        alert(json.message || '罹≪뒪 異쒖엯湲곕줉??諛섏쁺?섏뿀?듬땲??');
      } else {
        alert(json.error || '罹≪뒪 異쒖엯湲곕줉 ?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎.');
      }
    } catch (err) {
      alert('罹≪뒪 異쒖엯湲곕줉 ?낅줈???붿껌 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setCapsUploadLoading(false);
    }
  };

  // 1. Theme, Clock, Auth initialization
  useEffect(() => {
    const now = new Date();
    const curMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(curMonth);

    // Auth configuration
    const adminVal = ((getCookieValue('user-is-admin') || localStorage.getItem('user-is-admin')) === 'true');
    const positionVal = getCookieValue('user-position') || localStorage.getItem('user-position') || '';
    const isLeaderVal = positionVal === '팀장';
    const empNoVal = getCookieValue('user-emp-no') || localStorage.getItem('user-emp-no') || '';
    const nameVal = getCookieValue('user-name') || localStorage.getItem('user-name') || '';
    const rankVal = getCookieValue('user-rank') || localStorage.getItem('user-rank') || '';
    const loginIdVal = getCookieValue('user-login-id') || localStorage.getItem('user-login-id') || '';
    const teamVal = getCookieValue('user-team') || localStorage.getItem('user-team') || '';
    
    setIsAdmin(adminVal);
    setIsLeader(isLeaderVal);
    setMyEmpNo(empNoVal);
    setMyName(nameVal);
    setMyRank(rankVal);
    setMyLoginId(loginIdVal);
    setMyDept(teamVal);

    if (!adminVal && !isLeaderVal && empNoVal) {
      setActiveTab('DASHBOARD');
      setViewDeptFilter(teamVal || 'ALL');
      setSelectedEmployee(empNoVal);
    } else {
      setActiveTab('DASHBOARD');
    }

    const syncAuthFromServer = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();
        if (json?.success && json.user) {
          const serverAdmin = !!json.user.isAdmin;
          const serverPosition = json.user.position || '';
          const serverEmpNo = json.user.empNo || '';
          const serverName = json.user.name || '';
          const serverRank = json.user.rank || '';
          const serverLoginId = json.user.loginId || '';
          const serverTeam = json.user.team || '';

          setIsAdmin(serverAdmin);
          setIsLeader(serverPosition === '팀장');
          setMyEmpNo(serverEmpNo);
          setMyName(serverName);
          setMyRank(serverRank);
          setMyLoginId(serverLoginId);
          setMyDept(serverTeam);

          localStorage.setItem('user-is-admin', String(serverAdmin));
          localStorage.setItem('user-position', serverPosition);
          localStorage.setItem('user-emp-no', serverEmpNo);
          localStorage.setItem('user-name', serverName);
          localStorage.setItem('user-rank', json.user.rank || '');
          localStorage.setItem('user-login-id', serverLoginId);
          localStorage.setItem('user-team', serverTeam);

          if (serverAdmin) {
            setActiveTab('DASHBOARD');
            if (data?.allEmployees?.length) {
              setSelectedEmployee(json.user.empNo || data.allEmployees[0].empNo);
            }
          } else {
            setViewDeptFilter(prev => {
              const normalizedPrev = normalizeDeptName(prev);
              if (normalizedPrev && normalizedPrev !== 'ALL') return prev;
              return serverTeam || 'ALL';
            });
            setActiveTab('DASHBOARD');
            setSelectedEmployee(serverEmpNo);
          }
        }
      } catch (err) {
        console.error('Auth sync failed:', err);
      }
    };

    syncAuthFromServer();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(formatClockTime(now));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // 2. Fetch Real-time Dashboard Data
  const fetchTodayData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/attendance');
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (!selectedEmployee && json.allEmployees && json.allEmployees.length > 0) {
          const adminVal = (getCookieValue('user-is-admin') || localStorage.getItem('user-is-admin')) === 'true';
          const empNoVal = getCookieValue('user-emp-no') || localStorage.getItem('user-emp-no') || '';
          setSelectedEmployee(adminVal ? json.allEmployees[0].empNo : empNoVal);
        }
      }
    } catch (e) {
      console.error('Fetch today data error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTodayData();
    const t = setInterval(() => fetchTodayData(true), 15000);
    return () => clearInterval(t);
  }, [selectedEmployee]);

  // 3. Fetch Monthly Filtered Data
  const fetchMonthlyData = async (monthVal) => {
    if (!monthVal) return;
    setMonthlyLoading(true);
    try {
      const res = await fetch('/api/attendance?month=' + monthVal);
      const json = await res.json();
      if (json.success) {
        setMonthlyData(json);
      }
    } catch (e) {
      console.error('Fetch monthly data error:', e);
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MONTHLY' || activeTab === 'TRACKER' || activeTab === 'MY_PORTAL' || activeTab === 'LEAVES') {
      fetchMonthlyData(selectedMonth);
    }
  }, [selectedMonth, activeTab]);

  // Fetch calendar leaves for dashboard calendar widget
  const fetchCalendarLeaves = async (monthVal) => {
    try {
      const res = await fetch('/api/attendance?month=' + monthVal);
      const json = await res.json();
      if (json.success) {
        setCalendarLeaves(json.leaves || []);
      }
    } catch (e) {
      console.error('Calendar leaves fetch error:', e);
    }
  };

  useEffect(() => {
    fetchCalendarLeaves(calendarMonth);
  }, [calendarMonth]);

  // Fetch Overtime Periods
  const fetchPeriods = async () => {
    try {
      const res = await fetch('/api/attendance/overtime-periods');
      const json = await res.json();
      if (json.success) {
        setPeriods(json.periods);
        if (json.periods.length > 0 && !selectedPeriodId) {
          setSelectedPeriodId(json.periods[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'OVERTIME') {
      fetchPeriods();
    }
  }, [activeTab]);

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
            resetPassword: ''
          };
        });
        setEmployeeAdminDrafts(draftMap);
      } else {
        alert(json.error || '吏곸썝 ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??');
      }
    } catch (e) {
      console.error(e);
      alert('吏곸썝 ?뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??');
    } finally {
      setEmployeeAdminLoading(false);
    }
  };

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
          isAdmin: !!draft.isAdmin
        })
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error || '吏곸썝 ?뺣낫 ?섏젙???ㅽ뙣?덉뒿?덈떎.');
        return;
      }
      await fetchEmployeeAdminData();
      alert(json.message || '吏곸썝 ?뺣낫媛 ?섏젙?섏뿀?듬땲??');
    } catch (e) {
      console.error(e);
      alert('吏곸썝 ?뺣낫 ?섏젙 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setEmployeeAdminSaving((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  const handleEmployeePasswordReset = async (empNo) => {
    const draft = employeeAdminDrafts[empNo];
    const newPassword = draft?.resetPassword?.trim() || '';
    if (newPassword.length < 8) {
      alert('珥덇린??鍮꾨?踰덊샇??8???댁긽?댁뼱???⑸땲??');
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
        alert(json.error || '?뷀샇 珥덇린?붿뿉 ?ㅽ뙣?덉뒿?덈떎.');
        return;
      }
      updateEmployeeAdminDraft(empNo, { resetPassword: '' });
      alert(json.message || '?뷀샇媛 珥덇린?붾릺?덉뒿?덈떎.');
    } catch (e) {
      console.error(e);
      alert('?뷀샇 珥덇린??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
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
        alert(json.error || '?곗감 諛깊븘 ?붿껌???ㅽ뙣?덉뒿?덈떎.');
        return;
      }
      alert(json.message || '?곗감 諛깊븘 ?붿껌???깅줉?섏뿀?듬땲??');
    } catch (e) {
      console.error(e);
      alert('?곗감 諛깊븘 ?붿껌 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setEmployeeAdminBackfilling((prev) => ({ ...prev, [empNo]: false }));
    }
  };

  useEffect(() => {
    if (activeTab === 'EMPLOYEE_ADMIN' && isAdmin) {
      fetchEmployeeAdminData();
    }
  }, [activeTab, isAdmin]);

  const calendarEmployeeNameLookup = new Map();
  const employeeDeptLookup = new Map();
  [...(data?.allEmployees || []), ...(monthlyData?.allEmployees || []), ...(employeeAdminData || [])].forEach((emp) => {
    const key = normalizeEmpNoKey(emp?.empNo || emp?.emp_no);
    if (!key) return;
    const name = String(emp?.name || '').trim();
    const dept = getEmployeeDept(emp);
    if (name && !calendarEmployeeNameLookup.has(key)) {
      calendarEmployeeNameLookup.set(key, name);
    }
    if (dept && !employeeDeptLookup.has(key)) {
      employeeDeptLookup.set(key, dept);
    }
  });

  const deptFilterValue = normalizeDeptName(viewDeptFilter) || 'ALL';
  const deptOptions = Array.from(new Set([
    'ALL',
    myDept,
    ...(data?.allEmployees || []).map((emp) => emp?.dept),
    ...(monthlyData?.allEmployees || []).map((emp) => emp?.dept),
    ...(employeeAdminData || []).map((emp) => emp?.dept),
  ].map(normalizeDeptName).filter(Boolean))).sort((a, b) => {
    if (a === 'ALL') return -1;
    if (b === 'ALL') return 1;
    return a.localeCompare(b, 'ko-KR');
  });

  const filterLeavesByDept = (leaves = [], filter = 'ALL') => {
    const normalizedFilter = normalizeDeptName(filter);
    if (!normalizedFilter || normalizedFilter === 'ALL') return leaves;
    return (leaves || []).filter((leave) => matchesDeptFilter(employeeDeptLookup.get(normalizeEmpNoKey(leave?.empNo)), normalizedFilter));
  };

  const filteredStatuses = data?.employeeStatuses?.filter(emp => {
    const deptMatch = matchesDeptFilter(emp.dept, deptFilterValue);
    const matchSearch = emp.name.includes(searchQuery) || emp.empNo.includes(searchQuery) || emp.dept.includes(searchQuery);
    if (!deptMatch) return false;
    if (statusFilter === 'ALL') return matchSearch;
    if (statusFilter === 'PRESENT') return matchSearch && emp.status === '근무중';
    if (statusFilter === 'ABSENT') return matchSearch && emp.status === '미출근';
    if (statusFilter === 'LATE') return matchSearch && emp.isLate;
    if (statusFilter === 'LEAVE') return matchSearch && ['연차', '오전반차', '오후반차', '오전반반차', '오후반반차', '기타휴가'].includes(emp.status);
    return matchSearch;
  }) || [];

  const visibleDashboardStats = filteredStatuses.reduce((acc, emp) => {
    acc.totalEmployees += 1;
    if (emp.status === '근무중') acc.present += 1;
    if (emp.isLate) acc.late += 1;
    if (['연차', '오전반차', '오후반차', '오전반반차', '오후반반차', '기타휴가'].includes(emp.status)) acc.leave += 1;
    if (emp.status === '근무중' && (emp.checkOut === '-' || !emp.checkOut)) acc.workingNow += 1;
    return acc;
  }, { totalEmployees: 0, present: 0, late: 0, leave: 0, workingNow: 0 });

  const visibleDeptData = (data?.deptData || []).filter((dept) => deptFilterValue === 'ALL' || dept.name === deptFilterValue);
  const visibleMonthlyEmployees = filterEmployeesByDept(monthlyData?.allEmployees || [], deptFilterValue);
  const visibleTrackerEmployees = filterEmployeesByDept(monthlyData?.allEmployees || data?.allEmployees || [], deptFilterValue);
  const visibleLeaves = filterLeavesByDept(monthlyData?.leaves || [], deptFilterValue);
  const visibleDashboardLeaves = filterLeavesByDept(calendarLeaves || [], deptFilterValue);

  // Sync tracker search query
  useEffect(() => {
    if (!showTrackerCombobox) {
      const allEmps = visibleTrackerEmployees;
      const emp = allEmps.find(e => e.empNo === selectedEmployee);
      if (emp) {
        setTrackerSearchQuery(emp.name);
      } else {
        setTrackerSearchQuery('');
      }
    }
  }, [selectedEmployee, visibleTrackerEmployees, showTrackerCombobox]);

  useEffect(() => {
    if (activeTab !== 'TRACKER' && activeTab !== 'MY_PORTAL') return;
    if (visibleTrackerEmployees.length === 0) return;
    const selectedVisible = visibleTrackerEmployees.some((emp) => emp.empNo === selectedEmployee);
    if (!selectedVisible) {
      const fallbackEmp = visibleTrackerEmployees.find((emp) => emp.empNo === myEmpNo) || visibleTrackerEmployees[0];
      if (fallbackEmp && fallbackEmp.empNo !== selectedEmployee) {
        setSelectedEmployee(fallbackEmp.empNo);
      }
    }
  }, [activeTab, deptFilterValue, myEmpNo, selectedEmployee, visibleTrackerEmployees]);

  // Save default schedule via /api/employees/schedule
  const handleSaveSchedule = async (empNo, scheduleVal) => {
    setScheduleLoading(prev => ({ ...prev, [empNo]: true }));
    try {
      const res = await fetch('/api/employees/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empNo, schedule: scheduleVal })
      });
      const json = await res.json();
      if (json.success) {
        setTempSchedules(prev => {
          const next = { ...prev };
          delete next[empNo];
          return next;
        });
        fetchTodayData(true);
      } else {
        alert(json.error || '?쇱젙 ????ㅽ뙣');
      }
    } catch (e) {
      alert('?쇱젙 ???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    } finally {
      setScheduleLoading(prev => ({ ...prev, [empNo]: false }));
    }
  };

  // Clock-in/out Manual Checkin
  const handleManualCheck = async (type) => {
    setIsCheckinLoading(true);
    setActionMessage(null);
    try {
      const today = new Date();
      const offset = today.getTimezoneOffset();
      const localDate = new Date(today.getTime() - (offset * 60 * 1000));
      const workDate = localDate.toISOString().split('T')[0];

      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType: type,
          workDate,
          note: manualNote
        })
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: json.message });
        setManualNote('');
        fetchMonthlyData(selectedMonth);
        fetchTodayData(true);
      } else {
        setActionMessage({ type: 'error', text: json.error });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: '湲곕줉 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' });
    } finally {
      setIsCheckinLoading(false);
    }
  };

  // Admin correction submit
  const handleCorrectionSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/attendance/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: correctionTarget.empNo,
          workDate: correctionTarget.workDate,
          correctedOutTime,
          reason: correctionReason
        })
      });
      const json = await res.json();
      if (json.success) {
        alert('?닿렐 ?쒓컙???깃났?곸쑝濡?蹂寃쎈릺?덉뒿?덈떎.');
        setCorrectionTarget(null);
        setCorrectionReason('');
        fetchMonthlyData(selectedMonth);
      } else {
        alert(json.error);
      }
    } catch {
      alert('?섏젙 以??쒕쾭 ?먮윭媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  // Admin Schedule override submit
  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/employees/schedule-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empNo: overrideTarget.empNo,
          workDate: overrideDate,
          scheduleStart: overrideStart,
          note: overrideNote
        })
      });
      const json = await res.json();
      if (json.success) {
        alert('?대떦 ?쇱옄???밸퀎 洹쇰Т?쇱젙???깅줉?섏뿀?듬땲??');
        setOverrideTarget(null);
        setOverrideDate('');
        setOverrideNote('');
        fetchMonthlyData(selectedMonth);
        fetchTodayData(true);
      } else {
        alert(json.error);
      }
    } catch {
      alert('???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  // Approve/Reject manual checkin
  const handleDecideCheckin = async (id, decision) => {
    try {
      const res = await fetch('/api/attendance/manual-checkin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision })
      });
      const json = await res.json();
      if (json.success) {
        alert(decision === 'approved' ? '?뱀씤 ?꾨즺' : '諛섎젮 ?꾨즺');
        fetchMonthlyData(selectedMonth);
      } else {
        alert(json.error);
      }
    } catch {
      alert('?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  // Save Overtime Period
  const handleCreatePeriod = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/attendance/overtime-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPeriodName,
          startDate: newPeriodStart,
          endDate: newPeriodEnd,
          note: newPeriodNote
        })
      });
      const json = await res.json();
      if (json.success) {
        setNewPeriodName('');
        setNewPeriodStart('');
        setNewPeriodEnd('');
        setNewPeriodNote('');
        fetchPeriods();
      } else {
        alert(json.error);
      }
    } catch {
      alert('?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  // Delete Overtime Period
  const handleDeletePeriod = async (id) => {
    if (!confirm('?대떦 愿由?湲곌컙????젣?섏떆寃좎뒿?덇퉴?')) return;
    try {
      const res = await fetch('/api/attendance/overtime-periods?id=' + id, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchPeriods();
      } else {
        alert(json.error);
      }
    } catch {
      alert('?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('user-is-admin');
      localStorage.removeItem('user-position');
      localStorage.removeItem('user-emp-no');
      localStorage.removeItem('user-name');
      localStorage.removeItem('user-rank');
      localStorage.removeItem('user-login-id');
      localStorage.removeItem('user-team');
      window.location.href = '/login';
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  // Avatars helpers
  const getAvatarColor = (sabun = '') => {
    const colors = ['blue', 'emerald', 'indigo', 'violet', 'fuchsia', 'rose', 'cyan'];
    let sum = 0;
    for (let i = 0; i < sabun.length; i++) sum += sabun.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const getInitials = (name = '') => {
    return name.length > 2 ? name.substring(name.length - 2) : name;
  };

  const sidebarItems = useMemo(() => {
    const sourceItems = isAdmin
      ? getMainSidebarItems({ isAdmin: true, isLeader: false })
      : getMainSidebarItems({ isAdmin, isLeader, dept: myDept, position: '' });

    return sourceItems.map((item) => {
      const tabMatch = item.href?.match(/\?tab=([A-Z_]+)/);
      const itemTab = tabMatch ? tabMatch[1] : null;
      return {
        ...item,
        active: itemTab ? itemTab === activeTab : item.href === '/admin/employees' && activeTab === 'EMPLOYEE_ADMIN',
        onClick: () => {
          if (item.href) {
            if (itemTab === 'TRACKER') setSelectedEmployee(myEmpNo);
            router.push(item.href);
          }
        },
        href: itemTab ? undefined : item.href,
      };
    });
  }, [activeTab, isAdmin, isLeader, myDept, myEmpNo, router]);

  const footerActions = useMemo(() => ([
    {
      label: '濡쒓렇?꾩썐',
      icon: sidebarActionIcons.logout,
      onClick: handleLogout,
      color: 'var(--red)',
    },
    {
      label: '留덉씠?섏씠吏',
      icon: sidebarActionIcons.mypage,
      href: '/mypage',
      color: 'var(--blue)',
    },
  ]), []);
  return (
    <div className="ga-theme">

      {/* ?먥븧 Sidebar ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */}
            <AppSidebar
        items={sidebarItems}
        profile={{
          name: myName || (isAdmin ? '愿由ъ옄' : '吏곸썝'),
          rank: myRank,
          loginId: myLoginId,
          empNo: myEmpNo,
          team: myDept,
          dept: myDept,
        }}
        profileBadges={[
          ...(isAdmin ? [{ label: 'ADMIN', background: 'var(--red)', color: '#fff' }] : []),
          ...(isLeader ? [{ label: 'LEADER', background: 'var(--amber)', color: '#111' }] : []),
        ]}
        version="v2.1.0"
        footerActions={footerActions}
      />
      <Suspense fallback={null}>
        <DashboardTabSync setActiveTab={setActiveTab} />
      </Suspense>

      {/* ?먥븧 Main Content ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧 */}
      <main className="main-content">

        {/* Top Header Bar */}
        <div className="top-bar">
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-1)' }}>
              {activeTab === 'DASHBOARD' && '실시간 근태 모니터링'}
              {activeTab === 'MONTHLY' && '월간 임직원 근태 현황'}
              {activeTab === 'TRACKER' && '개인 상세 근무트래커'}
              {activeTab === 'EMPLOYEES' && '임직원 근무일정 및 예외 관리'}
              {activeTab === 'EMPLOYEE_ADMIN' && '직원 정보 수정 및 암호 초기화'}
              {activeTab === 'MY_PORTAL' && '임직원 근태 마이 페이지'}
              {activeTab === 'LEAVES' && '전사 휴가 현황'}
              {activeTab === 'OVERTIME' && '초과시간 누적 및 정산 관리'}
              {activeTab === 'MANUAL_APPROVAL' && '수동 출퇴근 기록 심사'}
              {activeTab === 'USER_REGISTER' && '신규 사용자 계정 등록'}
              {activeTab === 'CAPS_UPLOAD' && '캡스 출입기록 업로드'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: '500', marginTop: '2px' }}>
              {activeTab === 'DASHBOARD' && '오늘 기준 출근, 부서 현황, 실시간 직원 상태를 집계합니다.'}
              {activeTab === 'MONTHLY' && '선택한 월의 일자별 출퇴근 현황을 확인합니다.'}
              {activeTab === 'TRACKER' && '개인별 월 단위 출근, 퇴근, 근무시간을 조회하고 관리합니다.'}
              {activeTab === 'EMPLOYEES' && '고정 근무시간과 일자별 근무 예외를 관리합니다.'}
              {activeTab === 'EMPLOYEE_ADMIN' && '직원 기본 정보와 계정 초기 비밀번호를 관리합니다.'}
              {activeTab === 'MY_PORTAL' && '본인의 출퇴근 기록과 근무 현황을 확인합니다.'}
              {activeTab === 'LEAVES' && '임직원의 연차 및 휴가 사용 현황을 확인합니다.'}
              {activeTab === 'OVERTIME' && '지정 기간의 부서/직원별 누적 초과시간을 관리합니다.'}
              {activeTab === 'MANUAL_APPROVAL' && '직원이 수동으로 제출한 출퇴근 기록을 심사합니다.'}
              {activeTab === 'USER_REGISTER' && '로그인 계정과 사원번호 정보를 연결해 등록합니다.'}
              {activeTab === 'CAPS_UPLOAD' && '캡스 출입기록 파일을 업로드해 사번 기준으로 반영합니다.'}
            </p>
          </div>
          
          <div className="top-actions">
            {data?.isDemo && (
              <div className="db-indicator" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
                <AlertTriangle style={{ width: 14, height: 14 }} />
                <span className="db-name">?ㅽ봽?쇱씤 ?곕え 紐⑤뱶</span>
              </div>
            )}
            {['DASHBOARD', 'MONTHLY', 'TRACKER', 'LEAVES', 'OVERTIME'].includes(activeTab) && (
              <select
                className="ui-select"
                value={deptFilterValue}
                onChange={(e) => setViewDeptFilter(e.target.value)}
                aria-label="부서 선택"
              >
                {deptOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept === 'ALL' ? '전체 부서' : dept}
                  </option>
                ))}
              </select>
            )}
            <button className="icon-btn" onClick={() => fetchTodayData()} disabled={refreshing} title="새로고침">
              <RefreshCw style={{ width: 15, height: 15, ...(refreshing ? { animation: 'spin 1s linear infinite' } : {}) }} />
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? '?쇱씠??紐⑤뱶' : '?ㅽ겕 紐⑤뱶'}>
              {theme === 'dark' ? <Sun style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
            </button>
            <div className="time-display">{time}</div>
          </div>
        </div>

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 1: ?ㅼ떆媛???쒕낫??(DASHBOARD - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'DASHBOARD' && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Real-time Status Card Grid */}
            <div className="kpi-grid">
              <div className="kpi-card" onClick={() => setStatusFilter('ALL')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="kpi-label">전체 재직 임직원</span>
                  <div className="kpi-icon blue"><Users style={{ width: 18, height: 18 }} /></div>
                </div>
                <span className="kpi-value">{visibleDashboardStats.totalEmployees} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
                <span className="kpi-desc">등록된 전체 활성 사원 수</span>
              </div>

              <div className="kpi-card" onClick={() => setStatusFilter('PRESENT')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="kpi-label">오늘 정상 근무자</span>
                  <div className="kpi-icon green"><UserCheck style={{ width: 18, height: 18 }} /></div>
                </div>
                <span className="kpi-value">{visibleDashboardStats.present} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
                <span className="kpi-desc">출근 완료 및 실시간 근무중</span>
              </div>

              <div className="kpi-card" onClick={() => setStatusFilter('LATE')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="kpi-label">오늘 지각 발생건</span>
                  <div className="kpi-icon amber"><Clock style={{ width: 18, height: 18 }} /></div>
                </div>
                <span className="kpi-value" style={{ color: visibleDashboardStats.late > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
                  {visibleDashboardStats.late} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>건</small>
                </span>
                <span className="kpi-desc">출근 기준시간 대비 지각자</span>
              </div>

              <div className="kpi-card" onClick={() => setStatusFilter('LEAVE')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="kpi-label">오늘 휴가/연차자</span>
                  <div className="kpi-icon purple"><Calendar style={{ width: 18, height: 18 }} /></div>
                </div>
                <span className="kpi-value" style={{ color: 'var(--purple)' }}>{visibleDashboardStats.leave} <small style={{ fontSize: '15px', color: 'var(--text-2)' }}>명</small></span>
                <span className="kpi-desc">반차/연차 결근 처리 포함</span>
              </div>
            </div>

            {/* Split layout (Real-time grid + Dept chart) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '20px' }}>
              
              {/* Real-time employee status table */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">실시간 임직원 근태 목록</h3>
                    <p className="card-subtitle">오늘 일자 기준 전체 임직원의 상태 및 출입 기록</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <Search style={{ position: 'absolute', left: '10px', top: '9px', width: '13px', height: '13px', color: 'var(--text-2)' }} />
                      <input 
                        type="text" 
                        placeholder="이름/사번/부서 검색"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="search-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="table-wrapper status-table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>사원 정보</th>
                        <th>소속 부서</th>
                        <th>기준 출근</th>
                        <th>실제 출근</th>
                        <th>실제 퇴근</th>
                        <th>현재 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStatuses.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>
                            검색 조건에 맞는 임직원이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        filteredStatuses.map((emp, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp.name}</td>
                            <td style={{ color: 'var(--text-2)' }}>{emp.dept}</td>
                            <td style={{ fontSize: '13.5px', fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{emp.scheduleTime}</td>
                            <td style={{
                              fontSize: '13.5px',
                              color: emp.isLate ? 'var(--amber)' : 'var(--green)',
                              fontWeight: emp.isLate ? 700 : 500,
                              fontFamily: 'var(--font)',
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {emp.checkIn}
                              {emp.isLate && <span className="status-dot amber" style={{ display: 'inline-block', marginLeft: '6px' }} title="지각" />}
                            </td>
                            <td style={{ fontSize: '13.5px', fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{emp.checkOut}</td>
                            <td>
                              <span className={'badge ' + (
                                emp.status === '근무중' ? 'green' : 
                                emp.status === '퇴근' ? 'gray' : 
                                ['연차', '오전반차', '오후반차', '오전반반차', '오후반반차', '기타휴가'].includes(emp.status) ? 'purple' : 'red'
                              )}>
                                {emp.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right sidebar: Calendar widget + Today leaves + Dept chart */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <DashboardCalendarWidget
                  calendarMonth={calendarMonth}
                  setCalendarMonth={setCalendarMonth}
                  calendarLeaves={visibleDashboardLeaves}
                  employeeNameLookup={calendarEmployeeNameLookup}
                  selectedCalendarDate={selectedCalendarDate}
                  setSelectedCalendarDate={setSelectedCalendarDate}
                />

                {/* 부서별 출근 현황 */}
                <div className="card">
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h3 className="card-title">부서별 출근 현황</h3>
                    <p className="card-subtitle">부서별 정시율 및 실시간 출근 현황</p>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
                    {visibleDeptData.map((dept, idx) => {
                      const rate = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
                    

  return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 600 }}>
                            <span style={{ color: 'var(--text-1)' }}>{dept.name}</span>
                            <span style={{ color: 'var(--text-2)' }}>
                              {dept.present}/{dept.total} 紐?({rate}%)
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'var(--bg-overlay-md)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: rate + '%', height: '100%', background: 'var(--blue)', borderRadius: '4px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 2: ?붽컙 洹쇳깭蹂닿퀬??(MONTHLY - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'MONTHLY' && (
          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 className="card-title">월간 출근 현황표</h3>
                <p className="card-subtitle">선택 월의 일자별 임직원 출퇴근 상세 데이터 그리드</p>
              </div>

              {/* Month selector */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>선택 월</span>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    color: 'var(--text-1)', padding: '6px 14px', borderRadius: 'var(--r-sm)',
                    fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                  }}
                >
                  {getMonthsList().map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {monthlyLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: '10px' }}>
                <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>월간 보고서를 구성 중입니다...</span>
              </div>
            ) : (
              (() => {
                const days = getDaysInMonth(selectedMonth);
                const allEmps = visibleMonthlyEmployees;
                const logs = monthlyData?.allLogs || [];
                
                // ?뱀씪 理쒖냼?쒓컖 = 異쒓렐, 理쒕??쒓컖 = ?닿렐?쇰줈 泥섎━ (flag1=0 ?쇰컲?듬Ц 濡쒓렇 ???
                
                // 일자별 집계는 조정된 workDate 기준으로 묶고, 무시하기는 제외한다.
                const gridData = {}; // {empNo: {YYYY-MM-DD: {in: 'HH:MM', out: 'HH:MM', count: N}}}
                
                logs
                  .filter(log => !String(log.adjustedRole || log.eventType || '').includes('무시'))
                  .forEach(log => {
                    const dateStr = log.workDate || log.logTime.split(' ')[0];
                    const rawTimeStr = getAttendanceTimePart(log.logTime);
                    const checkoutTimeStr = log.correctedOutTime
                      ? getAttendanceTimePart(log.correctedOutTime)
                      : rawTimeStr;
                    
                    const logOrder = Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null;
                    const timeOrder = (() => {
                      const [h = 0, m = 0] = rawTimeStr.split(':').map((value) => Number(value) || 0);
                      return (h * 60) + m;
                    })();
                    const orderValue = logOrder ?? timeOrder;

                    if (!gridData[log.empNo]) gridData[log.empNo] = {};
                    if (!gridData[log.empNo][dateStr]) gridData[log.empNo][dateStr] = { in: null, out: null, count: 0, inOrder: null, outOrder: null };

                    const day = gridData[log.empNo][dateStr];
                    day.count++;
                    if (log.isLate) day.isLate = true;
                    if (!day.in || day.inOrder === null || orderValue < day.inOrder) {
                      day.in = rawTimeStr;
                      day.inOrder = orderValue;
                    }
                    const isCheckoutLog = log.isAdjustedCheckout || log.isCheckoutCandidate || String(log.adjustedRole || log.eventType || '').includes('퇴근') || String(log.eventType || '').includes('퇴근');
                    if (isCheckoutLog && (!day.out || day.outOrder === null || orderValue > day.outOrder)) {
                      day.out = checkoutTimeStr;
                      day.outOrder = orderValue;
                    }
                  });

                // 단일 로그(출근만)인 경우 퇴근 제거
                Object.values(gridData).forEach(empData =>
                  Object.values(empData).forEach(day => {
                    if (day.count <= 1 || day.in === day.out) day.out = null;
                  })
                );

                return (
                  <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
                        <tr>
                          <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 11, minWidth: '150px' }}>임직원</th>
                          {days.map(d => {
                            const holidayName = getHolidayName(d.dateStr);
                            const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                            return (
                              <th key={d.dateStr} style={{ 
                                minWidth: '110px', textAlign: 'center',
                                color: d.dayOfWeek === '일' || !!holidayName ? 'var(--red)' : d.dayOfWeek === '토' ? 'var(--blue)' : 'var(--text-1)',
                                background: isWE ? 'rgba(239, 68, 68, 0.04)' : 'transparent'
                              }}>
                                {d.formatted.split('(')[0]}<br/>
                                <small style={{ opacity: 0.8 }}>({d.dayOfWeek})</small>
                                {holidayName && (
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', marginTop: '2px', lineHeight: 1.2 }}>
                                    {holidayName}
                                  </div>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {allEmps.map(emp => (
                          <tr key={emp.empNo}>
                            <td style={{ 
                              position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 5,
                              fontWeight: 700, borderRight: '1px solid var(--border)'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.2 }}>
                                <span style={{ color: 'var(--text-1)' }}>{emp.name}</span>
                                <small style={{ color: 'var(--text-2)', fontWeight: 500 }}>({emp.dept})</small>
                              </div>
                            </td>
                            {days.map(d => {
                              const dayStats = gridData[emp.empNo]?.[d.dateStr];
                              const holidayName = getHolidayName(d.dateStr);
                              const isWE = d.dayOfWeek === '일' || d.dayOfWeek === '토' || !!holidayName;
                              
                              // Check leave for this employee
                              const dateCompact = d.dateStr.replace(/-/g, '');
                              const leave = (monthlyData?.leaves || []).find(l => 
                                l.empNo === emp.empNo && 
                                dateCompact >= l.startDate && 
                                dateCompact <= l.endDate
                              );

                              const leaveMeta = leave ? getLeaveMeta(leave, dayStats) : null;
                              const leaveDetail = leave ? getLeaveDisplaySummary(leave, dayStats) : '';
                              const timeText = dayStats?.in || dayStats?.out
                              ? String(dayStats.in || '-') + '\n' + String(dayStats.out || '-')
                                : '-';

                              return (
                                <td key={d.dateStr} style={{ 
                                  textAlign: 'center', fontSize: '12px', whiteSpace: 'pre-line',
                                  background: dayStats?.isLate
                                    ? 'rgba(245, 158, 11, 0.12)'
                                    : isWE
                                      ? 'rgba(239, 68, 68, 0.04)'
                                      : 'transparent',
                                  color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)',
                                  fontWeight: leave ? 700 : 500
                                }}>
                                  {leave ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          maxWidth: '100%',
                                          padding: '2px 7px',
                                          borderRadius: '999px',
                                          border: '1px solid ' + leaveMeta.border,
                                          background: leaveMeta.bg,
                                          color: leaveMeta.color,
                                          whiteSpace: 'nowrap',
                                          fontWeight: 700,
                                          lineHeight: 1.2
                                        }}
                                      >
                                        {leaveDetail}
                                      </span>
                                      {timeText !== '-' && (
                                        <span style={{ fontSize: '12px', color: dayStats?.isLate ? 'var(--amber)' : 'var(--text-1)', fontWeight: 600, lineHeight: 1.25, whiteSpace: 'pre-line' }}>
                                          {timeText}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    timeText
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 3: ?곸꽭 洹쇰Т?몃옒而?(TRACKER - ADMIN 諛??쇰컲 ?좎? 怨듯넻 酉?
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {(activeTab === 'TRACKER' || activeTab === 'MY_PORTAL') && (
          <div className="tracker-surface">
            
            {/* If MY_PORTAL (Regular Employee portal), show Clock-in/out manual buttons first */}
            {activeTab === 'MY_PORTAL' && (
              <div className="tracker-portal-grid" style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '20px'
              }}>
                {/* Manual checkin panel */}
                <div className="card tracker-panel tracker-panel--accent" style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  backdropFilter: 'blur(30px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock style={{ width: 18, height: 18, color: 'var(--blue)' }} />
                      <span>오늘 출퇴근 기록</span>
                    </h3>
                    <p className="card-subtitle">모바일/PC에서 간편 출퇴근을 기록하고 비고를 남깁니다.</p>
                  </div>

                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
                    {actionMessage && (
                      <div style={{
                        padding: '10px 14px', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600,
                        background: actionMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: actionMessage.type === 'success' ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                        color: actionMessage.type === 'success' ? '#a7f3d0' : '#fca5a5'
                      }}>
                        {actionMessage.text}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>비고 및 특이사항 입력</label>
                      <input 
                        type="text"
                        placeholder="예: 탄력근무, 외근 출발, 깜빡하고 입력 누락"
                        value={manualNote}
                        onChange={e => setManualNote(e.target.value)}
                        className="form-input"
                        style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <button 
                        onClick={() => handleManualCheck('출근')}
                        disabled={isCheckinLoading}
                        className="login-btn"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', marginTop: 0 }}
                      >
                        출근 완료 처리
                      </button>
                      <button 
                        onClick={() => handleManualCheck('퇴근')}
                        disabled={isCheckinLoading}
                        className="login-btn"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', marginTop: 0 }}
                      >
                        퇴근 완료 처리
                      </button>
                    </div>
                  </div>
                </div>

                {/* Today's status widget for self */}
                <div className="card tracker-panel tracker-panel--soft">
                  <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                    <h3 className="card-title">오늘 근태 처리</h3>
                    <p className="card-subtitle">오늘 내 실시간 출입 기록 현황</p>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}>
                    {(() => {
                      const today = new Date();
                      const offset = today.getTimezoneOffset();
                      const localDate = new Date(today.getTime() - (offset * 60 * 1000));
                      const todayStr = localDate.toISOString().split('T')[0];

                      const myTodayLogs = (monthlyData?.allLogs || []).filter(l => l.empNo === myEmpNo && l.logTime.startsWith(todayStr));
                      if (myTodayLogs.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '20px' }}>
                            ?ㅻ뒛 ?섏쭛??濡쒓렇媛 ?꾩쭅 ?놁뒿?덈떎.
                          </div>
                        );
                      }

                      return myTodayLogs.map((log, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-overlay-sm)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className={'badge ' + (log.eventType === '異쒓렐' ? 'green' : 'gray')}>
                              {log.eventType}
                            </span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>
                              {log.logTime.split(' ')[1]}
                            </span>
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                            湲곕줉泥? {log.gateName}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Standard Calendar Tracker Detail */}
            <div className="card tracker-panel tracker-panel--main">
              <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 className="card-title">개인별 근무일정 상세 트래커</h3>
                  <p className="card-subtitle">일자별 정상 출입시간, 실제 근무시간 및 초과근무 분석</p>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Employee combobox search */}
                  {
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>대상 직원</span>
                      <div style={{ position: 'relative', width: '220px' }}>
                        <input
                          type="text"
                          placeholder="이름 검색..."
                          value={trackerSearchQuery}
                          onFocus={() => setShowTrackerCombobox(true)}
                          onChange={e => {
                            setTrackerSearchQuery(e.target.value);
                            setShowTrackerCombobox(true);
                          }}
                          style={{
                            width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                            borderRadius: 'var(--r-sm)', padding: '6px 12px 6px 30px', fontSize: '14px',
                            color: 'var(--text-1)', outline: 'none'
                          }}
                        />
                        <Search style={{ position: 'absolute', left: '10px', top: '9px', width: '13px', height: '13px', color: 'var(--text-2)' }} />
                        {showTrackerCombobox && (
                          <div style={{
                            position: 'absolute', top: '38px', left: 0, right: 0, background: 'var(--bg-card)',
                            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', zIndex: 100,
                            maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 15px rgba(0,0,0,0.5)'
                          }}>
                            {visibleTrackerEmployees
                              .filter(e => e.name.includes(trackerSearchQuery))
                              .map(e => (
                                <div
                                  key={e.empNo}
                                  onClick={() => {
                                    setSelectedEmployee(e.empNo);
                                    setTrackerSearchQuery(e.name);
                                    setShowTrackerCombobox(false);
                                  }}
                                  style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: '14px',
                                    background: selectedEmployee === e.empNo ? 'rgba(79, 142, 247, 0.12)' : 'transparent',
                                    color: 'var(--text-1)'
                                  }}
                                >
                                  {e.name} ({e.dept})
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  }

                  {/* Month Select */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)' }}>선택 월</span>
                    <select
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(e.target.value)}
                      style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)',
                        color: 'var(--text-1)', padding: '6px 14px', borderRadius: 'var(--r-sm)',
                        fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                      }}
                    >
                      {getMonthsList().map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Correction Overlay Panel */}
              {correctionTarget && (
                <div className="tracker-correction" style={{ background: 'rgba(79, 142, 247, 0.08)', border: '1px solid var(--blue)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <form onSubmit={handleCorrectionSubmit} style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.85fr 1.2fr auto', gap: '12px', alignItems: 'stretch' }}>
                    <div className="tracker-correction__dateblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '210px' }}>
                      <span className="tracker-correction__label" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>?섏젙 ????쇱옄</span>
                      <span className="tracker-correction__value" style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{correctionTarget.workDate}</span>
                      <span className="tracker-correction__sub" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>??? {correctionTarget.empName}</span>
                    </div>
                    <div className="tracker-correction__timeblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span className="tracker-correction__label" style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>?닿렐 ?쒓컙 (?섏젙蹂?</span>
                      <input 
                        type="time" 
                        value={correctedOutTime}
                        onChange={e => setCorrectedOutTime(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff' }}
                        required
                      />
                    </div>
                    <div className="tracker-correction__reasonblock tracker-correction__field" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)', fontWeight: 600 }}>?ъ쑀</span>
                      <input 
                        type="text" 
                        placeholder="?? ?꾩뾽 ?뱀씤 珥덇낵洹쇰Т 諛섏쁺, ?닿렐 ?낅젰 ?꾨씫 蹂댁젙"
                        value={correctionReason}
                        onChange={e => setCorrectionReason(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff', width: '100%' }}
                        required
                      />
                    </div>
                    <div className="tracker-correction__actions" style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                      <button type="submit" className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--blue)' }}>蹂寃??뱀씤</button>
                      <button type="button" onClick={() => setCorrectionTarget(null)} className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--bg-overlay-md)' }}>痍⑥냼</button>
                    </div>
                  </form>
                </div>
              )}

              {monthlyLoading ? (
                <div className="tracker-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: '10px' }}>
                  <RefreshCw style={{ width: 24, height: 24, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>洹쇰Т ?꾪솴 ?곗씠?곕? ?섏쭛 以묒엯?덈떎...</span>
                </div>
              ) : (
                (() => {
                  if (!selectedEmployee) {
                    return (
                      <div className="tracker-empty" style={{ display: 'flex', flex: 1, minHeight: '300px', alignItems: 'center', justifyContent: 'center' }}>
                        寃?됰??먯꽌 ?ъ썝??吏?뺥빐二쇱꽭??
                      </div>
                    );
                  }

                  const allEmps = visibleTrackerEmployees;
                  const targetEmp = allEmps.find(e => e.empNo === selectedEmployee);
                  const logs = monthlyData?.allLogs || [];
                  const cells = getCalendarCells(selectedMonth);

                  // Map daily stats
                  const dailyStats = {}; // {YYYY-MM-DD: {in: 'HH:MM', out: 'HH:MM', isLate: boolean, correctedOutTime, correctionReason}}
                  
                  // Map schedule overrides for target employee
                  const overrides = (monthlyData?.overrides || []).filter(o => o.emp_no === selectedEmployee);
                  const overrideMap = {};
                  overrides.forEach(o => {
                    overrideMap[o.work_date] = o;
                  });

                  // ?쇱옄蹂?吏묎퀎??議곗젙??workDate 湲곗??쇰줈 臾띕뒗??
                  const empDayLogs = {}; // dateStr -> [{ timeStr, workOrder, log }]
                  logs
                    .filter(log => log.empNo === selectedEmployee)
                    .filter(log => !String(log.adjustedRole || log.eventType || '').includes('무시'))
                    .forEach(log => {
                    const dateStr = log.workDate || log.logTime.split(' ')[0];
                    const timeStr = getAttendanceTimePart(log.logTime);
                    if (!empDayLogs[dateStr]) empDayLogs[dateStr] = [];
                    empDayLogs[dateStr].push({
                      timeStr,
                      workOrder: Number.isFinite(Number(log.workOrder)) ? Number(log.workOrder) : null,
                      log,
                    });
                  });

                  Object.entries(empDayLogs).forEach(([dateStr, entries]) => {
                    if (!dailyStats[dateStr]) {
                      dailyStats[dateStr] = { in: null, out: null, isLate: false, correctedOutTime: null, correctionReason: null };
                    }
                    const sorted = entries.sort((a, b) => {
                      const aOrder = Number.isFinite(Number(a.workOrder)) ? Number(a.workOrder) : null;
                      const bOrder = Number.isFinite(Number(b.workOrder)) ? Number(b.workOrder) : null;
                      if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
                      if (aOrder !== null && bOrder === null) return -1;
                      if (aOrder === null && bOrder !== null) return 1;
                      return a.timeStr.localeCompare(b.timeStr) || String(a.log.logTime || '').localeCompare(String(b.log.logTime || ''));
                    });
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];

                    // 異쒓렐: 媛???대Ⅸ 濡쒓렇
                    dailyStats[dateStr].in = first.timeStr;
                    dailyStats[dateStr].isLate = first.log.isLate || false;

                    // ?닿렐: 媛????? 濡쒓렇 (異쒓렐怨??ㅻ? ?뚮쭔)
                    if (sorted.length > 1 && last.timeStr !== first.timeStr) {
                      dailyStats[dateStr].out = last.timeStr;
                      if (last.log.correctedOutTime) {
                        dailyStats[dateStr].correctedOutTime = getAttendanceTimePart(last.log.correctedOutTime);
                        dailyStats[dateStr].correctionReason = last.log.correctionReason;
                      }
                    }
                  });

                  // Calculate summaries
                  let workingDaysCount = 0;
                  let latenessCount = 0;
                  let totalHolidayWorkHours = 0;
                  
                  Object.entries(dailyStats).forEach(([dt, stat]) => {
                    if (stat.in) workingDaysCount++;
                    if (stat.isLate) latenessCount++;
                    if (isDateHoliday(dt) && stat.in && stat.out) {
                      const workHours = calculateWorkHours(stat.in, stat.out);
                      if (workHours) {
                        const h = parseFloat(workHours.split('?쒓컙')[0]);
                        totalHolidayWorkHours += h;
                      }
                    }
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Personal Widget Panel */}
                      {targetEmp && (
                        <div className="tracker-summary" style={{
                          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
                          background: 'var(--bg-overlay-sm)', borderRadius: 'var(--r-md)',
                          padding: '12px 18px', border: '1px solid var(--border)'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>조회 사원</span>
                            <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-1)' }}>{targetEmp.name} <small style={{ fontWeight: 500, color: 'var(--text-2)' }}>({targetEmp.dept})</small></span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>지정 기준 출근 시각: {targetEmp.scheduleTime || '08:00'}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>출근 일수</span>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--green)' }}>{workingDaysCount} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>일</small></span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>지각 횟수</span>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: latenessCount > 0 ? 'var(--amber)' : 'var(--text-1)' }}>{latenessCount} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>회</small></span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderLeft: '1px solid var(--border)', paddingLeft: '18px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--purple)' }}>대체휴가 대상(주말근무)</span>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--purple)' }}>{Math.floor(totalHolidayWorkHours)} <small style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 14 }}>시간</small></span>
                          </div>
                        </div>
                      )}

                      {/* Calendar Grid */}
                      <div className="tracker-calendar-shell" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                        <div className="tracker-calendar-head" style={{
                          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                          background: 'var(--bg-overlay-md)', borderBottom: '1px solid var(--border)',
                          textAlign: 'center', padding: '10px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-2)'
                        }}>
                          <div style={{ color: 'var(--red)' }}>일</div>
                          <div>월</div>
                          <div>화</div>
                          <div>수</div>
                          <div>목</div>
                          <div>금</div>
                          <div style={{ color: 'var(--blue)' }}>토</div>
                        </div>

                        <div className="tracker-calendar-grid" style={{
                          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                          gridAutoRows: 'minmax(92px, 1fr)', background: 'var(--bg-card)'
                        }}>
                          {cells.map((cell, idx) => {
                            if (cell.empty) {
                              return <div key={idx} className="tracker-day-cell tracker-day-cell--empty" style={{ background: 'var(--bg-overlay-sm)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />;
                            }

                            const stat = dailyStats[cell.dateStr];
                            const hasClockIn = stat && stat.in;
                            const hasClockOut = stat && (stat.out || stat.correctedOutTime);
                            const isLate = stat && stat.isLate;
                            const holidayName = getHolidayName(cell.dateStr);

                            const dayOfWeek = idx % 7;
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || !!holidayName;

                            // Checks overrides
                            const dayOverride = overrideMap[cell.dateStr];

                            // Check leave
                            const dateCompact = cell.dateStr.replace(/-/g, '');
                            const dayLeave = (monthlyData?.leaves || []).find(l => 
                              l.empNo === selectedEmployee && 
                              dateCompact >= l.startDate && 
                              dateCompact <= l.endDate
                            );

                            let dayNumColor = 'var(--text-1)';
                            if (dayOfWeek === 0 || holidayName) dayNumColor = 'var(--red)';
                            else if (dayOfWeek === 6) dayNumColor = 'var(--blue)';

                            const workHoursStr = calculateWorkHours(stat?.in, stat?.correctedOutTime || stat?.out);
                            
                            // Calculate Overtime (Only for designated overtime teams)
                            const isOTTeam = targetEmp && ['?ъ뾽愿由?1?', '?ъ뾽愿由?2?', '?ъ뾽愿由?3?', '?ъ뾽媛쒕컻?'].includes(targetEmp.dept);
                            const overtimeStr = (isOTTeam && hasClockOut) ? calculateOvertime(stat?.in, stat?.correctedOutTime || stat?.out) : null;

                              return (
                              <div key={idx} className="tracker-day-cell" style={{
                                padding: '8px', borderRight: '1px solid var(--border)',
                                borderBottom: '1px solid var(--border)', display: 'flex',
                                flexDirection: 'column', gap: '3px', position: 'relative',
                                background: isWeekend ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                                minHeight: '92px'
                              }}>
                                <div className="tracker-day-cell__top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span className="tracker-day-cell__date" style={{ fontSize: '14px', fontWeight: 700, color: dayNumColor }}>{cell.dayNum}</span>
                                  {dayOverride && (
                                    <span className="tracker-day-cell__override" style={{ fontSize: '10px', background: 'var(--blue)', color: '#fff', padding: '1px 3px', borderRadius: '3px' }} title={dayOverride.note}>
                                      議곗젙 {dayOverride.schedule_start.substring(0, 5)}
                                    </span>
                                  )}
                                  {holidayName && (
                                    <span className="tracker-day-cell__holiday" style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 700 }} title={holidayName}>
                                      {holidayName}
                                    </span>
                                  )}
                                </div>

                                <div className="tracker-day-cell__body" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                  {dayLeave && (
                                    <span
                                      className="tracker-day-cell__leave"
                                      style={{
                                        fontSize: '11px',
                                        color: getLeaveMeta(dayLeave, stat).color,
                                        background: getLeaveMeta(dayLeave, stat).bg,
                                        border: '1px solid ' + getLeaveMeta(dayLeave, stat).border,
                                        padding: '2px 6px',
                                        borderRadius: '999px',
                                        width: 'fit-content',
                                        whiteSpace: 'nowrap',
                                        fontWeight: 700,
                                        lineHeight: 1.2
                                      }}
                                      title={dayLeave.leaveName}
                                    >
                                      {getLeaveDisplaySummary(dayLeave, stat)}
                                    </span>
                                  )}

                                  {hasClockIn && (
                                    <div className="tracker-day-cell__metric tracker-day-cell__in" style={{ fontSize: '12.5px', color: isLate ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
                                      <span className="tracker-day-cell__metric-label">異쒓렐</span>
                                      <span className="tracker-day-cell__metric-value">{stat.in}</span>
                                      {isLate && <span className="tracker-day-cell__metric-note">(吏媛?</span>}
                                    </div>
                                  )}

                                  {hasClockOut && (
                                    <div className="tracker-day-cell__metric tracker-day-cell__out" style={{ fontSize: '12.5px', color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span className="tracker-day-cell__metric-main">
                                        <span className="tracker-day-cell__metric-label">?닿렐</span>
                                        <span className="tracker-day-cell__metric-value">
                                          {stat.correctedOutTime ? (
                                            <span style={{ color: 'var(--blue)' }} title={'?먮옒 ?쒓컙: ' + stat.out + ' (?ъ쑀: ' + stat.correctionReason + ')'}>
                                              {stat.correctedOutTime}*
                                            </span>
                                          ) : stat.out}
                                        </span>
                                      </span>

                                      {/* Correct button (Admin/Leader only) */}
                                      {(isAdmin || isLeader) && (
                                        <button 
                                          onClick={() => {
                                            setCorrectionTarget({ empNo: selectedEmployee, workDate: cell.dateStr, empName: targetEmp.name, originalOut: stat.out });
                                            setCorrectedOutTime(stat.correctedOutTime || stat.out || '18:00');
                                          }}
                                          className="tracker-day-cell__edit"
                                          style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '10.5px', cursor: 'pointer', padding: '1px 3px' }}
                                        >
                                          ?섏젙
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* ?ㅼ젣 洹쇰Т?쒓컙 */}
                                  {workHoursStr && (
                                    <div className="tracker-day-cell__metric tracker-day-cell__work" style={{ fontSize: '11.5px', color: 'var(--text-2)', fontWeight: 500, marginTop: '2px' }}>
                                      <span className="tracker-day-cell__metric-label">洹쇰Т</span>
                                      <span className="tracker-day-cell__metric-value">{workHoursStr}</span>
                                    </div>
                                  )}

                                  {/* 珥덇낵?쒓컙 ?쒖떆 */}
                                  {overtimeStr && (
                                    <div className="tracker-day-cell__metric tracker-day-cell__overtime" style={{ fontSize: '11px', color: 'var(--amber)', background: 'rgba(245, 158, 11, 0.1)', padding: '1px 3px', borderRadius: '3px', width: 'fit-content', marginTop: '2px', fontWeight: 600 }}>
                                      <span className="tracker-day-cell__metric-label">珥덇낵</span>
                                      <span className="tracker-day-cell__metric-value">{overtimeStr.text}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

          </div>
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 4: ?꾩쭅???닿? ?꾪솴 (LEAVES - 怨듯넻)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'LEAVES' && (
          <DashboardCalendarWidget
            calendarMonth={selectedMonth || calendarMonth}
            setCalendarMonth={setSelectedMonth}
            calendarLeaves={visibleLeaves}
            employeeNameLookup={calendarEmployeeNameLookup}
            selectedCalendarDate={leaveCalendarDate}
            setSelectedCalendarDate={setLeaveCalendarDate}
            eyebrow="전사 휴가 현황"
          />
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 5: 吏곸썝 ?쇱젙 愿由?(EMPLOYEES - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'EMPLOYEES' && (isAdmin || isLeader) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Override target panel */}
            {overrideTarget && (
              <div style={{ background: 'rgba(79, 142, 247, 0.08)', border: '1px solid var(--blue)', borderRadius: '8px', padding: '14px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
                  [{overrideTarget.name}] ?ъ썝 ?쇱옄蹂??밸퀎 洹쇰Т?쇱젙 議곗젙
                </h4>
                <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>?곸슜 ?쇱옄</span>
                    <input 
                      type="date"
                      value={overrideDate}
                      onChange={e => setOverrideDate(e.target.value)}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>異쒓렐 湲곗??쒓컖</span>
                    <select
                      value={overrideStart}
                      onChange={e => setOverrideStart(e.target.value)}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff' }}
                    >
                      {SCHEDULE_TIME_OPTIONS.map(t => <option key={t} value={t + ':00'}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>사유 / 메모</span>
                    <input 
                      type="text"
                      placeholder="예: 조기 출근 조정, 일정 참고로 10시 출근 인정"
                      value={overrideNote}
                      onChange={e => setOverrideNote(e.target.value)}
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#fff', width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--blue)' }}>일정 조정 적용</button>
                    <button type="button" onClick={() => setOverrideTarget(null)} className="login-btn" style={{ marginTop: 0, padding: '8px 16px', background: 'var(--bg-overlay-md)' }}>취소</button>
                  </div>
                </form>
              </div>
            )}

            <div className="card">
              <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
                <div>
                  <h3 className="card-title">임직원 기본 근무일정 목록</h3>
                  <p className="card-subtitle">직원별 고정 기본 출근 시간을 관리하고 일자별 예외 조정을 수행합니다.</p>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>사원 정보</th>
                      <th>소속 부서</th>
                      <th>현재 지정 출근시각</th>
                      <th>출근 시간 변경</th>
                      <th className="text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = (data?.allEmployees || []).filter(e => e.name.includes(empSearchQuery));
                      return filtered.map((emp, i) => {
                        const currentSchedule = tempSchedules[emp.empNo] !== undefined 
                          ? tempSchedules[emp.empNo] 
                          : emp.scheduleTime || '08:00';
                        const isChanged = currentSchedule !== (emp.scheduleTime || '08:00');
                        const isSaving = scheduleLoading[emp.empNo];

                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp.name} ({emp.empNo})</td>
                            <td>{emp.dept}</td>
                            <td style={{ fontWeight: 700, color: 'var(--blue)' }}>
                              {emp.scheduleTime || '08:00'}
                            </td>
                            <td>
                              <select
                                value={currentSchedule}
                                onChange={e => {
                                  const val = e.target.value;
                                  setTempSchedules(prev => ({ ...prev, [emp.empNo]: val }));
                                }}
                                style={{
                                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                                  color: 'var(--text-1)', padding: '6px 12px', borderRadius: 'var(--r-sm)',
                                  fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                                }}
                              >
                                {SCHEDULE_TIME_OPTIONS.map(t => (
                                  <option key={t} value={t}>
                                    {t}{t === '08:00' ? ' (湲곕낯)' : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="text-right" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                disabled={!isChanged || isSaving}
                                onClick={() => handleSaveSchedule(emp.empNo, currentSchedule)}
                                style={{
                                  padding: '6px 12px', border: 'none', borderRadius: '6px',
                                  background: isChanged ? 'var(--blue)' : 'var(--bg-overlay-sm)',
                                  color: isChanged ? '#fff' : 'var(--text-3)',
                                  fontWeight: 700, fontSize: '13.5px', cursor: isChanged ? 'pointer' : 'default',
                                  transition: 'var(--ease)', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}
                              >
                                {isSaving ? (
                                  <RefreshCw style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <span>저장</span>
                                )}
                              </button>
                              
                              <button
                                onClick={() => setOverrideTarget({ empNo: emp.empNo, name: emp.name })}
                                style={{
                                  padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '6px',
                                  background: 'rgba(79, 142, 247, 0.1)', color: 'var(--blue)',
                                  fontWeight: 700, fontSize: '13.5px', cursor: 'pointer'
                                }}
                              >
                                일자별 조정
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 5B: 吏곸썝 愿由?(EMPLOYEE_ADMIN - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'EMPLOYEE_ADMIN' && isAdmin && (
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
                      <th style={{ minWidth: '180px' }}>?대쫫 / ?щ쾲</th>
                      <th style={{ minWidth: '180px' }}>?</th>
                      <th style={{ minWidth: '150px' }}>吏곴툒</th>
                      <th style={{ minWidth: '150px' }}>吏곸콉</th>
                      <th style={{ minWidth: '110px' }}>愿由ъ옄</th>
                      <th style={{ minWidth: '220px' }}>珥덇린 鍮꾨?踰덊샇</th>
                      <th className="text-right" style={{ minWidth: '220px' }}>?묒뾽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeAdminLoading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-2)' }}>
                          吏곸썝 ?뺣낫瑜?遺덈윭?ㅻ뒗 以?..
                        </td>
                      </tr>
                    ) : (() => {
                      const q = employeeAdminSearch.trim().toLowerCase();
                      const filtered = employeeAdminData.filter((emp) =>
                        String(emp.name || '') + ' ' + String(emp.empNo || '') + ' ' + String(emp.dept || '') + ' ' + String(emp.rank || '') + ' ' + String(emp.position || '')
                          .toLowerCase()
                          .includes(q)
                      );

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-2)' }}>
                              寃??寃곌낵媛 ?놁뒿?덈떎.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((emp) => {
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
                                disabled={!emp.hasAccount}
                              >
                                <option value="">?좏깮</option>
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
                                disabled={!emp.hasAccount}
                              >
                                <option value="">?좏깮</option>
                                {positionOptions.map((position) => (
                                  <option key={position} value={position}>{position}</option>
                                ))}
                              </select>
                            </td>

                            <td>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-1)', fontSize: '14px', fontWeight: 600 }}>
                                <input
                                  type="checkbox"
                                  checked={!!(draft.isAdmin ?? emp.isAdmin)}
                                  onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { isAdmin: e.target.checked })}
                                  style={{ width: '16px', height: '16px' }}
                                  disabled={!emp.hasAccount}
                                />
                                Admin
                              </label>
                            </td>

                            <td>
                              <input
                                type="password"
                                value={draft.resetPassword || ''}
                                onChange={(e) => updateEmployeeAdminDraft(emp.empNo, { resetPassword: e.target.value })}
                                placeholder="??鍮꾨?踰덊샇"
                                className="form-input"
                                style={{ ...regFieldStyle, width: '100%', padding: '8px 10px' }}
                                disabled={!emp.hasAccount}
                              />
                            </td>

                            <td className="text-right" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                                disabled={!!resetting || !emp.hasAccount}
                                style={{
                                  padding: '6px 12px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '6px',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: 'var(--amber)',
                                  fontWeight: 700,
                                  fontSize: '13px',
                                  cursor: resetting || !emp.hasAccount ? 'default' : 'pointer',
                                  opacity: emp.hasAccount ? 1 : 0.45
                                }}
                              >
                                {resetting ? '초기화 중' : '암호 초기화'}
                              </button>
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
                      });
                    })()}
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
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 6: ?섎룞 湲곕줉 寃곗옱 (MANUAL_APPROVAL - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'MANUAL_APPROVAL' && (isAdmin || isLeader) && (
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
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 7: 珥덇낵?쒓컙 ?꾩쟻 諛??뺤궛 愿由?(OVERTIME - 怨듯넻)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'OVERTIME' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Create Period Form (Admin only) */}
            {isAdmin && (
              <div className="card">
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 className="card-title">초과근무 집계 기간 등록</h3>
                  <p className="card-subtitle">초과시간을 합산해 정산 관리할 기간을 등록합니다.</p>
                </div>
                <div className="card-body" style={{ marginTop: '10px' }}>
                  <form onSubmit={handleCreatePeriod} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>기간명</span>
                      <input 
                        type="text" 
                        placeholder="예: 2026년 2분기 초과정산" 
                        value={newPeriodName}
                        onChange={e => setNewPeriodName(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: '#fff' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>시작일</span>
                      <input 
                        type="date" 
                        value={newPeriodStart}
                        onChange={e => setNewPeriodStart(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: '#fff' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>종료일</span>
                      <input 
                        type="date" 
                        value={newPeriodEnd}
                        onChange={e => setNewPeriodEnd(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: '#fff' }}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>설명 / 비고</span>
                      <input 
                        type="text" 
                        placeholder="분기별 연차 대체 또는 정산 반영용"
                        value={newPeriodNote}
                        onChange={e => setNewPeriodNote(e.target.value)}
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', color: '#fff', width: '100%' }}
                      />
                    </div>
                    <button type="submit" className="login-btn" style={{ marginTop: 0, padding: '8px 20px', background: 'var(--blue)' }}>등록</button>
                  </form>
                </div>
              </div>
            )}

            {/* Period selector */}
            <div className="card">
              <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h3 className="card-title">기간별 누적 초과시간 현황</h3>
                  <p className="card-subtitle">정산 기간 내 대상자별 누적 초과근무 현황 리스트</p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-2)' }}>집계 대상 기간</span>
                  <select
                    value={selectedPeriodId}
                    onChange={e => setSelectedPeriodId(e.target.value)}
                    style={{
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      color: 'var(--text-1)', padding: '6px 14px', borderRadius: 'var(--r-sm)',
                      fontSize: '14px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                    }}
                  >
                    {periods.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.start_date} ~ {p.end_date})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Accumulated Overtime Table */}
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>사원번호</th>
                      <th>성명</th>
                      <th>소속 부서</th>
                      <th>기간 내 근무일수</th>
                      <th>누적 초과 근무시간</th>
                      {isAdmin && <th className="text-right">관리</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const activePeriod = periods.find(p => String(p.id) === String(selectedPeriodId));
                      if (!activePeriod) {
                        return (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '40px' }}>
                              선택된 집계 기간 정보가 없습니다.
                            </td>
                          </tr>
                        );
                      }

                      // Gather all employees matching the filter or self
                      const emps = visibleMonthlyEmployees;

                      const startStr = activePeriod.start_date;
                      const endStr = activePeriod.end_date;

                      // Compute sum of overtime hours per employee
                      // For a specific date, overtime is checkOut - 19:00 (for OT teams)
                      return emps.map(emp => {
                        const logs = monthlyData?.allLogs || [];
                        // Group by date
                        const dailyOuts = {}; // {workDate: timeString}
                        
                        logs.filter(l => l.empNo === emp.empNo && l.logTime >= startStr && l.logTime <= endStr + 'T23:59:59').forEach(l => {
                          const dt = l.logTime.split(' ')[0];
                          const tm = l.logTime.split(' ')[1].substring(0, 5);
                          if (l.eventType === '퇴근') {
                            if (!dailyOuts[dt] || tm > dailyOuts[dt]) {
                              dailyOuts[dt] = tm;
                            }
                          }
                        });

                        let totalMinutes = 0;
                        let daysWorked = 0;

                        Object.entries(dailyOuts).forEach(([dt, tm]) => {
                          daysWorked++;
                          const ot = calculateOvertime(tm);
                          if (ot) {
                            totalMinutes += ot.h * 60 + ot.m;
                          }
                        });

                        const accH = Math.floor(totalMinutes / 60);
                        const accM = totalMinutes % 60;

                        return (
                          <tr key={emp.empNo}>
                            <td style={{ fontWeight: 600 }}>{emp.empNo}</td>
                            <td style={{ fontWeight: 700, color: 'var(--text-1)' }}>{emp.name}</td>
                            <td>{emp.dept}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{daysWorked}일</td>
                            <td style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '15px' }}>
                              {accH}시간 {accM}분
                            </td>
                            {isAdmin && (
                              <td className="text-right">
                                <button 
                                  onClick={() => handleDeletePeriod(activePeriod.id)}
                                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px' }}
                                >
                                  <Trash2 style={{ width: 14, height: 14 }} />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 8: ?꾩씠???깅줉 (USER_REGISTER - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'USER_REGISTER' && isAdmin && (
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
        )}

        {/* ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??            TAB 9: 罹≪뒪 異쒖엯湲곕줉 ?낅줈??(CAPS_UPLOAD - ADMIN ?꾩슜)
            ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??*/}
        {activeTab === 'CAPS_UPLOAD' && isAdmin && (
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
                    accept=".csv,.tsv,.txt,.log,text/csv,text/plain"
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
        )}

      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .form-input {
          box-sizing: border-box;
          outline: none;
          transition: var(--ease);
        }
        .form-input:focus {
          border-color: var(--blue) !important;
          box-shadow: 0 0 0 3px rgba(79, 142, 247, 0.15);
        }
        
        .badge.purple {
          background: rgba(168, 85, 247, 0.1);
          color: #d8b4fe;
        }
      `}</style>
    </div>
  );
}

