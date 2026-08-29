'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useMemo,useRef,useState,useTransition} from 'react';
import navigationModule from '../../lib/ui/phase28-navigation.js';
import {Phase28CommandPalette} from './phase28-command-palette.js';
import {Phase28EvidenceDrawer} from './phase28-evidence-drawer.js';
import tokens from './phase28-tokens.module.css';
import styles from './phase28-shell.module.css';

const {buildPhase28Navigation}=navigationModule;

const ICON_PATHS={
  home:<><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></>,
  orders:<><path d="M4 7h16v11H4z"/><path d="M8 7V4h8v3"/><path d="M4 12h16"/></>,
  cs:<><path d="M5 5h14v11H8l-3 3z"/><path d="M8 9h8M8 12h5"/></>,
  inventory:<><path d="M4 9 12 4l8 5v11H4z"/><path d="M8 20v-7h8v7"/></>,
  products:<><path d="M5 6h14v14H5z"/><path d="M8 3h8v6H8zM9 14h6"/></>,
  settlement:<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></>,
  keywords:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6M10 7v6"/></>,
  'product-analysis':<><path d="M4 19V5h16v14z"/><path d="m7 15 3-3 3 2 4-5"/><circle cx="17" cy="9" r="1"/></>,
  analysis:<><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  development:<><path d="M8 3h8l1 4 3 2-2 4v5H6v-5L4 9l3-2z"/><path d="M9 18v3M15 18v3"/></>,
  system:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></>,
  notifications:<><path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3z"/><path d="M10 20h4"/></>,
  diagnoses:<><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  changes:<><path d="M4 7h12M4 12h16M4 17h10"/><path d="m15 5 3 2-3 2M15 15l3 2-3 2"/></>,
  validation:<><path d="M4 12 9 17 20 6"/><path d="M4 4h16v16H4z"/></>,
  experiments:<><path d="M9 3h6M10 3v6l-5 9h14l-5-9V3"/><path d="M8 14h8"/></>,
  knowledge:<><path d="M4 5h7a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4z"/><path d="M20 5h-6v14a3 3 0 0 1 3-3h3z"/></>
};

function RouteIcon({id}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[id]||ICON_PATHS.home}</svg>;
}

function formatReferenceTime(value) {
  const date=new Date(value||'');
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return `${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(date)} · ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}).format(date)} 기준`;
}

