import authModule from '../../../../lib/dashboard-auth.js';
import { NextResponse } from 'next/server';
export async function POST(request) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set(authModule.COOKIE_NAME, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
