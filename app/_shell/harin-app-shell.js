'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import hubRoutesModule from '../../lib/navigation/hub-routes.js';
import { HarinIcon } from '../_design-system/harin-icon.js';

const PRIMARY_MOBILE_VIEWS = ['main','orders','inventory','notifications'];
const PRIMARY_MOBILE_VIEW_SET = new Set(PRIMARY_MOBILE_VIEWS);

export function HarinTopbar({
  context,
  connectionLabel,
  connectionTone='ready',
  fontScale,
  onFontScale,
  syncing,
  onSync
}) {
  return <header className="topbar v8Topbar">
    <div className="topbarIdentity">
      <div className="brand"><span className="brandMark">H</span><div><b>하린식품</b><small>광고·매출 통합 관리 허브</small></div></div>
      <div className="topbarLocation" aria-label="현재 화면"><span>현재 화면</span><b>{context.group.label} · {context.item.label}</b></div>
    </div>
    <div className="headerActions">
      <span className={`live ${connectionTone}`}><i aria-hidden="true"/>{connectionLabel}</span>
      <label className="fontScaleControl"><span>글자</span><select aria-label="허브 글자 크기" value={fontScale} onChange={event=>onFontScale(event.target.value)}><option value="large">큰 글씨</option><option value="xlarge">더 큰 글씨</option></select></label>
      <button className="syncButton" type="button" onClick={onSync} disabled={syncing} aria-label={syncing?'데이터 동기화 중':'지금 데이터 동기화'}><HarinIcon name="sync"/><span>{syncing?'동기화 중…':'지금 동기화'}</span></button>
      <form action="/api/dashboard/logout" method="post"><button className="logoutButton" type="submit">나가기</button></form>
    </div>
  </header>;
}

export function HarinSidebar({ groups, view, openGroup, query, onQuery, onOpenGroup, onOpenView, onPrefetch }) {
  const normalizedQuery=query.trim().toLowerCase();
  const hasQuery=Boolean(normalizedQuery);
  const visible=groups.map(group=>({...group,items:group.items.filter(item=>`${item.label} ${item.description} ${group.label}`.toLowerCase().includes(normalizedQuery))})).filter(group=>group.items.length);
  const actionCount=groups.reduce((sum,group)=>sum+Number(group.actionCount||0),0);
  return <aside className="desktopSidebar v8Sidebar" aria-label="허브 사이드바">
    <label className="sidebarSearch"><span className="srOnly">메뉴 검색</span><i aria-hidden="true"><HarinIcon name="search"/></i><input type="search" value={query} onChange={event=>onQuery(event.target.value)} placeholder="메뉴·업무 찾기" /></label>
    <div className="sidebarMenuHeading"><span>운영 메뉴</span>{actionCount>0?<b>확인할 일 {actionCount}건</b>:<b>새 알림 없음</b>}</div>
    <nav aria-label="허브 메뉴">
      {visible.map(group=>{const expanded=hasQuery||openGroup===group.id;return <section className={`sidebarGroup${expanded?' expanded':''}`} key={group.id}>
        <button type="button" className="sidebarGroupButton" aria-expanded={expanded} aria-controls={`sidebar-group-${group.id}`} onClick={()=>onOpenGroup(expanded&&!hasQuery?null:group.id)}><i><HarinIcon name={group.id}/></i><span><b>{group.label}</b><small>{group.description}</small></span>{group.actionCount>0?<em aria-label={`확인할 항목 ${group.actionCount}개`}>{group.actionCount}</em>:null}<strong aria-hidden="true">{expanded?'−':'+'}</strong></button>
        {expanded?<div className="sidebarItems" id={`sidebar-group-${group.id}`}>{group.items.map(item=><button type="button" key={item.id} className={`sidebarItem${view===item.id?' active':''}`} aria-current={view===item.id?'page':undefined} onPointerEnter={()=>onPrefetch(item.id)} onFocus={()=>onPrefetch(item.id)} onClick={()=>onOpenView(item.id)}><i><HarinIcon name={item.id}/></i><span><b>{item.label}</b><small>{item.description}</small></span>{item.badge>0?<em aria-label={`확인할 항목 ${item.badge}개`}>{item.badge}</em>:null}</button>)}</div>:null}
      </section>})}
      {!visible.length?<p className="sidebarNoResult">찾는 메뉴가 없습니다.</p>:null}
    </nav>
  </aside>;
}

