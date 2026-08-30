'use client';

import dynamic from 'next/dynamic';
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
import Phase28InsightsPage from './pages/insights-page.js';
import Phase28SystemPage from './pages/system-page.js';
import Phase28NotificationsPage from './pages/notifications-page.js';
import Phase28Shell from './phase28-shell.js';
import {pushPhase28Route} from './phase28-navigation-feedback.js';

function OnDemandRouteLoading({label}){
  return <section className="phase28OnDemandLoading" role="status" aria-live="polite"><span>필요할 때 불러오기</span><strong>{label} 준비 중</strong><small>선택한 페이지 자료만 불러오고 있어요.</small></section>;
}

const Phase28DiagnosesPage=dynamic(()=>import('./pages/diagnoses-page.js'),{loading:()=> <OnDemandRouteLoading label="진단목록"/>});
const Phase28ChangesPage=dynamic(()=>import('./pages/changes-page.js'),{loading:()=> <OnDemandRouteLoading label="변경기록"/>});
const Phase28ValidationPage=dynamic(()=>import('./pages/validation-page.js'),{loading:()=> <OnDemandRouteLoading label="실행검증"/>});
const Phase28ExperimentsPage=dynamic(()=>import('./pages/experiments-page.js'),{loading:()=> <OnDemandRouteLoading label="A/B 테스트"/>});
const Phase28KnowledgePage=dynamic(()=>import('./pages/knowledge-page.js'),{loading:()=> <OnDemandRouteLoading label="AI 기준자료"/>});

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
    if(route)pushPhase28Route(router,route.href);
  }

  let page;
  if(routeId==='home')page=<Phase28HomePage model={initialData.phase28?.main||{}} aiPanel={initialData.aiPagePanels?.main||null} onNavigate={navigate} onRefresh={()=>router.refresh()}/>;
  else if(routeId==='orders')page=<Phase28OrdersPage model={initialData.phase28?.orders||{}}/>;
  else if(routeId==='cs')page=<Phase28CsPage model={initialData.phase28?.cs||{}}/>;
  else if(routeId==='inventory'||routeId==='products')page=<Phase28InventoryProductsPage mode={routeId} model={routeId==='inventory'?initialData.phase28?.inventory||{}:initialData.phase28?.products||{}}/>;
  else if(routeId==='settlement')page=<Phase28SettlementPage model={initialData.phase28?.settlement||{}} aiPanel={initialData.aiPagePanels?.settlement||null}/>;
  else if(routeId==='keywords')page=<Phase28KeywordsPage model={initialData.phase28?.keywords||{}} aiPanel={initialData.aiPagePanels?.keyword||null}/>;
  else if(routeId==='product-analysis')page=<Phase28ProductAnalysisPage model={initialData.phase28?.productAnalysis||{}}/>;
  else if(routeId==='analysis')page=<Phase28InsightsPage model={initialData.phase28?.insights||{}}/>;
  else if(routeId==='system')page=<Phase28SystemPage model={initialData.phase28?.system||{}}/>;
  else if(routeId==='notifications')page=<Phase28NotificationsPage model={initialData.phase28?.notifications||{}}/>;
  else if(routeId==='diagnoses')page=<Phase28DiagnosesPage model={initialData.phase28?.diagnoses||{}}/>;
  else if(routeId==='changes')page=<Phase28ChangesPage model={initialData.phase28?.changes||{}}/>;
  else if(routeId==='validation')page=<Phase28ValidationPage model={initialData.phase28?.validation||{}}/>;
  else if(routeId==='experiments')page=<Phase28ExperimentsPage model={initialData.phase28?.experiments||{items:[],products:[],benchmarks:[],summary:{}}}/>;
  else if(routeId==='knowledge')page=<Phase28KnowledgePage model={initialData.phase28?.knowledge||{items:[],categories:{},pageLabels:{},recommended:[],summary:{}}}/>;
  else page=<section data-phase28-root="true" data-phase28-page={routeId} aria-label="Phase 28 페이지 준비 상태">이 페이지의 운영 화면은 확인 필요 상태예요.</section>;

  return <Phase28Shell routeId={routeId} navigationSnapshot={navigationSnapshot} generatedAt={generatedAt}>
    {page}
  </Phase28Shell>;
}
