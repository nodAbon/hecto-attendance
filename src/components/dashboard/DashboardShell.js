'use client';

import React, { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, RefreshCw, Sun, Moon } from 'lucide-react';
import AppSidebar from '../AppSidebar';
import { getMainSidebarItems, sidebarActionIcons } from '../../lib/sidebarConfig';
import DashboardTab from '../tabs/DashboardTab';
import MonthlyTab from '../tabs/MonthlyTab';
import TrackerTab from '../tabs/TrackerTab';
import ScheduleTab from '../tabs/ScheduleTab';
import LeaveTab from '../tabs/LeaveTab';
import OvertimeTab from '../tabs/OvertimeTab';
import AdminPanelTabs from '../tabs/AdminPanelTabs';
import EmployeeAdminTab from '../tabs/EmployeeAdminTab';

function DashboardTabSync({ setActiveTab }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'DASHBOARD');
  }, [searchParams, setActiveTab]);
  return null;
}

const pageTitles = {
  DASHBOARD: '실시간 직원 상태 모니터링',
  MONTHLY: '기간별 직원 상태 현황',
  TRACKER: '개인 상세 근무 트래커',
  EMPLOYEES: '직원 근무일정 및 휴가 관리',
  EMPLOYEE_ADMIN: '직원 정보 수정 및 비밀번호 초기화',
  MY_PORTAL: '개인 근태 포털',
  LEAVES: '연차 사용 현황',
  OVERTIME: '초과근무 관리',
  MANUAL_APPROVAL: '수동 출퇴근 기록 심사',
  USER_REGISTER: '사용자 계정 등록',
  CAPS_UPLOAD: '캡스 출입기록 업로드',
};

const pageSubtitles = {
  DASHBOARD: '오늘 기준 출근, 부서 현황, 실시간 직원 상태를 집계합니다.',
  MONTHLY: '선택한 월의 출퇴근 및 근태 현황을 확인합니다.',
  TRACKER: '개인별 출근, 퇴근, 근무시간을 조회하고 조정합니다.',
  EMPLOYEES: '고정 근무일정과 일자별 휴가 및 조정을 관리합니다.',
  EMPLOYEE_ADMIN: '직원 기본 정보와 계정 초기 비밀번호를 관리합니다.',
  MY_PORTAL: '본인의 출퇴근 기록과 근무 현황을 확인합니다.',
  LEAVES: '직원들의 연차 및 휴가 사용 현황을 확인합니다.',
  OVERTIME: '지정 기간 동안 직원별 초과근무를 관리합니다.',
  MANUAL_APPROVAL: '직원들이 수동으로 입력한 출퇴근 기록을 심사합니다.',
  USER_REGISTER: '로그인 계정과 사원번호 정보를 연결해 등록합니다.',
  CAPS_UPLOAD: '캡스 출입기록 파일을 업로드해 월간 기록에 반영합니다.',
};

