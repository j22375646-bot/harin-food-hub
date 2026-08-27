import authModule from '../../../../lib/dashboard-auth.js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function sourceIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.redirect(new URL('/login?error=invalid', request.url), 303);
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
    response.cookies.set(authModule.COOKIE_NAME, authenticated.token, authModule.sessionCookieOptions());
    return response;
  } catch (error) {
    const login = new URL('/login', request.url);
    const errorType = error.code === 'LOGIN_RATE_LIMITED'
      ? 'blocked'
      : error.code === 'LOGIN_AUTH_TIMEOUT'
        ? 'delayed'
        : 'invalid';
    login.searchParams.set('error', errorType);
    if (safeNext !== '/') login.searchParams.set('next', safeNext);
    return NextResponse.redirect(login, 303);
  }
}
