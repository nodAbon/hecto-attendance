import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';
import { isAdminRole } from '@/lib/roleUtils';

const normalizeIdentifier = (value) => String(value ?? '').trim();

export async function POST(request) {
  try {
    const { identifier, password } = await request.json();

    if (!identifier || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const supabase = getAdminClient();
    const cleanId = normalizeIdentifier(identifier);

    // 1. sa_employees 사원 정보 조회 (login_id, emp_no, email 모두 대응)
    let matchedEmp = null;
    try {
      const { data: empList } = await supabase
        .from('sa_employees')
        .select('*')
        .or(`login_id.eq.${cleanId},emp_no.eq.${cleanId},email.eq.${cleanId},email.ilike.${cleanId}@%`)
        .limit(1);

      if (empList && empList.length > 0) {
        matchedEmp = empList[0];
      }
    } catch (e) {
      console.warn('sa_employees lookup warning:', e.message);
    }

    // 2. 로그인 후보 이메일 목록 구성
    const candidateEmails = [];
    if (cleanId.includes('@')) {
      candidateEmails.push(cleanId);
    } else {
      if (matchedEmp?.email) candidateEmails.push(matchedEmp.email);
      const loginKey = matchedEmp?.login_id || cleanId;
      const empNoKey = matchedEmp?.emp_no || cleanId;

      candidateEmails.push(
        `${loginKey}@hecto.internal`,
        `${loginKey}@hecto.co.kr`,
        `${loginKey}@dreambay.co.kr`,
        `${empNoKey}@hecto.internal`,
        `${empNoKey}@hecto.co.kr`,
        `${cleanId}@hecto.internal`,
        `${cleanId}@hecto.co.kr`,
        `${cleanId}@dreambay.co.kr`
      );
    }

    const uniqueCandidateEmails = Array.from(new Set(candidateEmails.filter(Boolean)));

    let authData = null;
    let authError = null;

    for (const email of uniqueCandidateEmails) {
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

    const realEmpNo = matchedEmp?.emp_no || authData.user.user_metadata?.emp_no || cleanId;
    const realLoginId = matchedEmp?.login_id || authData.user.user_metadata?.login_id || cleanId;
    const realName = matchedEmp?.name || authData.user.user_metadata?.name || cleanId;
    const realDept = matchedEmp?.dept || '';

    // 3. 프로필 조회 및 자동 부트스트랩
    let { data: profile } = await supabase
      .from('sa_profiles')
      .select('id, emp_no, is_admin, must_change_password, rank, position')
      .eq('id', userId)
      .maybeSingle();

    if (!profile && realEmpNo) {
      const { data: fallbackProfile } = await supabase
        .from('sa_profiles')
        .select('id, emp_no, is_admin, must_change_password, rank, position')
        .eq('emp_no', realEmpNo)
        .maybeSingle();
      profile = fallbackProfile || null;
    }

    const resolvedIsAdmin = isAdminRole(profile || {}) || cleanId === 'admin' || realLoginId === 'admin';
    const position = profile?.position || '';
    const rank = profile?.rank || '';
    const isLeader = Boolean(position === '팀장' || position === '실장' || resolvedIsAdmin);

    // 부트스트랩 프로필 생성
    if (!profile && userId && realEmpNo) {
      try {
        await supabase.from('sa_profiles').upsert({
          id: userId,
          emp_no: realEmpNo,
          dept: realDept,
          rank: rank,
          position: position,
          is_admin: resolvedIsAdmin,
          must_change_password: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (e) {
        console.warn('Profile bootstrap warning:', e.message);
      }
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: authData.user.email,
        empNo: realEmpNo,
        name: realName,
        loginId: realLoginId,
        isAdmin: resolvedIsAdmin,
        isLeader,
        mustChangePassword: profile?.must_change_password ?? false,
        position: position,
        rank: rank,
        team: realDept,
        dept: realDept,
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
    response.cookies.set('user-emp-no', realEmpNo, { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-login-id', realLoginId, { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-is-admin', String(resolvedIsAdmin), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-position', encodeURIComponent(position), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-rank', encodeURIComponent(rank), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-name', encodeURIComponent(realName), { ...cookieOpts, httpOnly: false });
    response.cookies.set('user-team', encodeURIComponent(realDept), { ...cookieOpts, httpOnly: false });

    return response;
  } catch (err) {
    console.error('[Login API]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
