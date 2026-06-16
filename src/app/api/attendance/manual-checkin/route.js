import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { saveManualCheckin, decideManualCheckin } from '@/lib/supabaseDb';
import { isLeaderPosition } from '@/lib/roleUtils';

// 직원 수동 출퇴근 등록
export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { checkType, checkTime, workDate, note } = await request.json();
    if (!checkType || !workDate) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    // 직원은 본인의 사원번호로만 등록 가능
    const empNo = session.empNo;
    if (!empNo) {
      return NextResponse.json({ error: '사원번호를 찾을 수 없습니다.' }, { status: 400 });
    }

    await saveManualCheckin({
      empNo,
      checkType,
      checkTime: checkTime || new Date().toISOString(),
      workDate,
      note: note || ''
    });

    return NextResponse.json({ success: true, message: '출퇴근 기록이 성공적으로 등록되었습니다. 관리자 승인 대기 중입니다.' });
  } catch (err) {
    console.error('[Manual Checkin API]', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 관리자 승인/반려 결정
export async function PUT(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!session.isAdmin && !isLeaderPosition(session.position)) {
      return NextResponse.json({ error: '관리자 또는 팀장 권한이 필요합니다.' }, { status: 403 });
    }

    const { id, decision } = await request.json();
    if (!id || !decision) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    await decideManualCheckin({
      id,
      decision, // 'approved' | 'rejected'
      userId: session.userId
    });

    return NextResponse.json({ success: true, message: '승인 처리가 완료되었습니다.' });
  } catch (err) {
    console.error('[Manual Checkin Decide API]', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
