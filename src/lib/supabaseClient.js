import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.');
}

/**
 * 브라우저 / 클라이언트 컴포넌트용 Supabase 클라이언트
 * - anon key 사용 (RLS 적용됨)
 */
export const supabase = createClient(supabaseUrl, supabaseAnon);

/**
 * 서버 컴포넌트 / API Route용 Supabase 어드민 클라이언트
 * - service role key 사용 (RLS 우회, 관리자 작업 전용)
 * - 클라이언트 사이드에서 절대 사용 금지
 */
export function getAdminClient() {
  if (!supabaseService) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }
  return createClient(supabaseUrl, supabaseService, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * 로그인한 사용자의 세션 기반 Supabase 클라이언트 (서버 API Route용)
 * - 사용자 권한으로 RLS 적용
 */
export function getServerClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnon, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
