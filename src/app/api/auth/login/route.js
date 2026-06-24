import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';
import { isAdminRole } from '@/lib/roleUtils';

const normalizeIdentifier = (value) => String(value ?? '').trim();

const getCandidateEmails = (identifier) => {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return [];
  if (normalized.includes('@')) return [normalized];

  const configuredDomains = [
    process.env.LOGIN_EMAIL_DOMAINS,
    process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean);

  const fallbackDomains = ['hecto.internal', 'hecto.co.kr'];
  const domains = Array.from(new Set([...configuredDomains, ...fallbackDomains]));

  return domains.map((domain) => `${normalized}@${domain}`);
};

export async function POST(request) {
  try {
    const { identifier, password } = await request.json();

    if (!identifier || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const candidateEmails = getCandidateEmails(identifier);

    let authData = null;
    let authError = null;

    for (const email of candidateEmails) {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (result?.data?.user && result?.data?.session) {
        authData = result.data;
        authError = null;
        break;
      }

      authError = result?.error || null;
    }

    if (authError || !authData?.user || !authData?.session) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token;
    const fallbackEmpNo = authData.user.email?.split('@')[0] || '';

    let { data: profile } = await supabase
      .from('sa_profiles')
      .select('emp_no, is_admin, must_change_password, rank, position')
      .eq('id', userId)
      .maybeSingle();

    if (!profile && fallbackEmpNo) {
      const { data: fallbackProfile } = await supabase
        .from('sa_profiles')
        .select('emp_no, is_admin, must_change_password, rank, position')
        .eq('emp_no', fallbackEmpNo)
        .maybeSingle();
      profile = fallbackProfile || null;
    }

    const { data: employee } = await supabase
      .from('sa_employees')
      .select('dept, name')
      .eq('emp_no', profile?.emp_no || fallbackEmpNo)
      .maybeSingle();

    const resolvedIsAdmin = isAdminRole(profile || {});

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: authData.user.email,
        empNo: profile?.emp_no,
        name: employee?.name ?? '',
        loginId: authData.user.email?.split('@')[0] || '',
        isAdmin: resolvedIsAdmin,
        mustChangePassword: profile?.must_change_password ?? false,
        position: profile?.position ?? '',
        rank: profile?.rank ?? '',
        team: employee?.dept ?? '',
      },
    });

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    };

    response.cookies.set('sb-access-token', accessToken, cookieOpts);
    response.cookies.set('sb-refresh-token', refreshToken, cookieOpts);
    response.cookies.set('must-change-password', String(profile?.must_change_password ?? false), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-emp-no', profile?.emp_no ?? '', { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-is-admin', String(resolvedIsAdmin), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-position', profile?.position ?? '', { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-rank', profile?.rank ?? '', { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-name', employee?.name ?? '', { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-login-id', authData.user.email?.split('@')[0] || '', { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-team', employee?.dept ?? '', { ...cookieOpts, httpOnly: false });

    return response;
  } catch (err) {
    console.error('[Login API]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
