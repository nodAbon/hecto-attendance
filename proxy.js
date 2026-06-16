import { NextResponse } from 'next/server';
import { getAdminClient } from './src/lib/supabaseClient';

const PUBLIC_FILE = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json)$/i;

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
]);

const getSessionToken = (request) => {
  const token = request.cookies.get('sb-access-token')?.value;
  return token || '';
};

const clearSessionCookies = (response) => {
  [
    'sb-access-token',
    'sb-refresh-token',
    'must-change-password',
    'user-emp-no',
    'user-is-admin',
    'user-position',
    'user-rank',
    'user-name',
    'user-login-id',
    'user-team',
  ].forEach((name) => {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  });
  return response;
};

const redirectToLogin = (request) => {
  const { pathname, search } = request.nextUrl;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return clearSessionCookies(NextResponse.redirect(loginUrl));
};

const unauthorizedApi = () => clearSessionCookies(
  NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
);

async function isValidSessionToken(token) {
  if (!token) return false;
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    return !error && Boolean(data?.user);
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public/') ||
    PUBLIC_FILE.test(pathname) ||
    PUBLIC_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  const token = getSessionToken(request);
  const isValidSession = await isValidSessionToken(token);

  if (isValidSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return unauthorizedApi();
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
