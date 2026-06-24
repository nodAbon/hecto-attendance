'use client';

import { useEffect, useState } from 'react';
import { isLeaderPosition } from '../lib/roleUtils';
import { getTabFromLocation, getCurrentMonthKey } from '../lib/dashboardUtils';
import { getCookieValue } from '../lib/authStorage';

export function useDashboardAuth({
  setActiveTab,
  setViewDeptFilter,
  setSelectedEmployee,
  setSelectedMonth,
} = {}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [myEmpNo, setMyEmpNo] = useState('');
  const [myName, setMyName] = useState('');
  const [myRank, setMyRank] = useState('');
  const [myLoginId, setMyLoginId] = useState('');
  const [myDept, setMyDept] = useState('');
  const [myPosition, setMyPosition] = useState('');
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const requestedTab = getTabFromLocation();
    const currentMonth = getCurrentMonthKey();
    if (setSelectedMonth) setSelectedMonth(currentMonth);

    const syncAuthFromServer = async () => {
      const adminVal = ((getCookieValue('user-is-admin') || localStorage.getItem('user-is-admin')) === 'true');
      const positionVal = getCookieValue('user-position') || localStorage.getItem('user-position') || '';
      const empNoVal = getCookieValue('user-emp-no') || localStorage.getItem('user-emp-no') || '';
      const nameVal = getCookieValue('user-name') || localStorage.getItem('user-name') || '';
      const rankVal = getCookieValue('user-rank') || localStorage.getItem('user-rank') || '';
      const loginIdVal = getCookieValue('user-login-id') || localStorage.getItem('user-login-id') || '';
      const teamVal = getCookieValue('user-team') || localStorage.getItem('user-team') || '';

      setIsAdmin(adminVal);
      setIsLeader(isLeaderPosition(positionVal));
      setMyEmpNo(empNoVal);
      setMyName(nameVal);
      setMyRank(rankVal);
      setMyLoginId(loginIdVal);
      setMyDept(teamVal);
      setMyPosition(positionVal);

      if (!adminVal && !isLeaderPosition(positionVal) && empNoVal) {
        if (setActiveTab) setActiveTab(requestedTab);
        if (setViewDeptFilter) setViewDeptFilter(teamVal || 'ALL');
        if (setSelectedEmployee) setSelectedEmployee(empNoVal);
      } else if (setActiveTab) {
        setActiveTab(requestedTab);
      }

      try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
          window.location.assign('/login');
          return;
        }
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
          setIsLeader(isLeaderPosition(serverPosition));
          setMyEmpNo(serverEmpNo);
          setMyName(serverName);
          setMyRank(serverRank);
          setMyLoginId(serverLoginId);
          setMyDept(serverTeam);
          setMyPosition(serverPosition);

          localStorage.setItem('user-is-admin', String(serverAdmin));
          localStorage.setItem('user-position', serverPosition);
          localStorage.setItem('user-emp-no', serverEmpNo);
          localStorage.setItem('user-name', serverName);
          localStorage.setItem('user-rank', serverRank || '');
          localStorage.setItem('user-login-id', serverLoginId);
          localStorage.setItem('user-team', serverTeam);

          if (serverAdmin) {
            if (setActiveTab) setActiveTab(getTabFromLocation());
          } else {
            if (setViewDeptFilter) {
              setViewDeptFilter((prev) => {
                const normalizedPrev = String(prev ?? '').trim();
                if (normalizedPrev && normalizedPrev !== 'ALL') return prev;
                return serverTeam || 'ALL';
              });
            }
            if (setActiveTab) setActiveTab(getTabFromLocation());
            if (setSelectedEmployee) setSelectedEmployee(serverEmpNo);
          }
          setAuthChecking(false);
        } else {
          window.location.assign('/login');
        }
      } catch (err) {
        console.error('Auth sync failed:', err);
        window.location.assign('/login');
      }
    };

    syncAuthFromServer();
  }, [setActiveTab, setSelectedEmployee, setSelectedMonth, setViewDeptFilter]);

  return {
    isAdmin,
    isLeader,
    myEmpNo,
    myName,
    myRank,
    myLoginId,
    myDept,
    myPosition,
    authChecking,
  };
}
