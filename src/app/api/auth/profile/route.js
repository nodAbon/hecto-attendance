import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseClient';
import { isAdminRole } from '@/lib/roleUtils';

const getCookieValueFromHeader = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const PROFILE_SELECT = 'id, emp_no, rank, position, must_change_password, is_admin';

async function resolveProfile(supabase, userId, fallbackEmpNo) {
  const { data: profile } = await supabase
    .from('sa_profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (profile) {
    return profile;
  }

  // If no profile found by ID but fallbackEmpNo is provided, check if profile exists with that empNo
  if (fallbackEmpNo) {
    const { data: fallbackProfile } = await supabase
      .from('sa_profiles')
      .select(PROFILE_SELECT)
      .eq('emp_no', fallbackEmpNo)
      .maybeSingle();
    if (fallbackProfile) {
      // Link this profile to this user id
      const updatedProfile = {
        ...fallbackProfile,
        id: userId,
        updated_at: new Date().toISOString()
      };
      await supabase.from('sa_profiles').upsert(updatedProfile, { onConflict: 'id' });
      return updatedProfile;
    }

    const { data: employee } = await supabase
      .from('sa_employees')
      .select('emp_no, dept, name')
      .eq('emp_no', fallbackEmpNo)
      .maybeSingle();

    if (employee) {
      const bootstrapProfile = {
        id: userId,
        emp_no: employee.emp_no,
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
        return bootstrapProfile;
      }
    }
  }

  // Final fallback: try to find any sa_employees that might match the user ID (email metadata)
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (email) {
    const loginId = email.split('@')[0];
    // Find sa_employees using name or loginId
    const { data: employee } = await supabase
      .from('sa_employees')
      .select('emp_no, dept, name')
      .eq('emp_no', loginId)
      .maybeSingle();

    if (employee) {
      const bootstrapProfile = {
        id: userId,
        emp_no: employee.emp_no,
        rank: '',
        position: '',
        must_change_password: false,
        is_admin: false,
        updated_at: new Date().toISOString(),
      };
      await supabase.from('sa_profiles').upsert(bootstrapProfile, { onConflict: 'id' });
      return bootstrapProfile;
    }
  }

  return null;
}

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
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = getAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!fallbackEmpNo && userData.user.email) {
      // split to get potential loginId / empNo (e.g. 20240052)
      fallbackEmpNo = userData.user.email.split('@')[0];
    }

    const profile = await resolveProfile(supabase, userData.user.id, fallbackEmpNo);
    if (!profile) {
      return NextResponse.json({ success: false, error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: employee } = await supabase
      .from('sa_employees')
      .select('name, dept')
      .eq('emp_no', profile.emp_no)
      .maybeSingle();

    const { data: deptRows } = await supabase
      .from('sa_employees')
      .select('dept')
      .order('dept', { ascending: true });

    const deptOptions = Array.from(new Set((deptRows || []).map((row) => String(row.dept || '').trim()).filter(Boolean)));

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id || userData.user.id,
        empNo: profile.emp_no,
        name: employee?.name || '',
        dept: employee?.dept || '',
        rank: profile.rank || '',
        position: profile.position || '',
        loginId: userData.user.email?.split('@')[0] || '',
        isAdmin: isAdminRole(profile || {}),
        mustChangePassword: !!profile.must_change_password,
      },
      deptOptions,
    });
  } catch (err) {
    console.error('[Auth Profile GET]', err);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request) {
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
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = getAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!fallbackEmpNo && userData.user.email) {
      fallbackEmpNo = userData.user.email.split('@')[0];
    }

    const body = await request.json();
    const nextRank = String(body?.rank ?? '').trim();
    const nextDept = String(body?.dept ?? '').trim();

    if (!nextRank && !nextDept) {
      return NextResponse.json({ success: false, error: '변경할 내용을 입력해 주세요.' }, { status: 400 });
    }

    const profile = await resolveProfile(supabase, userData.user.id, fallbackEmpNo);
    if (!profile) {
      return NextResponse.json({ success: false, error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    }

    const updates = {
      id: profile.id || userData.user.id,
      emp_no: profile.emp_no,
      rank: profile.rank || '',
      position: profile.position || '',
      must_change_password: !!profile.must_change_password,
      is_admin: isAdminRole(profile || {}),
      updated_at: new Date().toISOString(),
    };

    if (nextRank) updates.rank = nextRank;

    const { error: profileErr } = await supabase
      .from('sa_profiles')
      .upsert(updates, { onConflict: 'id' });
    if (profileErr) {
      return NextResponse.json({ success: false, error: `프로필 수정 실패: ${profileErr.message}` }, { status: 500 });
    }

    if (nextDept) {
      const { error: empErr } = await supabase
        .from('sa_employees')
        .update({ dept: nextDept })
        .eq('emp_no', profile.emp_no);
      if (empErr) {
        return NextResponse.json({ success: false, error: `소속 수정 실패: ${empErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: '내 정보가 수정되었습니다.' });
  } catch (err) {
    console.error('[Auth Profile PATCH]', err);
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
