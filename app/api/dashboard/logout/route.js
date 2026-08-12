import authModule from '../../../../lib/dashboard-auth.js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  await authModule.revokeSession(authModule.cookieValue(request)).catch(error => {
    console.error('[dashboard logout revoke]', { message:error.message });
  });
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set(authModule.COOKIE_NAME, '', authModule.sessionCookieOptions(0));
  return response;
}
