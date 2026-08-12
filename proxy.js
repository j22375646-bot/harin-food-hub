import { NextResponse } from 'next/server';
import authModule from './lib/dashboard-auth.js';

const OWNER_MUTATIONS = [
  '/api/costs',
  '/api/targets',
  '/api/products/mappings',
  '/api/financial-changes',
  '/api/experiments',
  '/api/notifications/settings',
  '/api/notifications/send',
  '/api/naver/keyword-actions',
  '/api/coupang/orders/action',
  '/api/coupang/cases/action',
  '/api/coupang/cs/action',
  '/api/actions/'
];

const OPERATOR_PATHS = [
  '/api/coupang/orders/detail',
  '/api/coupang/operations/'
];

function isPublic(pathname) {
  return pathname === '/login'
    || pathname === '/api/dashboard/login'
    || pathname.startsWith('/api/cron/')
    || pathname.startsWith('/oauth/cafe24/');
}

function apiDenied(status, error, code) {
  return NextResponse.json({ ok:false, error, code }, {
    status,
    headers:{ 'Cache-Control':'private, no-store, max-age=0, must-revalidate' }
  });
}

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(authModule.COOKIE_NAME)?.value;

  if (isPublic(pathname)) {
    if (pathname === '/login' && token) {
      const session = await authModule.validateSession(token).catch(()=>null);
      if (session) return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const session = token ? await authModule.validateSession(token, { touch:true }).catch(()=>null) : null;
  if (!session) {
    if (pathname.startsWith('/api/')) return apiDenied(401, '로그인이 필요합니다.', 'UNAUTHENTICATED');
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`.slice(0, 500));
    return NextResponse.redirect(login);
  }

  const method = request.method.toUpperCase();
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const adminPath = pathname.startsWith('/admin') || pathname.startsWith('/api/dashboard/users');
  const operatorPath = OPERATOR_PATHS.some(prefix => pathname.startsWith(prefix));
  const ownerMutation = mutation && OWNER_MUTATIONS.some(prefix => pathname.startsWith(prefix));

  if ((adminPath || ownerMutation) && session.role !== 'OWNER') {
    if (pathname.startsWith('/api/')) return apiDenied(403, 'OWNER 권한이 필요한 작업입니다.', 'ROLE_FORBIDDEN');
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (operatorPath && session.role === 'VIEWER') {
    return apiDenied(403, '고객 주문 상세 정보는 OPERATOR 이상만 조회할 수 있습니다.', 'ROLE_FORBIDDEN');
  }
  if (mutation && session.role === 'VIEWER') {
    return apiDenied(403, 'VIEWER 계정은 조회만 가능합니다.', 'ROLE_FORBIDDEN');
  }

  if (mutation) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== request.nextUrl.origin) {
      return apiDenied(403, '요청 출처를 확인할 수 없습니다.', 'CSRF_ORIGIN_MISMATCH');
    }
  }

  const headers = new Headers(request.headers);
  headers.set('x-harin-user-id', session.userId);
  headers.set('x-harin-username', session.username);
  headers.set('x-harin-role', session.role);
  return NextResponse.next({ request:{ headers } });
}

export const config = {
  matcher:['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)']
};
