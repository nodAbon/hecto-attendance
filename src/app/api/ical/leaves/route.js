import { NextResponse } from 'next/server';
import { buildLeaveIcsForDepartments } from '@/lib/icalFeed';
import { MANAGEMENT_DEPTS } from '@/lib/ical';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const ics = await buildLeaveIcsForDepartments({
      departments: MANAGEMENT_DEPTS,
      from: url.searchParams.get('from') || undefined,
      to: url.searchParams.get('to') || undefined,
      calendarName: '경영지원실/경영지원팀 연차 현황',
      calendarDescription: '경영지원실 및 경영지원팀의 승인된 연차 정보',
    });

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="management-leaves.ics"',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[ICS Leaves]', error);
    return NextResponse.json({ error: error?.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
