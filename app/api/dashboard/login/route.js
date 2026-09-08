import authModule from '../../../../lib/dashboard-auth.js';
import loginRequestModule from '../../../../lib/dashboard-login-request.js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Direct navigation is not a login attempt. Recover without forwarding query credentials.
export async function GET(request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function sourceIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request) {
  if (!loginRequestModule.isTrustedLoginRequest(request)) {
    return NextResponse.redirect(new URL('/login?error=source', request.url), 303);
  }
  const form = await request.formData();
  const nextPath = String(form.get('next') || '/');
  const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
  try {
    const authenticated = await authModule.authenticateAccount({
      account:'owner',
      password:form.get('password'),
      ip:sourceIp(request),
      userAgent:request.headers.get('user-agent')
    });
    const response = NextResponse.redirect(new URL(safeNext, request.url), 303);
    response.cookies.set(authModule.COOKIE_NAME, authenticated.token, authModule.sessionCookieOptions(undefined,{
      secure:loginRequestModule.secureSessionCookie(request)
    }));
    return response;
  } catch (error) {
    const login = new URL('/login', request.url);
    const errorType = loginRequestModule.loginErrorType(error);
    if (['restricted','unavailable','delayed'].includes(errorType)) {
      // Only the allowlisted category is logged; never credentials or provider payloads.
      console.error('[DASHBOARD_LOGIN_FAILURE]', { reason:errorType });
    }
    login.searchParams.set('error', errorType);
    if (safeNext !== '/') login.searchParams.set('next', safeNext);
    return NextResponse.redirect(login, 303);
  }
}
