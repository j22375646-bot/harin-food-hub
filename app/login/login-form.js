'use client';

import { useRef, useState } from 'react';
import { HarinIcon } from '../_design-system/harin-icon.js';
import styles from './login.module.css';

export function LoginForm({ nextPath = '/' }) {
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [account,setAccount]=useState('owner');
  const digits=account==='owner'?6:4;

  function handleSubmit(event) {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    setPending(true);
  }

  return <form className={styles.loginForm} action="/api/dashboard/login" method="post" onSubmit={handleSubmit} aria-busy={pending}>
    <input type="hidden" name="next" value={nextPath} />
    <label htmlFor="account">로그인할 사람</label>
    <select id="account" name="account" value={account} onChange={event=>setAccount(event.target.value)} disabled={pending}>
      <option value="president">사장 · 엄마</option><option value="owner">직원 · 나</option><option value="vice-president">사장 · 아빠</option>
    </select>
    {pending&&<input type="hidden" name="account" value={account}/>}
    <label htmlFor="password">비밀번호</label>
    <div className={styles.loginPasswordField}>
      <HarinIcon name="shield"/>
      <input
        id="password"
        name="password"
        type="password"
        inputMode="numeric"
        pattern={`[0-9]{${digits}}`}
        autoComplete="current-password"
        minLength={digits}
        maxLength={digits}
        required
        autoFocus
        // disabled 입력값은 브라우저의 native form 전송에서 제외된다.
        // 재입력만 막고 비밀번호 값은 반드시 서버에 제출되도록 readOnly를 사용한다.
        readOnly={pending}
        aria-disabled={pending}
        aria-describedby="password-help"
        placeholder={`${digits}자리 숫자`}
      />
    </div>
    <p id="password-help" className={styles.fieldHint}>선택한 사람의 비밀번호를 입력하세요. 세 사람 모두 같은 권한으로 사용합니다.</p>
    <button className={styles.submitButton} type="submit" disabled={pending}>
      <span>{pending ? '안전하게 확인 중…' : '허브 시작하기'}</span>
      <HarinIcon name={pending ? 'sync' : 'chevron'}/>
    </button>
    <p className={styles.loginSubmitStatus} aria-live="polite">
      {pending ? '한 번만 전송했어요. 로그인 확인이 끝나면 바로 열립니다.' : ''}
    </p>
  </form>;
}
