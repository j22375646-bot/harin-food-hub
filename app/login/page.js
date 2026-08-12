import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(authModule.COOKIE_NAME)?.value;
  if (token && await authModule.validateSession(token).catch(()=>null)) redirect('/');
  const params = await searchParams;
  const error = params?.error === 'blocked'
    ? '로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.'
    : params?.error
      ? '비밀번호를 다시 확인해주세요.'
      : null;
  const nextPath = String(params?.next || '/');
  return <main className="loginPage"><section className="loginCard">
    <div className="loginLogo">H</div>
    <span className="eyebrow">PRIVATE DASHBOARD</span>
    <h1>하린식품 진단 허브</h1>
    <p>운영 데이터를 보호하기 위해<br/>비밀번호만 입력해주세요.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action="/api/dashboard/login" method="post">
      <input type="hidden" name="next" value={nextPath.startsWith('/')&&!nextPath.startsWith('//')?nextPath:'/'} />
      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" autoComplete="current-password" minLength="8" maxLength="200" required autoFocus placeholder="비밀번호 입력" />
      <button type="submit">허브 들어가기</button>
    </form>
    <small>로그인 상태는 이 기기에 12시간 동안 안전하게 유지됩니다.</small>
  </section></main>;
}
