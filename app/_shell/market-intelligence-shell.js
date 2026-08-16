'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import hubRoutesModule from '../../lib/navigation/hub-routes.js';
import { useStoredState } from '../use-hub-preference.js';
import { HarinMobileNavigation, HarinSidebar, HarinTopbar } from './harin-app-shell.js';
import HarinLoadingScreen from '../_design-system/harin-loading-screen.js';

export default function MarketIntelligenceShell({children}){
  const router=useRouter();
  const pathname=usePathname();
  const [mounted,setMounted]=useState(false);
  const [fontScale,setFontScale]=useStoredState('font-scale','large',['large','xlarge']);
  const [openGroup,setOpenGroup]=useState('analysis');
  const [query,setQuery]=useState('');
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{document.documentElement.dataset.fontScale=fontScale;},[fontScale]);

  const nav=hubRoutesModule.HUB_NAV.map(item=>({...item,badge:0}));
  const groups=hubRoutesModule.HUB_NAV_GROUPS.map(group=>{
    const items=group.items.map(id=>nav.find(item=>item.id===id)).filter(Boolean);
    return {...group,items,actionCount:0};
  });
  const openView=id=>router.push(hubRoutesModule.routeFor(id));
  const prefetchView=id=>router.prefetch(hubRoutesModule.routeFor(id));
  async function runSync(){
    setSyncing(true);setSyncMessage('전체 플랫폼의 최신 자료를 확인하고 있어요…');
    try{
      const response=await fetch('/api/sync/all',{method:'POST'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'전체 동기화에 실패했습니다.');
      setSyncMessage(result.status==='PARTIAL'?'일부 채널은 이전 자료를 유지했습니다.':'전체 플랫폼 자료를 최신 상태로 확인했습니다.');
      router.refresh();
    }catch(error){setSyncMessage(`확인 필요 · ${error.message}`);}
    finally{setSyncing(false);}
  }
  if(!mounted)return <HarinLoadingScreen title="상품별 성장 프로젝트를 준비하고 있어요" description="판매 중인 상품과 최근 분석을 안전하게 연결하고 있습니다."/>;
  const context={group:{label:'분석'},item:{label:'시장·전환'},platform:'선택 상품'};
  return <div className="shell marketHubShell">
    <HarinTopbar context={context} connectionLabel="상품별 분석 공간" connectionTone="check" fontScale={fontScale} onFontScale={setFontScale} syncing={syncing} onSync={runSync}/>
    <HarinSidebar groups={groups} view="market" openGroup={openGroup} query={query} onQuery={setQuery} onOpenGroup={setOpenGroup} onOpenView={openView} onPrefetch={prefetchView}/>
    <main className="hubMain marketHubMain" data-path={pathname}>
      <nav className="marketBreadcrumb" aria-label="현재 위치"><span>분석</span><i>›</i><b>시장·전환</b></nav>
      {syncMessage?<div className="syncToast">{syncMessage}</div>:null}
      {children}
    </main>
    <HarinMobileNavigation nav={nav} groups={groups} view="market" onOpenView={openView} onPrefetch={prefetchView} fontScale={fontScale} onFontScale={setFontScale}/>
    <footer className="hubFooter">하린식품 시장·전환 성장센터 <span>·</span> 상품별 근거와 실행을 따로 관리합니다</footer>
  </div>;
}
