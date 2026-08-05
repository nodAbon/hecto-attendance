import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { getAdminClient } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = String(searchParams.get('orderId') || searchParams.get('id') || searchParams.get('ticketNo') || '').trim();
    const token = String(searchParams.get('token') || '').trim();

    if (!orderId && !token) {
      return NextResponse.json({ error: '조회할 주문 번호 또는 토큰이 필요합니다.' }, { status: 400 });
    }

    const supabase = getAdminClient();

    let query = supabase.from('sa_taxi_explanations').select('*');
    if (orderId) {
      query = query.or(`order_id.eq.${orderId},ticket_no.eq.${orderId}`);
    } else {
      query = query.eq('token', token);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[Taxi Audit Explanation Detail Error]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || null,
    });
  } catch (error) {
    console.error('[Taxi Audit Explanation Detail Catch]', error);
    return NextResponse.json(
      { error: String(error?.message || error || '소명 정보를 불러오지 못했습니다.') },
      { status: 500 }
    );
  }
}
