import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { saveEmployeeOvertimeRound, fetchAttendanceLogs } from '@/lib/supabaseDb';
import { isAdminRole, isLeaderPosition, isExecutivePosition } from '@/lib/roleUtils';

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const isLeader = isLeaderPosition(session.position);
    const isExecutive = isExecutivePosition(session.position);
    const isAdmin = isAdminRole(session);

    // Only team leaders, executives, and admins can edit
    if (!isAdmin && !isLeader && !isExecutive) {
      return NextResponse.json({ error: '초과근무 관리 권한이 없습니다.' }, { status: 403 });
    }

    const { empNo, roundName, startDate, endDate, employeeDept } = await request.json();
    if (!empNo || !roundName || !startDate || !endDate) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    // Security check: team leaders can only modify employees in their own department
    const isOnlyTeamLeader = isLeader && !isExecutive && !isAdmin;
    if (isOnlyTeamLeader) {
      const leaderDept = String(session.team || session.dept || '').trim();
      const targetDept = String(employeeDept || '').trim();
      if (!leaderDept || leaderDept !== targetDept) {
        return NextResponse.json({ error: '본인 부서의 직원 정보만 수정할 수 있습니다.' }, { status: 403 });
      }
    }

    await saveEmployeeOvertimeRound({
      empNo,
      roundName,
      startDate,
      endDate
    });

    return NextResponse.json({ success: true, message: '직원 초과근무 설정이 저장되었습니다.' });
  } catch (err) {
    console.error('[Overtime Rounds POST API]', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
