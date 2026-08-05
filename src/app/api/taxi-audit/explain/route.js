import { NextResponse } from 'next/server';
import { getTaxiExplanationByToken, submitTaxiExplanation } from '@/lib/taxiExplanationDb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = String(searchParams.get('token') || '').trim();

    if (!token) {
      return NextResponse.json({ error: '소명 토큰이 필요합니다.' }, { status: 400 });
    }

    const data = await getTaxiExplanationByToken(token);

    if (!data) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 소명 링크입니다.' }, { status: 444 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Taxi Audit Explain GET]', error);
    return NextResponse.json(
      { error: String(error?.message || error || '소명 정보를 불러오지 못했습니다.') },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();
    const explanationText = String(body?.explanationText || '').trim();

    if (!token) {
      return NextResponse.json({ error: '소명 토큰이 누락되었습니다.' }, { status: 400 });
    }
    if (!explanationText) {
      return NextResponse.json({ error: '소명 사유를 입력해 주세요.' }, { status: 400 });
    }

    const updated = await submitTaxiExplanation({ token, explanationText });

    return NextResponse.json({
      success: true,
      message: '소명 사유가 성공적으로 제출되었습니다.',
      data: updated,
    });
  } catch (error) {
    console.error('[Taxi Audit Explain POST]', error);
    return NextResponse.json(
      { error: String(error?.message || error || '소명 사유 제출에 실패했습니다.') },
      { status: 500 }
    );
  }
}
