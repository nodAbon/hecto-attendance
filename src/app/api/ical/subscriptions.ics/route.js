import { NextResponse } from 'next/server';
import { buildLeaveIcsForDepartments } from '@/lib/icalFeed';
import { getIcalSubscriptionRecordByToken } from '@/lib/icalSubscriptions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    const record = await getIcalSubscriptionRecordByToken(token);
    if (!record) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (record.is_active === false || record.revoked_at) {
      return NextResponse.json({ error: '비활성화된 구독 링크입니다.' }, { status: 410 });
    }

    const ics = await buildLeaveIcsForDepartments({
      departments: Array.isArray(record.depts) && record.depts.length > 0 ? record.depts : [],
      calendarName: record.label || '비공개 iCal 구독',
      calendarDescription: `${record.label || '비공개 iCal 구독'} - 비공개 부서 연차 구독`,
    });

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="private-leaves.ics"',
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[ICS Subscriptions Query GET]', error);
    return NextResponse.json({ error: error?.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
