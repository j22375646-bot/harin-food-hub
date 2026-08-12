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
      ? '계정 또는 비밀번호를 다시 확인해주세요.'
      : null;
  const nextPath = String(params?.next || '/');
  return <main className="loginPage"><section className="loginCard">
    <div className="loginLogo">H</div>
    <span className="eyebrow">PRIVATE OPERATIONS</span>
    <h1>하린식품 진단 허브</h1>
    <p>개인 계정으로 로그인하면 역할에 맞는<br/>조회·운영·승인 권한이 적용됩니다.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action="/api/dashboard/login" method="post">
      <input type="hidden" name="next" value={nextPath.startsWith('/')&&!nextPath.startsWith('//')?nextPath:'/'} />
      <label htmlFor="account">계정</label>
      <input id="account" name="account" type="text" autoCapitalize="none" autoComplete="username" required autoFocus placeholder="예: owner" />
      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" autoComplete="current-password" minLength="8" maxLength="200" required placeholder="비밀번호 입력" />
      <button type="submit">안전하게 로그인</button>
    </form>
    <small>세션은 12시간 후 만료되며 언제든 서버에서 폐기할 수 있습니다.</small>
  </section></main>;
}
