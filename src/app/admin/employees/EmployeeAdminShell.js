'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Sun, Moon } from 'lucide-react';
import { formatClockTime } from '../../../lib/clock';
import { usePersistentTheme } from '../../../lib/usePersistentTheme';
import AppSidebar from '../../../components/AppSidebar';
import { getMainSidebarItems, sidebarActionIcons } from '../../../lib/sidebarConfig';

export default function EmployeeAdminShell({ title, subtitle, children, activeHref = '/admin/employees' }) {
  const router = useRouter();
  const [time, setTime] = useState('');
  const [userProfile, setUserProfile] = useState(() => {
    if (typeof window === 'undefined') {
      return { name: '', rank: '', loginId: '', empNo: '', team: '' };
    }
    return {
      name: localStorage.getItem('user-name') || '',
      rank: localStorage.getItem('user-rank') || '',
      loginId: localStorage.getItem('user-login-id') || '',
      empNo: localStorage.getItem('user-emp-no') || '',
      team: localStorage.getItem('user-team') || '',
    };
  });
  const [theme, setTheme] = usePersistentTheme('dark');
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setIsAdmin(localStorage.getItem('user-is-admin') === 'true');
      const pos = localStorage.getItem('user-position') || '';
      setIsLeader(pos === '팀장' || pos === '실장' || pos === '대표이사');
    }
    const tick = () => {
      setTime(formatClockTime(new Date()));
    };
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
        if (json?.success && json.user) {
          const nextProfile = {
            name: json.user.name || '',
            rank: json.user.rank || '',
            loginId: json.user.loginId || '',
            empNo: json.user.empNo || '',
            team: json.user.team || '',
          };
          setUserProfile(nextProfile);
          localStorage.setItem('user-name', nextProfile.name);
          localStorage.setItem('user-rank', nextProfile.rank);
          localStorage.setItem('user-login-id', nextProfile.loginId);
          localStorage.setItem('user-emp-no', nextProfile.empNo);
          localStorage.setItem('user-team', nextProfile.team);
        }
      } catch {
        // keep cached profile
      }
    };
    syncProfile();
  }, [mounted]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  const sidebarItems = getMainSidebarItems({
    isAdmin,
    isLeader,
    dept: userProfile.team,
    position: typeof window !== 'undefined' ? localStorage.getItem('user-position') || '' : ''
  }).map(item => {
    const tabMatch = item.href.match(/\?tab=([A-Z_]+)/);
    const itemTab = tabMatch ? tabMatch[1] : null;
    return {
      ...item,
      active: item.href === activeHref || item.activeHref === activeHref,
      onClick: () => {
        router.push(item.href);
      },
      href: itemTab ? undefined : item.href
    };
  });

  const footerActions = [
    {
      label: '로그아웃',
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
      color: 'var(--red)'
    },
    {
      label: '마이페이지',
      icon: sidebarActionIcons.mypage,
      href: '/mypage',
      color: 'var(--blue)'
    }
  ];

  const profileBadges = [
    ...(isAdmin ? [{ label: 'ADMIN', background: 'var(--red)', color: '#fff' }] : []),
    ...(isLeader ? [{ label: 'LEADER', background: 'var(--amber)', color: '#111' }] : []),
  ];

  return (
    <div className="ga-theme">
      <AppSidebar
        brandLabel="HECTO 근태관리"
        items={sidebarItems}
        profile={mounted ? {
          name: userProfile.name || '인사담당자',
          rank: userProfile.rank,
          loginId: userProfile.loginId,
          empNo: userProfile.empNo,
          team: userProfile.team
        } : {
          name: '',
          rank: '',
          loginId: '',
          empNo: '',
          team: ''
        }}
        profileBadges={profileBadges}
        footerActions={footerActions}
        version="v2.1.0"
      />

      <main className="main-content">
        <div className="top-bar">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{title}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, marginTop: 2 }}>{subtitle}</p>
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => router.refresh()} title="새로고침">
              <RefreshCw style={{ width: 15, height: 15 }} />
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
              {theme === 'dark' ? <Sun style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
            </button>
            <div className="time-display">{time}</div>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
