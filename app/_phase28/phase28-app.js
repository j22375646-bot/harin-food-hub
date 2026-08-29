'use client';

import {useRouter} from 'next/navigation';
import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';
import routeRegistryModule from '../../lib/ui/phase28-route-registry.js';
import Phase28HomePage from './pages/home-page.js';
import Phase28OrdersPage from './pages/orders-page.js';
import Phase28CsPage from './pages/cs-page.js';
import Phase28InventoryProductsPage from './pages/inventory-products-page.js';
import Phase28SettlementPage from './pages/settlement-page.js';
import Phase28KeywordsPage from './pages/keywords-page.js';
import Phase28ProductAnalysisPage from './pages/product-analysis-page.js';
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

  let page;
  if(routeId==='home')page=<Phase28HomePage model={initialData.phase28?.main||{}} aiPanel={initialData.aiPagePanels?.main||null} onNavigate={navigate}/>;
  else if(routeId==='orders')page=<Phase28OrdersPage model={initialData.phase28?.orders||{}}/>;
  else if(routeId==='cs')page=<Phase28CsPage model={initialData.phase28?.cs||{}}/>;
  else if(routeId==='inventory'||routeId==='products')page=<Phase28InventoryProductsPage mode={routeId} model={routeId==='inventory'?initialData.phase28?.inventory||{}:initialData.phase28?.products||{}}/>;
  else if(routeId==='settlement')page=<Phase28SettlementPage model={initialData.phase28?.settlement||{}} aiPanel={initialData.aiPagePanels?.settlement||null}/>;
  else if(routeId==='keywords')page=<Phase28KeywordsPage model={initialData.phase28?.keywords||{}} aiPanel={initialData.aiPagePanels?.keyword||null}/>;
  else if(routeId==='product-analysis')page=<Phase28ProductAnalysisPage model={initialData.phase28?.productAnalysis||{}}/>;
  else page=<section data-phase28-root="true" data-phase28-page={routeId} aria-label="Phase 28 페이지 준비 상태">이 페이지의 운영 화면은 확인 필요 상태예요.</section>;

  return <Phase28Shell routeId={routeId} badges={navigationSnapshot?.badges||{}} generatedAt={generatedAt}>
    {page}
  </Phase28Shell>;
}
