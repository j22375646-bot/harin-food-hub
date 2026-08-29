'use client';

import {useRouter} from 'next/navigation';
import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';
import routeRegistryModule from '../../lib/ui/phase28-route-registry.js';
import Phase28HomePage from './pages/home-page.js';
import Phase28Shell from './phase28-shell.js';

const {phase28Route,phase28RouteForLegacyState}=routeRegistryModule;

export default function Phase28App({initialData}) {
  const router=useRouter();
  const routeId=initialData.phase28Runtime?.routeId||'home';
  const navigationSnapshot=initialData.navigationSnapshot||operationSnapshotModule.buildNavigationOperationSnapshot(initialData);
  const generatedAt=navigationSnapshot?.generatedAt||initialData.generatedAt||null;

  function navigate(target) {
    const route=typeof target==='string'
      ?phase28Route(target)
      :phase28Route(target?.id)||phase28RouteForLegacyState(target);
    if(route)router.push(route.href);
  }

  const page=routeId==='home'
    ?<Phase28HomePage model={initialData.phase28?.main||{}} aiPanel={initialData.aiPagePanels?.main||null} onNavigate={navigate}/>
    :<section data-phase28-root="true" data-phase28-page={routeId} aria-label="Phase 28 페이지 준비 상태">이 페이지의 운영 화면은 확인 필요 상태예요.</section>;

  return <Phase28Shell routeId={routeId} badges={navigationSnapshot?.badges||{}} generatedAt={generatedAt}>
    {page}
  </Phase28Shell>;
}
