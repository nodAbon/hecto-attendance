import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';
import { isAdminRole } from '@/lib/roleUtils';

const getCookieValueFromHeader = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export async function GET(request) {
  try {
    const cookieHeader = request?.headers?.get?.('cookie') || '';
    let accessToken = getCookieValueFromHeader(cookieHeader, 'sb-access-token');
    let fallbackEmpNo = getCookieValueFromHeader(cookieHeader, 'user-emp-no') || '';
    let fallbackLoginId = getCookieValueFromHeader(cookieHeader, 'user-login-id') || '';

    if (!accessToken) {
      try {
        const cookieStore = await cookies();
        accessToken = cookieStore.get('sb-access-token')?.value || null;
        if (!fallbackEmpNo) {
          fallbackEmpNo = cookieStore.get('user-emp-no')?.value || '';
        }
        if (!fallbackLoginId) {
          fallbackLoginId = cookieStore.get('user-login-id')?.value || '';
        }
      } catch (e) {
        // cookies() fallback
      }
    }

    if (!accessToken) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const supabase = getAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const userId = userData.user.id;
    const emailLoginId = userData.user.email?.split('@')[0] || '';
    const loginId = fallbackLoginId || emailLoginId;

    const profileSelect = 'id, emp_no, is_admin, position, rank, must_change_password';
    let { data: profile } = await supabase
      .from('sa_profiles')
      .select(profileSelect)
      .eq('id', userId)
      .maybeSingle();

    if (!profile && fallbackEmpNo) {
      const { data: fallbackProfile } = await supabase
        .from('sa_profiles')
        .select(profileSelect)
        .eq('emp_no', fallbackEmpNo)
        .maybeSingle();
      profile = fallbackProfile || null;
    }

    // 직원 정보 조회 (sa_employees) - login_id, emp_no, email 모두 대응
    let matchedEmployee = null;
    const lookupKeys = [profile?.emp_no, fallbackEmpNo, loginId, emailLoginId].filter(Boolean);
    if (lookupKeys.length > 0) {
      const { data: empList } = await supabase
        .from('sa_employees')
        .select('*')
        .or(`emp_no.in.(${lookupKeys.join(',')}),login_id.in.(${lookupKeys.join(',')}),email.eq.${userData.user.email}`)
        .limit(1);

      if (empList && empList.length > 0) {
        matchedEmployee = empList[0];
      }
    }

    const realEmpNo = matchedEmployee?.emp_no || profile?.emp_no || fallbackEmpNo || loginId;
    const realLoginId = matchedEmployee?.login_id || loginId;
    const realName = matchedEmployee?.name || userData.user.user_metadata?.name || loginId;
    const realDept = matchedEmployee?.dept || '';

    const resolvedIsAdmin = isAdminRole(profile || {}) || realLoginId === 'admin' || profile?.position === '관리자';
    const position = profile?.position || '';
    const rank = profile?.rank || '';

    // 프로필 부트스트랩
    if (!profile && realEmpNo) {
      const bootstrapProfile = {
        id: userId,
        emp_no: realEmpNo,
        dept: realDept,
        rank: rank,
        position: position,
        must_change_password: false,
        is_admin: resolvedIsAdmin,
        updated_at: new Date().toISOString(),
      };

      const { error: bootstrapError } = await supabase
        .from('sa_profiles')
        .upsert(bootstrapProfile, { onConflict: 'id' });

      if (!bootstrapError) {
        profile = bootstrapProfile;
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: profile?.id || userId,
        empNo: realEmpNo,
        name: realName,
        loginId: realLoginId,
        isAdmin: resolvedIsAdmin,
        position: position,
        team: realDept,
        dept: realDept,
        rank: rank,
        mustChangePassword: !!profile?.must_change_password,
      },
    });
  } catch (err) {
    console.error('[Auth Me]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
