import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { saveScheduleOverridesBatch } from '@/lib/supabaseDb';
import { isAdminRole, isLeaderPosition } from '@/lib/roleUtils';

const canManageOverrides = (session) => isAdminRole(session) || isLeaderPosition(session?.position);

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!canManageOverrides(session)) {
      return NextResponse.json({ error: '관리자 또는 팀장 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const empNo = String(body?.empNo || '').trim();
    const workDates = Array.isArray(body?.workDates) ? body.workDates.map((date) => String(date || '').trim()).filter(Boolean) : [];
    const scheduleStart = String(body?.scheduleStart || '').trim();
    const scheduleEnd = String(body?.scheduleEnd || '').trim();
    const note = String(body?.note || '').trim();

    if (!empNo || workDates.length === 0 || !scheduleStart) {
      return NextResponse.json({ error: '직원, 날짜, 출근 기준 시각은 필수입니다.' }, { status: 400 });
    }

    await saveScheduleOverridesBatch({
      empNo,
      workDates,
      scheduleStart,
      scheduleEnd: scheduleEnd || null,
      note,
      userId: session.userId,
    });

    return NextResponse.json({ success: true, message: '일일 스케줄이 일괄 등록되었습니다.' });
  } catch (err) {
    console.error('[Schedule Override Batch API]', err);
    return NextResponse.json({ error: err.message || '일괄 등록 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
