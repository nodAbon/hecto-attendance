import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { saveAttendanceCorrection } from '@/lib/supabaseDb';
import { isLeaderPosition } from '@/lib/roleUtils';

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!session.isAdmin && !isLeaderPosition(session.position)) {
      return NextResponse.json({ error: '관리자 또는 팀장 권한이 필요합니다.' }, { status: 403 });
    }

    const { empNo, workDate, correctedOutTime, reason } = await request.json();
    if (!empNo || !workDate || !correctedOutTime) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    // correctedOutTime은 'HH:MM' 형식으로 들어옴. YYYY-MM-DDT[HH:MM]:00 형식으로 변환하여 저장
    const isoString = `${workDate}T${correctedOutTime}:00`;

    await saveAttendanceCorrection({
      empNo,
      workDate,
      correctedOutTime: isoString,
      reason: reason || '',
      userId: session.userId
    });

    return NextResponse.json({ success: true, message: '퇴근시간이 성공적으로 수정되었습니다.' });
  } catch (err) {
    console.error('[Correction API]', err);
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
