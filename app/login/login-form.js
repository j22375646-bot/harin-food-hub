'use client';

import { useRef, useState } from 'react';
import { HarinIcon } from '../_design-system/harin-icon.js';

export function LoginForm({ nextPath = '/' }) {
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);

  function handleSubmit(event) {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    setPending(true);
  }

  return <form action="/api/dashboard/login" method="post" onSubmit={handleSubmit} aria-busy={pending}>
    <input type="hidden" name="next" value={nextPath} />
    <label htmlFor="password">사장님 비밀번호</label>
    <div className="loginPasswordField">
      <HarinIcon name="shield"/>
      <input
        id="password"
        name="password"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        autoComplete="current-password"
        minLength="6"
        maxLength="6"
        required
        autoFocus
        disabled={pending}
        placeholder="6자리 숫자"
      />
    </div>
    <button type="submit" disabled={pending}>
      <span>{pending ? '안전하게 확인 중…' : '허브 시작하기'}</span>
      <HarinIcon name={pending ? 'sync' : 'chevron'}/>
    </button>
    <p className="loginSubmitStatus" aria-live="polite">
      {pending ? '한 번만 전송했어요. 로그인 확인이 끝나면 바로 열립니다.' : ''}
    </p>
  </form>;
}
