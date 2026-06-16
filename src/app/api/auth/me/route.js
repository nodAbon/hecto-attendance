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

    if (!accessToken) {
      try {
        const cookieStore = await cookies();
        accessToken = cookieStore.get('sb-access-token')?.value || null;
        if (!fallbackEmpNo) {
          fallbackEmpNo = cookieStore.get('user-emp-no')?.value || '';
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

    const profileSelect = 'id, emp_no, is_admin, position, rank, must_change_password';
    let { data: profile } = await supabase
      .from('sa_profiles')
      .select(profileSelect)
      .eq('id', userData.user.id)
      .maybeSingle();

    if (!profile && fallbackEmpNo) {
      const { data: fallbackProfile } = await supabase
        .from('sa_profiles')
        .select(profileSelect)
        .eq('emp_no', fallbackEmpNo)
        .maybeSingle();
      profile = fallbackProfile || null;
    }

    if (!profile && fallbackEmpNo) {
      const { data: employee } = await supabase
        .from('sa_employees')
        .select('emp_no, dept, name')
        .eq('emp_no', fallbackEmpNo)
        .maybeSingle();

      if (employee) {
        const bootstrapProfile = {
          id: userData.user.id,
          emp_no: employee.emp_no,
          dept: employee.dept || '',
          rank: '',
          position: '',
          must_change_password: false,
          is_admin: false,
          updated_at: new Date().toISOString(),
        };

        const { error: bootstrapError } = await supabase
          .from('sa_profiles')
          .upsert(bootstrapProfile, { onConflict: 'id' });

        if (!bootstrapError) {
          profile = bootstrapProfile;
        }
      }
    }

    if (!profile) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const { data: employee } = await supabase
      .from('sa_employees')
      .select('dept, name')
      .eq('emp_no', profile.emp_no)
      .maybeSingle();

    const resolvedIsAdmin = isAdminRole(profile || {});

    return NextResponse.json({
      success: true,
      user: {
        userId: profile.id || userData.user.id,
        empNo: profile.emp_no,
        name: employee?.name || '',
        loginId: userData.user.email?.split('@')[0] || '',
        isAdmin: resolvedIsAdmin,
        position: profile.position || '',
        team: employee?.dept || '',
        rank: profile.rank || '',
        mustChangePassword: !!profile.must_change_password,
      },
    });
  } catch (err) {
    console.error('[Auth Me]', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
