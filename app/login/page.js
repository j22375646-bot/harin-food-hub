import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import authModule from '../../lib/dashboard-auth.js';
import { HarinIcon } from '../_design-system/harin-icon.js';
import { LoginForm } from './login-form.js';
import styles from './login.module.css';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(authModule.COOKIE_NAME)?.value;
  if (token && await authModule.validateSession(token).catch(()=>null)) redirect('/');
  const params = await searchParams;
  const error = params?.error === 'blocked'
    ? '로그인 시도가 잠시 차단되었습니다. 15분 뒤 다시 시도해주세요.'
    : params?.error === 'delayed'
      ? '로그인 서버 연결이 늦어졌어요. 잠시 후 한 번만 다시 시도해주세요.'
    : params?.error === 'source'
      ? '로그인 화면을 새로 연 뒤 다시 시도해주세요.'
    : params?.error
      ? '비밀번호를 다시 확인해주세요.'
      : null;
  const nextPath = String(params?.next || '/');
  return <main className={styles.loginPage}>
    <section className={styles.loginFrame} aria-labelledby="login-title">
      <header className={styles.loginTopbar}>
        <div className={styles.loginBrand}>
          <span className={styles.loginLogo} aria-hidden="true">H</span>
          <span><b>하린식품</b><small>성장 운영 허브</small></span>
        </div>
        <span className={styles.ownerAccess}><HarinIcon name="shield"/>사장님 전용</span>
      </header>

      <section className={styles.loginHero}>
        <div className={styles.heroCopy}>
          <span className={styles.heroLabel}>HARIN DAILY DESK</span>
          <h1 id="login-title">오늘의 운영을<br/><span className={styles.headlineAccent}>한 자리에서 시작해요.</span></h1>
          <p>주문부터 재고, 매출과 다음 행동까지<br/>사장님이 먼저 볼 일을 차분하게 모았습니다.</p>
        </div>

        <section className={styles.operatingLine} aria-labelledby="operating-line-title">
          <header>
            <span>TODAY FLOW</span>
            <strong id="operating-line-title">오늘의 운영선</strong>
            <small>하루의 중요한 흐름을 놓치지 않도록 이어드려요.</small>
          </header>
          <ol>
            <li><time>06:00</time><strong>채널 자료 수집</strong></li>
            <li><time>09:00</time><strong>출고 주문 처리</strong></li>
            <li><time>15:00</time><strong>당일출고 마감</strong></li>
            <li><time>18:00</time><strong>예외·재시도 정리</strong></li>
          </ol>
        </section>
      </section>

      <section className={styles.loginAccess} aria-labelledby="access-title">
        <header className={styles.accessHeader}>
          <span><HarinIcon name="shield"/>OWNER ACCESS</span>
          <h2 id="access-title">운영을 시작할까요?</h2>
          <p>계정 이름 없이 사장님 비밀번호만 입력해주세요.</p>
        </header>
        {error && <div className={styles.loginError} role="alert"><HarinIcon name="alerts"/><span>{error}</span></div>}
        <LoginForm nextPath={nextPath.startsWith('/')&&!nextPath.startsWith('//')?nextPath:'/'} />
        <div className={styles.sessionNote}>
          <HarinIcon name="clock"/>
          <span><b>이 기기에서 12시간 유지</b><small>비밀번호와 운영 자료는 화면에 공개되지 않습니다.</small></span>
        </div>
      </section>

      <div className={styles.frameFooter}>
        <span><i aria-hidden="true"/>보안 세션</span>
        <p>로그인 후 요청한 화면으로 바로 이동합니다.</p>
      </div>
    </section>
  </main>;
}
