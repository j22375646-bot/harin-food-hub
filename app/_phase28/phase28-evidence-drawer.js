'use client';

import {useEffect,useRef} from 'react';
import styles from './phase28-shell.module.css';

function formatGeneratedAt(value) {
  const date=new Date(value||'');
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

export function Phase28EvidenceDrawer({open,generatedAt,source='MAIN_OPERATION_SUMMARY',status='확인 필요',onClose}) {
  const dialogRef=useRef(null);
  const closeRef=useRef(null);
  useEffect(()=>{
    if(!open)return undefined;
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>closeRef.current?.focus());
    function onKeyDown(event) {
      if(event.key==='Escape'){
        event.preventDefault();
        onClose();
        return;
      }
      if(event.key!=='Tab'||!dialogRef.current)return;
      const focusable=[...dialogRef.current.querySelectorAll('button:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if(!focusable.length)return;
      const first=focusable[0];
      const last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',onKeyDown);
    return ()=>{
      document.removeEventListener('keydown',onKeyDown);
      document.body.style.overflow=overflow;
      previous?.focus?.();
    };
  },[open,onClose]);

  if(!open)return null;
  return (
    <section className={styles.evidenceBackdrop} role="dialog" aria-modal="true" aria-labelledby="phase28-evidence-title">
      <aside className={styles.evidenceDrawer} ref={dialogRef}>
        <header className={styles.dialogHeader}>
          <div><span>CURRENT EVIDENCE</span><h2 id="phase28-evidence-title">이 화면의 자료 근거</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="자료 근거 닫기">×</button>
        </header>
        <div className={styles.evidenceBody}>
          <section><span>자료 상태</span><strong>{status}</strong><small>오래되거나 실패한 값은 정상 숫자와 섞지 않아요.</small></section>
          <section><span>기준시각</span><strong>{formatGeneratedAt(generatedAt)}</strong><small>{generatedAt||'생성시각 없음'}</small></section>
          <section className={styles.evidenceSource}><span>화면 자료원</span><strong>{source}</strong><small>인증값과 연결 비밀정보는 화면에 전달하지 않아요.</small></section>
        </div>
      </aside>
    </section>
  );
}
