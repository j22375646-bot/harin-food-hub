'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import routeRegistryModule from '../../lib/ui/phase28-route-registry.js';
import {pushPhase28Route} from './phase28-navigation-feedback.js';
import Phase28HomePage from './pages/home-page.js';

const {phase28Route,phase28RouteForLegacyState}=routeRegistryModule;

export default function Phase28HomeApp({initialData}){
  const router=useRouter();

  useEffect(()=>{
    const refreshIfVisible=()=>{
      if(document.visibilityState==='visible')router.refresh();
    };
    const intervalId=window.setInterval(refreshIfVisible,5*60*1000);
    document.addEventListener('visibilitychange',refreshIfVisible);
    return()=>{
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange',refreshIfVisible);
    };
  },[router]);

  function navigate(target){
    const route=typeof target==='string'
      ?phase28Route(target)
      :phase28Route(target?.id)||phase28RouteForLegacyState(target);
    if(route)pushPhase28Route(router,route.href);
  }

  return <Phase28HomePage
    model={initialData.phase28?.main||{}}
    aiPanel={initialData.aiPagePanels?.main||null}
    onNavigate={navigate}
    onRefresh={()=>router.refresh()}
  />;
}
