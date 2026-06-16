import { cookies } from 'next/headers';
import { getAdminClient } from './supabaseClient';
import { isAdminRole } from './roleUtils';

const getCookieValueFromHeader = (cookieHeader, name) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export async function verifySession(request) {
  let accessToken = null;
  let fallbackEmpNo = null;

  // Try parsing from headers first
  if (request?.headers) {
    const cookieHeader = request.headers.get?.('cookie') || '';
    accessToken = getCookieValueFromHeader(cookieHeader, 'sb-access-token');
    fallbackEmpNo = getCookieValueFromHeader(cookieHeader, 'user-emp-no') || '';
  }

  // If not found in request headers, try Next.js cookies API
  if (!accessToken) {
    try {
      const cookieStore = await cookies();
      accessToken = cookieStore.get('sb-access-token')?.value || null;
      if (!fallbackEmpNo) {
        fallbackEmpNo = cookieStore.get('user-emp-no')?.value || '';
      }
    } catch (e) {
      // In some environments, cookies() cannot be called (e.g. edge cases, client boundary calls)
    }
  }

  if (!accessToken) return null;

  const supabase = getAdminClient();
  const { data: userData } = await supabase.auth.getUser(accessToken);
  if (!userData?.user) return null;

  // 프로필 조회
  const { data: profile } = await supabase
    .from('sa_profiles')
    .select('id, emp_no, is_admin, position, rank, must_change_password')
    .eq('id', userData.user.id)
    .single();

  let resolvedProfile = profile;
  if (!resolvedProfile && fallbackEmpNo) {
    const { data: fallbackProfile } = await supabase
      .from('sa_profiles')
      .select('id, emp_no, is_admin, position, rank, must_change_password')
      .eq('emp_no', fallbackEmpNo)
      .single();
    resolvedProfile = fallbackProfile || null;
  }

  if (!resolvedProfile) return null;

  const { data: employee } = await supabase
    .from('sa_employees')
    .select('dept, name')
    .eq('emp_no', resolvedProfile.emp_no)
    .single();

  const resolvedIsAdmin = isAdminRole(resolvedProfile);

  return {
    userId: resolvedProfile.id || userData.user.id,
    empNo: resolvedProfile.emp_no,
    name: employee?.name || '',
    loginId: userData.user.email?.split('@')[0] || '',
    isAdmin: resolvedIsAdmin,
    position: resolvedProfile.position || '',
    team: employee?.dept || '',
    rank: resolvedProfile.rank || '',
    mustChangePassword: !!resolvedProfile.must_change_password
  };
}