function NavigationLink({item,routeId,compact=false,onNavigate}) {
  const active=item.id===routeId;
  return <Link href={item.href} className={`${styles.navItem}${active?` ${styles.active}`:''}`} aria-current={active?'page':undefined} onClick={onNavigate} title={compact?item.label:undefined}>
    <span className={styles.navIcon}><RouteIcon id={item.id}/></span>
    <span className={styles.navCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
    {item.badge==null?null:<span className={styles.navBadge}>{item.badge}</span>}
  </Link>;
}

export default function Phase28Shell({routeId,badges={},generatedAt=null,children}) {
  const router=useRouter();
  const [compact,setCompact]=useState(false);
  const [theme,setTheme]=useState('light');
  const [commandOpen,setCommandOpen]=useState(false);
  const [evidenceOpen,setEvidenceOpen]=useState(false);
  const [moreOpen,setMoreOpen]=useState(false);
  const [refreshing,startRefresh]=useTransition();
  const moreDialogRef=useRef(null);
  const moreTriggerRef=useRef(null);
  const navigation=useMemo(()=>buildPhase28Navigation({badges}),[badges]);
  const activeItem=navigation.items.find(item=>item.id===routeId)||navigation.items[0];
  const primaryItems=navigation.mobilePrimary.map(id=>navigation.items.find(item=>item.id===id)).filter(Boolean);
  const secondaryItems=navigation.items.filter(item=>!navigation.mobilePrimary.includes(item.id));
  const notificationCount=navigation.items.find(item=>item.id==='notifications')?.badge;
  const closeCommand=useCallback(()=>setCommandOpen(false),[]);
  const closeEvidence=useCallback(()=>setEvidenceOpen(false),[]);
  const closeMore=useCallback(()=>setMoreOpen(false),[]);

  useEffect(()=>{
    try{
      const saved=localStorage.getItem('harin-hub-theme');
      if(saved==='dark'||saved==='light')setTheme(saved);
    }catch{}
  },[]);

  useEffect(()=>{
    function onKeyDown(event) {
      if(event.ctrlKey&&event.key.toLowerCase()==='k'){
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
  },[]);

  useEffect(()=>{
    if(!moreOpen)return undefined;
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    requestAnimationFrame(()=>moreDialogRef.current?.querySelector('button,a')?.focus());
    function onKeyDown(event) {
      if(event.key==='Escape'){
        event.preventDefault();
        closeMore();
        return;
      }
      if(event.key!=='Tab'||!moreDialogRef.current)return;
      const focusable=[...moreDialogRef.current.querySelectorAll('a[href],button:not([disabled])')];
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
      (previous||moreTriggerRef.current)?.focus?.();
    };
  },[moreOpen,closeMore]);

  function toggleTheme() {
    const next=theme==='light'?'dark':'light';
    setTheme(next);
    try{localStorage.setItem('harin-hub-theme',next);}catch{}
  }

  function refreshStatus() {
    startRefresh(()=>router.refresh());
  }

  return (
    <div className={`${tokens.root} ${styles.shell}`} data-theme={theme} data-sidebar={compact?'compact':'expanded'}>
      <aside className={styles.sidebar} aria-label="데스크톱 메뉴 영역">
        <div className={styles.brand}><span className={styles.brandMark}>H</span><span className={styles.brandCopy}><strong>하린식품</strong><small>성장 운영 허브</small></span></div>
        <button className={styles.sideSearch} type="button" onClick={()=>setCommandOpen(true)} aria-label="메뉴와 업무 찾기"><span aria-hidden="true">⌕</span><span>메뉴·업무 찾기</span></button>
        <nav className={styles.navigation} aria-label="허브 메뉴">
          {navigation.groups.map(group=><section key={group.id}><h2>{group.label}</h2>{group.items.map(item=><NavigationLink item={item} routeId={routeId} compact={compact} key={item.id}/>)}</section>)}
        </nav>
        <button className={styles.collapseButton} type="button" onClick={()=>setCompact(value=>!value)} aria-label={compact?'사이드바 펼치기':'사이드바 접기'} aria-expanded={!compact}><span aria-hidden="true">{compact?'›':'‹'}</span><strong>{compact?'':'메뉴 접기'}</strong></button>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <strong className={styles.pageName}>{activeItem.label}</strong>
          <span className={styles.updated}>{formatReferenceTime(generatedAt)}</span>
          <button className={styles.evidenceButton} type="button" onClick={()=>setEvidenceOpen(true)} aria-haspopup="dialog" aria-expanded={evidenceOpen}><span>자료 근거</span><strong>{generatedAt?'현재 표본':'확인 필요'}</strong></button>
          <span className={styles.topSpacer}/>
          <button className={styles.commandButton} type="button" onClick={()=>setCommandOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">⌕</span>메뉴·상품·업무 빠르게 찾기 <kbd>Ctrl K</kbd></button>
          <button className={styles.topAction} type="button" onClick={toggleTheme} aria-label={theme==='light'?'어두운 화면으로 바꾸기':'밝은 화면으로 바꾸기'} aria-pressed={theme==='dark'}><span aria-hidden="true">{theme==='light'?'◐':'☀'}</span>{theme==='light'?'다크 모드':'라이트 모드'}</button>
          <Link className={styles.topAction} href="/notifications"><span className={styles.alertDot}/>{notificationCount==null?'운영 확인':`운영 확인 ${notificationCount}건`}</Link>
          <button className={`${styles.topAction} ${styles.primaryAction}`} type="button" onClick={refreshStatus} disabled={refreshing}><span aria-hidden="true">↻</span>{refreshing?'다시 확인 중':'전체 상태 새로고침'}</button>
          <form action="/api/dashboard/logout" method="post"><button className={styles.logoutButton} type="submit">로그아웃</button></form>
        </header>

        <header className={styles.mobileHeader}>
          <span className={styles.brandMark}>H</span><strong>{activeItem.label}</strong><span className={styles.mobileLiveChip}>운영</span><span className={styles.mobileSpacer}/>
          <button type="button" onClick={toggleTheme} aria-label={theme==='light'?'어두운 화면으로 바꾸기':'밝은 화면으로 바꾸기'} aria-pressed={theme==='dark'}>{theme==='light'?'◐':'☀'}</button>
          <Link href="/notifications" aria-label={notificationCount==null?'운영 확인':'운영 확인 항목'}>▣{notificationCount==null?null:<span>{notificationCount}</span>}</Link>
          <button type="button" onClick={refreshStatus} disabled={refreshing} aria-label="전체 상태 새로고침">↻</button>
        </header>

        <main className={styles.main}>{children}</main>
      </div>

      <nav className={styles.mobileNav} aria-label="모바일 주요 메뉴">
        {primaryItems.map(item=>{const active=item.id===routeId;return <Link href={item.href} key={item.id} aria-current={active?'page':undefined} className={active?styles.active:undefined}><RouteIcon id={item.id}/><span>{item.id==='orders'?'주문':item.id==='inventory'?'재고·상품':item.label}</span>{item.badge==null?null:<b>{item.badge}</b>}</Link>;})}
        <button ref={moreTriggerRef} type="button" onClick={()=>setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={!navigation.mobilePrimary.includes(routeId)?styles.active:undefined}><RouteIcon id="system"/><span>더보기</span></button>
      </nav>

      {moreOpen?<section className={styles.mobileMoreBackdrop} role="dialog" aria-modal="true" aria-labelledby="phase28-more-title"><div className={styles.mobileMore} ref={moreDialogRef}>
        <header className={styles.dialogHeader}><div><span>전체 메뉴</span><h2 id="phase28-more-title">어디로 이동할까요?</h2></div><button type="button" onClick={closeMore} aria-label="더보기 메뉴 닫기">×</button></header>
        <div className={styles.mobileMoreRoutes}>{secondaryItems.map(item=><Link href={item.href} key={item.id} onClick={closeMore} aria-current={item.id===routeId?'page':undefined}><span className={styles.navIcon}><RouteIcon id={item.id}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span>{item.badge==null?null:<b>{item.badge}</b>}</Link>)}</div>
        <form action="/api/dashboard/logout" method="post"><button className={styles.mobileLogout} type="submit">로그아웃</button></form>
      </div></section>:null}

      {commandOpen?<Phase28CommandPalette open items={navigation.items} onClose={closeCommand}/>:null}
      {evidenceOpen?<Phase28EvidenceDrawer open generatedAt={generatedAt} source="MAIN_OPERATION_SUMMARY" status={generatedAt?'현재 표본':'확인 필요'} onClose={closeEvidence}/>:null}
    </div>
  );
}
