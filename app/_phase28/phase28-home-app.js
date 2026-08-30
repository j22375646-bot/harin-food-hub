'use client';

import {useRouter} from 'next/navigation';
import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';
import routeRegistryModule from '../../lib/ui/phase28-route-registry.js';
import Phase28Shell from './phase28-shell.js';
import {pushPhase28Route} from './phase28-navigation-feedback.js';
import Phase28HomePage from './pages/home-page.js';

const {phase28Route,phase28RouteForLegacyState}=routeRegistryModule;

export default function Phase28HomeApp({initialData}){
  const router=useRouter();
  const navigationSnapshot=initialData.navigationSnapshot||operationSnapshotModule.buildNavigationOperationSnapshot(initialData);
  const generatedAt=navigationSnapshot?.generatedAt||initialData.generatedAt||null;

  function navigate(target){
    const route=typeof target==='string'
      ?phase28Route(target)
      :phase28Route(target?.id)||phase28RouteForLegacyState(target);
    if(route)pushPhase28Route(router,route.href);
  }

  return <Phase28Shell routeId="home" navigationSnapshot={navigationSnapshot} generatedAt={generatedAt}>
    <Phase28HomePage
      model={initialData.phase28?.main||{}}
      aiPanel={initialData.aiPagePanels?.main||null}
      onNavigate={navigate}
      onRefresh={()=>router.refresh()}
    />
  </Phase28Shell>;
}