function MobileMorePanel({ groups, view, actionCount, fontScale, onFontScale, onClose, onOpenView, onPrefetch, closeButtonRef, panelRef }) {
  return <>
    <button type="button" className="mobileMenuBackdrop" aria-label="전체 메뉴 닫기" onClick={()=>onClose(true)} />
    <section ref={panelRef} className="mobileGroupedMenu" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" aria-describedby="mobile-menu-description" tabIndex={-1}>
      <header className="mobileMenuPanelHead"><span><small>하린식품 운영 허브</small><b id="mobile-menu-title">전체 메뉴</b><em>{actionCount>0?`확인할 일 ${actionCount}건`:'새 알림 없음'}</em></span><button ref={closeButtonRef} type="button" aria-label="전체 메뉴 닫기" onClick={()=>onClose(true)}>×</button></header>
      <p id="mobile-menu-description" className="srOnly">화면 설정과 모든 운영 메뉴를 선택할 수 있습니다.</p>
      <section className="mobileViewSettings"><b>화면 설정</b><label><span><strong>글자 크기</strong><small>모든 화면에 바로 적용됩니다.</small></span><select aria-label="모바일 허브 글자 크기" value={fontScale} onChange={event=>onFontScale(event.target.value)}><option value="large">큰 글씨</option><option value="xlarge">더 큰 글씨</option></select></label></section>
      <div className="mobileMenuGroups">
        {groups.map(group=><details className="mobileNavGroup" key={group.id} open={group.items.some(item=>item.id===view)}><summary><i aria-hidden="true"><HarinIcon name={group.id}/></i><span><b>{group.label}</b><small>{group.description}</small></span>{group.actionCount>0?<em>{group.actionCount}</em>:null}<strong aria-hidden="true">⌄</strong></summary><div>{group.items.map(item=><button type="button" key={item.id} className={view===item.id?'active':''} aria-current={view===item.id?'page':undefined} onPointerEnter={()=>onPrefetch(item.id)} onFocus={()=>onPrefetch(item.id)} onClick={()=>{onClose(false);onOpenView(item.id);}}><span><b>{item.label}</b><small>{item.description}</small></span>{item.badge>0?<em>{item.badge}</em>:null}</button>)}</div></details>)}
      </div>
    </section>
  </>;
}

export function HarinMobileNavigation({ nav, groups, view, onOpenView, onPrefetch, fontScale, onFontScale }) {
  const [menuOpen,setMenuOpen]=useState(false);
  const triggerRef=useRef(null);
  const closeButtonRef=useRef(null);
  const panelRef=useRef(null);
  const actionCount=groups.reduce((sum,group)=>sum+Number(group.actionCount||0),0);
  const closeMenu=returnFocus=>{
    setMenuOpen(false);
    if(returnFocus)requestAnimationFrame(()=>triggerRef.current?.focus());
  };
  useEffect(()=>{setMenuOpen(false);},[view]);
  useEffect(()=>{
    const mobileQuery=window.matchMedia('(max-width: 900px)');
    const closeOnDesktop=event=>{if(!event.matches)setMenuOpen(false);};
    mobileQuery.addEventListener('change',closeOnDesktop);
    return ()=>mobileQuery.removeEventListener('change',closeOnDesktop);
  },[]);
  useEffect(()=>{
    if(!menuOpen)return undefined;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    document.body.dataset.mobileMenuOpen='true';
    const onKeyDown=event=>{
      if(event.key==='Escape'){closeMenu(true);return;}
      if(event.key!=='Tab')return;
      const focusable=[...(panelRef.current?.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),summary,[href]')||[])].filter(item=>item.offsetParent!==null);
      if(!focusable.length){event.preventDefault();panelRef.current?.focus();return;}
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    requestAnimationFrame(()=>closeButtonRef.current?.focus());
    return ()=>{
      document.removeEventListener('keydown',onKeyDown);
      document.body.style.overflow=previousOverflow;
      delete document.body.dataset.mobileMenuOpen;
    };
  },[menuOpen]);
  return <nav className="mobileBottomNav" aria-label="모바일 주요 메뉴">
    {PRIMARY_MOBILE_VIEWS.map(id=>nav.find(item=>item.id===id)).filter(Boolean).map(item=><button type="button" className={view===item.id?'active':''} aria-current={view===item.id?'page':undefined} onPointerEnter={()=>onPrefetch(item.id)} onFocus={()=>onPrefetch(item.id)} onClick={()=>onOpenView(item.id)} key={item.id}><i><HarinIcon name={item.id}/></i><span>{item.id==='notifications'?'알림':item.label}</span>{item.badge>0?<em>{item.badge}</em>:null}</button>)}
    <button ref={triggerRef} type="button" className={`mobileMoreTrigger${!PRIMARY_MOBILE_VIEW_SET.has(view)||menuOpen?' active':''}`} aria-expanded={menuOpen} aria-controls="mobile-more-panel" onClick={()=>setMenuOpen(open=>!open)}><i><HarinIcon name="menu"/></i><span>더보기</span>{actionCount>0?<em>{actionCount}</em>:null}</button>
    {menuOpen?<div id="mobile-more-panel" className="mobileMoreLayer"><MobileMorePanel groups={groups} view={view} actionCount={actionCount} fontScale={fontScale} onFontScale={onFontScale} onClose={closeMenu} onOpenView={onOpenView} onPrefetch={onPrefetch} closeButtonRef={closeButtonRef} panelRef={panelRef}/></div>:null}
  </nav>;
}

export function HarinBreadcrumbBar({ context, refreshedLabel }) {
  return <nav className="hubBreadcrumb" aria-label="현재 위치"><ol><li>{context.group.label}</li><li>{context.item.label}</li><li>{context.platform}</li></ol><span>{refreshedLabel||'최근 갱신 기록 없음'}</span></nav>;
}

export function HarinFocusedWorkspaceNav({ view, workspace, platform, period, product }) {
  const items=hubRoutesModule.HUB_WORKSPACES?.[view]||[];
  if(!items.length)return null;
  const pageLabel=hubRoutesModule.HUB_NAV.find(item=>item.id===view)?.label||view;
  return <nav className={`focusedWorkspaceNav ${view}`} aria-label={`${pageLabel} 작업공간`}>
    {items.map((item,index)=><Link className={workspace===item.id?'active':''} aria-current={workspace===item.id?'page':undefined} href={hubRoutesModule.buildHubHref({view,workspace:item.id,platform,period,product})} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span><b>{item.label}</b><small>{item.description}</small></span><em aria-hidden="true">→</em></Link>)}
  </nav>;
}
