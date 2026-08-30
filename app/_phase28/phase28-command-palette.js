'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Phase28IntentLink} from './phase28-intent-link.js';
import styles from './phase28-shell.module.css';

function focusableElements(container) {
  return [...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
}

export function Phase28CommandPalette({open,items,onClose}) {
  const dialogRef=useRef(null);
  const inputRef=useRef(null);
  const [query,setQuery]=useState('');
  const matches=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('ko-KR');
    if(!needle)return items;
    return items.filter(item=>`${item.label} ${item.description}`.toLocaleLowerCase('ko-KR').includes(needle));
  },[items,query]);

  useEffect(()=>{
    if(!open)return undefined;
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    setQuery('');
    requestAnimationFrame(()=>inputRef.current?.focus());
    function onKeyDown(event) {
      if(event.key==='Escape'){
        event.preventDefault();
        onClose();
        return;
      }
      if(event.key!=='Tab'||!dialogRef.current)return;
      const focusable=focusableElements(dialogRef.current);
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
    <section className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="phase28-command-title">
      <div className={styles.commandDialog} ref={dialogRef}>
        <header className={styles.dialogHeader}>
          <div><span>QUICK ROUTE</span><h2 id="phase28-command-title">메뉴·상품·업무 찾기</h2></div>
          <button type="button" onClick={onClose} aria-label="빠른 찾기 닫기">×</button>
        </header>
        <label className={styles.commandSearch}>
          <span aria-hidden="true">⌕</span>
          <input ref={inputRef} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="정산, 문의, 상품처럼 입력" autoComplete="off"/>
        </label>
        <div className={styles.commandResults}>
          {matches.map((item,index)=><Phase28IntentLink href={item.href} prefetchPolicy={item.prefetch} key={item.id} onClick={onClose}><span>{item.label}</span><strong>{item.description}</strong><kbd>{index+1}</kbd></Phase28IntentLink>)}
          {!matches.length?<p className={styles.emptyResult}>찾는 업무가 없어요. 메뉴 이름을 다시 입력해 주세요.</p>:null}
        </div>
        <footer className={styles.commandFooter}><span><kbd>Tab</kbd> 이동</span><span><kbd>Enter</kbd> 열기</span><span><kbd>Esc</kbd> 닫기</span><b>메뉴 검색 · 외부 API 조회 없음</b></footer>
      </div>
    </section>
  );
}
