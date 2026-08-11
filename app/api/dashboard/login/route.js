import authModule from '../../../../lib/dashboard-auth.js';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request) {
  const form = await request.formData();
  if (!authModule.verifyPassword(form.get('password'))) return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(authModule.COOKIE_NAME, authModule.sessionToken(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 2592000 });
  return response;
}