export default function DashboardShell({
  authChecking,
  loading,
  data,
  activeTab,
  setActiveTab,
  theme,
  toggleTheme,
  time,
  refreshing,
  fetchTodayData,
  viewDeptFilter,
  setViewDeptFilter,
  hasFullAccess,
  resolvedDeptFilterValue,
  deptOptions,
  myName,
  myRank,
  myLoginId,
  myEmpNo,
  myDept,
  isAdmin,
  isLeader,
  myPosition,
  selectedMonth,
  setSelectedMonth,
  selectedEmployee,
  setSelectedEmployee,
  monthlyData,
  monthlyLoading,
  calendarMonth,
  setCalendarMonth,
  selectedCalendarDate,
  setSelectedCalendarDate,
  leaveCalendarDate,
  setLeaveCalendarDate,
  visibleDashboardLeaves,
  visibleMonthlyEmployees,
  visibleTrackerEmployees,
  visibleScheduleEmployees,
  visibleLeaves,
  calendarEmployeeNameLookup,
  refreshAllData,
}) {
  const router = useRouter();

  const sidebarItems = useMemo(() => {
    const sourceItems = isAdmin
      ? getMainSidebarItems({ isAdmin: true, isLeader: false })
      : getMainSidebarItems({ isAdmin, isLeader, dept: myDept, position: myPosition });

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
  }, [activeTab, isAdmin, isLeader, myDept, myEmpNo, myPosition, router, setSelectedEmployee]);

  const footerActions = useMemo(() => ([
    {
      label: '로그아웃',
      icon: sidebarActionIcons.logout,
      onClick: async () => {
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
      },
      color: 'var(--red)',
    },
    {
      label: '마이페이지',
      icon: sidebarActionIcons.mypage,
      href: '/mypage',
      color: 'var(--blue)',
    },
  ]), []);

  if (authChecking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '12px', background: '#090f1e', color: '#fff' }}>
        <RefreshCw style={{ width: 32, height: 32, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '15px', fontWeight: 600 }}>인증 정보를 확인 중입니다...</span>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '12px', background: '#090f1e', color: '#fff' }}>
        <RefreshCw style={{ width: 32, height: 32, color: 'var(--blue)', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '15px', fontWeight: 600 }}>시스템 데이터를 불러오는 중입니다...</span>
      </div>
    );
  }

  return (
    <div className="ga-theme">
      <AppSidebar
        items={sidebarItems}
        profile={{
          name: myName || (isAdmin ? '관리자' : '직원'),
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

      <main className="main-content">
        <div className="top-bar">
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-1)' }}>
              {pageTitles[activeTab] || '근태 관리'}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: '500', marginTop: '2px' }}>
              {pageSubtitles[activeTab] || '근태 시스템을 관리합니다.'}
            </p>
          </div>

          <div className="top-actions">
            {data?.isDemo && (
              <div className="db-indicator" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
                <AlertTriangle style={{ width: 14, height: 14 }} />
                <span className="db-name">데모 모드</span>
              </div>
            )}
            {['DASHBOARD', 'MONTHLY', 'TRACKER', 'LEAVES', 'OVERTIME'].includes(activeTab) && hasFullAccess && (
              <select
                className="ui-select"
                value={resolvedDeptFilterValue}
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
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
              {theme === 'dark' ? <Sun style={{ width: 15, height: 15 }} /> : <Moon style={{ width: 15, height: 15 }} />}
            </button>
            <div className="time-display">{time}</div>
          </div>
        </div>

        {activeTab === 'DASHBOARD' && data && (
          <DashboardTab
            data={data}
            viewDeptFilter={resolvedDeptFilterValue}
            isAdmin={isAdmin}
            isLeader={isLeader}
            myDept={myDept}
            myEmpNo={myEmpNo}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            selectedCalendarDate={selectedCalendarDate}
            setSelectedCalendarDate={setSelectedCalendarDate}
            visibleDashboardLeaves={visibleDashboardLeaves}
            calendarEmployeeNameLookup={calendarEmployeeNameLookup}
          />
        )}

        {activeTab === 'MONTHLY' && (
          <MonthlyTab
            monthlyLoading={monthlyLoading}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            visibleMonthlyEmployees={visibleMonthlyEmployees}
            monthlyData={monthlyData}
          />
        )}

        {(activeTab === 'TRACKER' || activeTab === 'MY_PORTAL') && (
          <TrackerTab
            activeTab={activeTab}
            myEmpNo={myEmpNo}
            myDept={myDept}
            isAdmin={isAdmin}
            isLeader={isLeader}
            selectedEmployee={selectedEmployee}
            setSelectedEmployee={setSelectedEmployee}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthlyLoading={monthlyLoading}
            monthlyData={monthlyData}
            visibleTrackerEmployees={visibleTrackerEmployees}
            refreshData={refreshAllData}
          />
        )}

        {activeTab === 'EMPLOYEES' && (isAdmin || isLeader) && (
          <ScheduleTab
            isAdmin={isAdmin}
            isLeader={isLeader}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthlyData={monthlyData}
            visibleScheduleEmployees={visibleScheduleEmployees}
            refreshData={refreshAllData}
          />
        )}

        {activeTab === 'LEAVES' && (
          <LeaveTab
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            calendarMonth={calendarMonth}
            visibleLeaves={visibleLeaves}
            calendarEmployeeNameLookup={calendarEmployeeNameLookup}
            leaveCalendarDate={leaveCalendarDate}
            setLeaveCalendarDate={setLeaveCalendarDate}
          />
        )}

        {activeTab === 'OVERTIME' && (
          <OvertimeTab
            isAdmin={isAdmin}
            visibleMonthlyEmployees={visibleMonthlyEmployees}
            monthlyData={monthlyData}
            myPosition={myPosition}
            myDept={myDept}
            refreshData={refreshAllData}
          />
        )}

        {['MANUAL_APPROVAL', 'USER_REGISTER', 'CAPS_UPLOAD'].includes(activeTab) && isAdmin && (
          <AdminPanelTabs
            activeTab={activeTab}
            isAdmin={isAdmin}
            isLeader={isLeader}
            monthlyData={monthlyData}
            data={data}
            theme={theme}
            refreshData={refreshAllData}
          />
        )}

        {activeTab === 'EMPLOYEE_ADMIN' && isAdmin && (
          <EmployeeAdminTab
            isAdmin={isAdmin}
            data={data}
            monthlyData={monthlyData}
            theme={theme}
            refreshData={refreshAllData}
          />
        )}
      </main>
    </div>
  );
}
