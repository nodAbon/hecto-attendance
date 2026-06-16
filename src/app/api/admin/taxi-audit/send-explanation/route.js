import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { sendTaxiAuditExplanationMail } from '@/lib/taxiAuditMail';

export async function POST(request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!session.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const row = body?.row || body || {};

    if (!String(row.empNo || '').trim()) {
      return NextResponse.json({ error: '직원 식별 정보가 없습니다.' }, { status: 400 });
    }

    const result = await sendTaxiAuditExplanationMail(row);

    return NextResponse.json({
      success: true,
      message: `${String(row.employeeName || row.empNo || '직원')}에게 소명 요청 메일을 발송했습니다.`,
      recipientEmail: result.recipientEmail,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('[Taxi audit send explanation]', error);
    return NextResponse.json({
      error: String(error?.message || error || '소명 요청 메일 발송에 실패했습니다.'),
    }, { status: 500 });
  }
}
