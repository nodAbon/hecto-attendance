import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';

export async function POST(request) {
  try {
    const accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { newPassword } = await request.json();
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // 현재 사용자 확인
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: '세션이 만료되었습니다.' }, { status: 401 });
    }

    // 비밀번호 변경
    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password: newPassword }
    );
    if (updateErr) {
      return NextResponse.json({ error: `비밀번호 변경 실패: ${updateErr.message}` }, { status: 500 });
    }

    // must_change_password 플래그 해제
    await supabase
      .from('sa_profiles')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', userData.user.id);

    const response = NextResponse.json({ success: true });
    response.cookies.set('must-change-password', 'false', {
      httpOnly: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error('[Change Password API]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
