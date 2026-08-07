import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { isLeaderPosition } from '@/lib/roleUtils';
import { fetchKakaoTaxiReportData } from '@/lib/kakaoTaxiAuditApi';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

function parseKstDateKey(value) {
  if (!DATE_RE.test(String(value || '').trim())) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDaysInclusive(startDate, endDate) {
  const start = parseKstDateKey(startDate);
  const end = parseKstDateKey(endDate);
  if (!start || !end) return null;
  const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return diff;
}

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const isLeader = !!(session.isLeader || isLeaderPosition(session.position) || session.isAdmin);
    if (!isLeader) {
      return NextResponse.json({ error: '팀장 또는 관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const startDate = String(body?.startDate || '').trim();
    const endDate = String(body?.endDate || '').trim();
    const filterDept = String(body?.dept || '').trim();

    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return NextResponse.json({ error: '조회 시작일과 종료일을 YYYY-MM-DD 형식으로 입력해 주세요.' }, { status: 400 });
    }

    const diffDays = diffDaysInclusive(startDate, endDate);
    if (!diffDays || diffDays <= 0) {
      return NextResponse.json({ error: '조회 기간이 올바르지 않습니다.' }, { status: 400 });
    }
    if (diffDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일까지만 가능합니다.` }, { status: 400 });
    }

    const reportData = await fetchKakaoTaxiReportData({
      startDate,
      endDate,
      filterDept,
    });

    return NextResponse.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error('[Taxi Report API Error]', error);
    return NextResponse.json(
      { error: String(error?.message || error || '카카오T 이용 분석 리포트를 불러오지 못했습니다.') },
      { status: 500 }
    );
  }
}
