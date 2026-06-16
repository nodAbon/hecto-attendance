import { NextResponse } from 'next/server';
import {
  deleteIcalSubscriptionRecord,
  getIcalSubscriptionRecordByToken,
  setIcalSubscriptionRecordActive,
} from '@/lib/icalSubscriptions';

export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  try {
    const { token } = await context.params;
    const record = await getIcalSubscriptionRecordByToken(token);
    if (!record) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (record.is_active === false || record.revoked_at) {
      return NextResponse.json({ error: '비활성화된 구독 링크입니다.' }, { status: 410 });
    }

    return NextResponse.redirect(new URL(`./${encodeURIComponent(token)}.ics`, _request.url).toString(), 307);
  } catch (error) {
    console.error('[ICS Subscriptions GET]', error);
    return NextResponse.json({ error: error?.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  try {
    const { token } = await context.params;
    const body = await request.json().catch(() => ({}));
    const active = body.active !== false;
    const record = await setIcalSubscriptionRecordActive(token, active);
    if (!record) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, isActive: active });
  } catch (error) {
    console.error('[ICS Subscriptions PATCH]', error);
    return NextResponse.json({ error: error?.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(_request, context) {
  try {
    const { token } = await context.params;
    const record = await deleteIcalSubscriptionRecord(token);
    if (!record) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ICS Subscriptions DELETE]', error);
    return NextResponse.json({ error: error?.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
