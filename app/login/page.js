import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }) {
  const cookieStore = await cookies();
  if (authModule.verifySession(cookieStore.get(authModule.COOKIE_NAME)?.value)) redirect('/');
  const params = await searchParams;
  return <main className="loginPage"><section className="loginCard"><div className="loginLogo">H</div><span className="eyebrow">PRIVATE DASHBOARD</span><h1>하린식품 진단 허브</h1><p>매출과 주문 데이터를 보호하기 위해<br/>비밀번호를 입력해주세요.</p>{params?.error && <div className="loginError">비밀번호를 다시 확인해주세요.</div>}<form action="/api/dashboard/login" method="post"><label htmlFor="password">비밀번호</label><input id="password" name="password" type="password" inputMode="numeric" autoComplete="current-password" required autoFocus placeholder="비밀번호 6자리"/><button type="submit">허브 들어가기</button></form><small>로그인 정보는 이 기기에 안전하게 보관됩니다.</small></section></main>;
}
