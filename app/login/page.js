import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '../_shell/harin-entry-v8.css';
import authModule from '../../lib/dashboard-auth.js';
import { HarinIcon } from '../_design-system/harin-icon.js';

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
  return <main className="loginPage">
    <section className="loginCard">
      <div className="loginWelcome">
        <span className="loginBrandPill"><HarinIcon name="sparkles"/>하린식품 운영 허브</span>
        <div className="loginBrand"><div className="loginLogo">H</div><span><b>하린식품</b><small>오늘의 운영을 한곳에서</small></span></div>
        <h1>오늘도 차근차근,<br/>중요한 일부터 시작해볼까요?</h1>
        <p>주문·재고·매출 상태를 보기 좋게 정리해두었어요.<br/>사장님 비밀번호만 입력하면 바로 이어서 볼 수 있습니다.</p>
        <div className="loginHighlights" aria-label="허브 주요 기능">
          <span><i><HarinIcon name="orders"/></i><b>주문·배송</b><small>오늘 출고할 일</small></span>
          <span><i><HarinIcon name="inventory"/></i><b>재고·상품</b><small>위험 상품 확인</small></span>
          <span><i><HarinIcon name="analysis"/></i><b>성과 분석</b><small>변화와 다음 행동</small></span>
        </div>
      </div>
      <div className="loginAccess">
        <header><span><HarinIcon name="shield"/>OWNER ONLY</span><h2>허브에 들어갈까요?</h2><p>계정 이름 없이 6자리 비밀번호만 입력해주세요.</p></header>
        {error && <div className="loginError" role="alert"><HarinIcon name="alerts"/><span>{error}</span></div>}
        <form action="/api/dashboard/login" method="post">
          <input type="hidden" name="next" value={nextPath.startsWith('/')&&!nextPath.startsWith('//')?nextPath:'/'} />
          <label htmlFor="password">사장님 비밀번호</label>
          <div className="loginPasswordField"><HarinIcon name="shield"/><input id="password" name="password" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="current-password" minLength="6" maxLength="6" required autoFocus placeholder="6자리 숫자" /></div>
          <button type="submit"><span>허브 시작하기</span><HarinIcon name="chevron"/></button>
        </form>
        <footer><HarinIcon name="shield"/><span><b>이 기기에서 12시간 유지</b><small>비밀번호와 운영 자료는 화면에 공개되지 않습니다.</small></span></footer>
      </div>
    </section>
  </main>;
}
