'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import freshnessModule from '../lib/ui/freshness.js';
import { getHubHelp } from '../lib/ui/help-content.js';
import hubRoutesModule from '../lib/navigation/hub-routes.js';
import navigationOperationSnapshotModule from '../lib/navigation/operation-snapshot.js';
import adaptiveCanvasModule from '../lib/ui/adaptive-canvas.js';
import sidebarCollapseModule from '../lib/ui/sidebar-collapse.js';
import { useStoredState } from './use-hub-preference.js';
import { HarinBreadcrumbBar, HarinFocusedWorkspaceNav, HarinMobileNavigation, HarinSidebar, HarinTopbar } from './_shell/harin-app-shell.js';
import { HarinRouteProgress } from './_design-system/harin-ui.js';
import HarinIcon from './_design-system/harin-icon.js';
import './_analysis/harin-keyword-flat-v8.css';

const { relativeFreshnessLabel } = freshnessModule;

function LazyWorkbenchFallback(){
  return <section className="lazyWorkbenchFallback" role="status" aria-live="polite" aria-busy="true"><i aria-hidden="true"/><span><b>작업공간을 준비하고 있어요</b><small>현재 화면은 유지하고 필요한 기능만 불러옵니다.</small></span></section>;
}
const UnifiedOrdersCenter=dynamic(()=>import('./unified-orders-center.js'),{loading:LazyWorkbenchFallback});
const PlatformProductView=dynamic(()=>import('./_products/harin-product-workbench.js'),{loading:LazyWorkbenchFallback});
const MarketingDiagnosisCenter=dynamic(()=>import('./marketing-diagnosis-center.js'),{loading:LazyWorkbenchFallback});
const MarketingInsightSummary=dynamic(()=>import('./marketing-diagnosis-center.js').then(module=>module.MarketingInsightSummary),{loading:LazyWorkbenchFallback});
const NaverExecutiveBoard=dynamic(()=>import('./naver-executive-board.js'),{loading:LazyWorkbenchFallback});
const HarinAiFoundation=dynamic(()=>import('./harin-ai-foundation.js'),{loading:LazyWorkbenchFallback});
const HarinAiPagePanel=dynamic(()=>import('./harin-ai-page-panel.js'),{loading:LazyWorkbenchFallback});
const AiKnowledgeCenter=dynamic(()=>import('./ai-knowledge-center.js'),{loading:LazyWorkbenchFallback});
const CustomerRetentionValidationCenter=dynamic(()=>import('./customer-retention-validation-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedCustomerServiceCenter=dynamic(()=>import('./unified-customer-service-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedInventoryOperationsCenter=dynamic(()=>import('./unified-inventory-operations-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedSettlementOperationsCenter=dynamic(()=>import('./unified-settlement-operations-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedCollectionOperationsCenter=dynamic(()=>import('./unified-collection-operations-center.js'),{loading:LazyWorkbenchFallback});
const Phase14MainCommandCenter=dynamic(()=>import('./_main/harin-main-command-center.js'),{loading:LazyWorkbenchFallback});
const HarinAnalysisWorkbench=dynamic(()=>import('./_analysis/harin-analysis-workbench.js'),{loading:LazyWorkbenchFallback});
const KeywordOwnerShell=dynamic(()=>import('./_analysis/keyword-owner-shell.js'),{loading:LazyWorkbenchFallback});
const HarinKeywordDetailWorkbench=dynamic(()=>import('./_analysis/harin-keyword-detail-workbench.js'),{loading:LazyWorkbenchFallback});
const CoupangSalesCenter=dynamic(()=>import('./_analysis/coupang-sales-center.js'),{loading:LazyWorkbenchFallback});
const HarinExecutionWorkbench=dynamic(()=>import('./_execution/harin-execution-workbench.js'),{loading:LazyWorkbenchFallback});
const HarinReportsCenter=dynamic(()=>import('./_execution/harin-reports-center.js'),{loading:LazyWorkbenchFallback});
const HarinFinancialChangeCenter=dynamic(()=>import('./_execution/harin-financial-change-center.js'),{loading:LazyWorkbenchFallback});
const HarinExperimentLab=dynamic(()=>import('./_execution/harin-experiment-lab.js'),{loading:LazyWorkbenchFallback});
const HarinReliabilityWorkbench=dynamic(()=>import('./_reliability/harin-reliability-workbench.js'),{loading:LazyWorkbenchFallback});
const HarinNotificationCenter=dynamic(()=>import('./_reliability/harin-notification-center.js'),{loading:LazyWorkbenchFallback});
const HarinLiveStatusDock=dynamic(()=>import('./_reliability/harin-live-status-dock.js'),{loading:LazyWorkbenchFallback});
const HarinOwnerWorkspace=dynamic(()=>import('./_workspace/harin-owner-workspace.js'),{loading:LazyWorkbenchFallback});
const NaverApiConnectionCenter=dynamic(()=>import('./naver-api-connection-center.js'),{loading:LazyWorkbenchFallback});
const AdvertisingChannelCenter=dynamic(()=>import('./advertising-channel-center.js'),{loading:LazyWorkbenchFallback});
const ProviderFallbackCenter=dynamic(()=>import('./provider-fallback-center.js'),{loading:LazyWorkbenchFallback});
const OptionalProviderCenter=dynamic(()=>import('./optional-provider-center.js'),{loading:LazyWorkbenchFallback});
const ProviderOperationsCenter=dynamic(()=>import('./provider-operations-center.js'),{loading:LazyWorkbenchFallback});
const ExecutionPathCenter=dynamic(()=>import('./execution-path-center.js'),{loading:LazyWorkbenchFallback});
const OwnedSiteConnectionCenter=dynamic(()=>import('./owned-site-connection-center.js'),{loading:LazyWorkbenchFallback});
const ShippingReferenceCenter=dynamic(()=>import('./shipping-reference-center.js'),{loading:LazyWorkbenchFallback});
const OperationsHealthCenter=dynamic(()=>import('./operations-health-center.js'),{loading:LazyWorkbenchFallback});
const CoupangOrdersView=dynamic(()=>import('./_operations/coupang-operation-details.js').then(module=>module.CoupangOrdersView),{loading:LazyWorkbenchFallback});
const CoupangSettlementView=dynamic(()=>import('./_operations/coupang-operation-details.js').then(module=>module.CoupangSettlementView),{loading:LazyWorkbenchFallback});

const won = value => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;
const count = value => Number(value || 0).toLocaleString('ko-KR');
const num = value => Number(value || 0);
const shortDate = value => String(value || '').slice(5).replace('-', '.');
function kstParts(value) {
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}
const dateTime = value => {
  const parts=kstParts(value);
  return parts?`${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}:${parts.second}`:'시각 확인 필요';
};
const dateLabel = value => {
  const parts=kstParts(value);
  return parts?`${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}.`:'날짜 확인 필요';
};
const platformReportName = { all: 'ALL', naver: 'NAVER', coupang: 'COUPANG', cafe24: 'CAFE24' };
const platformLabel = { all: '전체', naver: '네이버', coupang: '쿠팡', cafe24: 'Cafe24' };
const channelScopedViews = new Set(['insight','keyword','product']);
const financialContextViews = new Set(['insight','keyword','product']);
const embeddedHelpViews = new Set(['orders','cs','inventory','settlement','collection']);
const NAVIGATION_SNAPSHOT_KEY='harin-hub:navigation-operation-snapshot';
async function coupangFixedIpResult(response) {
  const initial = await response.json();
  if (response.status !== 202 || !initial.request?.id) return initial;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 750));
    const statusResponse = await fetch(`/api/coupang/operations/${initial.request.id}`, { cache:'no-store' });
    const result = await statusResponse.json();
    if (statusResponse.status === 202) continue;
    return result;
  }
  return { ok:false, error:'서울 고정 IP 서버의 응답 시간이 초과됐습니다. 작업 이력에서 상태를 확인해주세요.' };
}
async function executeConfirmedFinancialPreview(previewResult) {
  const requestId=previewResult?.request?.id;
  if(!requestId)throw new Error('변경 기록 ID를 받지 못했습니다. 다시 시도해주세요.');
  const response=await fetch(`/api/financial-changes/${requestId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIRM_EXECUTE',confirm:true,note:'사장님 확인 팝업 후 즉시 실행'})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||'변경을 적용하지 못했습니다.');
  if(result.blocked||result.applied===false)throw new Error(result.request?.error_message||'자료가 바뀌어 실행을 멈췄습니다. 다시 확인해주세요.');
  if(!result.verified)throw new Error(result.request?.error_message||'변경 후 실제값 재확인이 필요합니다. 변경 기록을 확인해주세요.');
  return result;
}
function reportHasPlatform(report, platform) {
  if (platform === 'all') return report.platform === 'ALL' || Boolean(report.summary_json);
  const target = platformReportName[platform];
  return report.platform === target || (report.platform === 'ALL' && Boolean(report.summary_json?.[platform]));
}

function Kpi({ tone, icon, label, value, sub }) {
  return <article className={`kpi ${tone}`}><div className="kpiIcon">{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{sub}</span></div></article>;
}
function Empty({ children }) { return <div className="empty">{children}</div>; }
function PanelTitle({ tag, title, right }) { return <div className="panelHead"><div><span className="sectionTag">{tag}</span><h2>{title}</h2></div>{right && <span className="period">{right}</span>}</div>; }

function HelpBox({ help, compact=false, persistKey }) {
  const [open,setOpen]=useStoredState(`help:${persistKey||help?.title||'unknown'}`,false,[true,false]);
  if (!help) return null;
  return <details className={`helpBox${compact?' compact':''}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>
      <span className="helpBoxHeading"><i aria-hidden="true">?</i><span><b>도움말 · {help.title}</b><small>{help.summary}</small></span></span>
      <em><span className="helpOpenLabel">열기</span><span className="helpCloseLabel">접기</span></em>
    </summary>
    <div className="helpBoxBody">
      <section><b>쉽게 말하면</b><p>{help.meaning}</p></section>
      <section><b>언제 보면 되나요?</b><p>{help.when}</p></section>
      <section className="helpExample"><b>숫자로 예를 들면</b><p>{help.example}</p></section>
      <section className="helpAction"><b>지금 무엇을 하면 되나요?</b><p>{help.action}</p></section>
      {help.terms?.length?<section className="helpTerms"><b>어려운 말 쉽게 보기</b><dl>{help.terms.map(([term,description])=><div key={term}><dt>{term}</dt><dd>{description}</dd></div>)}</dl></section>:null}
    </div>
  </details>;
}

function DataStatusPanel({ data, platform='all', refreshedAt, generatedAt, onOpenCollection }) {
  const initialClock=useMemo(()=>{
    const value=new Date(generatedAt||refreshedAt||0).getTime();
    return Number.isNaN(value)||value<=0?0:value;
  },[generatedAt,refreshedAt]);
  const [clock,setClock]=useState(initialClock);
  useEffect(()=>{
    setClock(Date.now());
    const timer=window.setInterval(()=>setClock(Date.now()),60*1000);
    return ()=>window.clearInterval(timer);
  },[]);
  const health=data.dataHealth?.channels||[];
  const connectionByPlatform=new Map((data.collectionCenter?.channels||[]).map(item=>[item.platform,item]));
  const stateFor=platform=>{
    const item=health.find(value=>value.platform===platform),status=item?.status;
    const connection=connectionByPlatform.get(platform);
    if(connection&&!['READ_READY','WRITE_READY'].includes(connection.connection_status))return ['partial','연결 확인'];
    if(item?.dataMode==='PREVIOUS')return ['partial','이전 자료'];
    if(status==='READY')return ['ready','정상'];
    if(status==='PARTIAL')return ['partial','일부 확인'];
    if(status==='FAILED')return ['partial','수집 실패'];
    if(status==='RUNNING')return ['running','수집 중'];
    if(status==='STALE')return ['waiting','갱신 필요'];
    return ['waiting','수집 대기'];
  };
  const selected=platform==='all'?null:health.find(item=>item.platform===platform.toUpperCase());
  const connectionAffected=(data.collectionCenter?.channels||[]).filter(item=>!['READ_READY','WRITE_READY'].includes(item.connection_status));
  const affected=selected&&(selected.failedDatasets?.length||selected.dataMode==='PREVIOUS'||connectionAffected.some(item=>item.platform===selected.platform))
    ? [selected]
    : health.filter(item=>item.failedDatasets?.length||item.dataMode==='PREVIOUS'||['FAILED','PARTIAL','STALE'].includes(item.status)||connectionAffected.some(connection=>connection.platform===item.platform));
  const relativeNow=clock||initialClock;
  const refreshAge=relativeFreshnessLabel(refreshedAt,relativeNow);
  return <details className={`pageDataStatus${affected.length?' warning':''}`}>
    <summary aria-label="채널별 데이터 상태 열기">
      <span className="pageDataStatusTitle"><i aria-hidden="true"><HarinIcon name="database" size={18}/></i><span><b>데이터·연결 상태</b><small>{affected.length?`${affected.length}개 채널 확인 필요`:'세 채널 자료 확인'} · 최근 전체 갱신 {refreshAge}</small></span></span>
      <span className="pageDataStatusChannels">{[['NAVER','네이버'],['COUPANG','쿠팡'],['CAFE24','Cafe24']].map(([id,label])=>{const [tone,status]=stateFor(id);const channelHealth=health.find(item=>item.platform===id);const connection=connectionByPlatform.get(id);const lastAt=connection?.last_success_at||channelHealth?.lastSuccessAt||connection?.last_attempt_at||channelHealth?.lastAttemptAt;return <span className={tone} title={lastAt?`${dateTime(lastAt)} 갱신`:'갱신 기록 없음'} key={id}><i aria-hidden="true"/><span><strong>{label}</strong><em>{status} · {relativeFreshnessLabel(lastAt,relativeNow)}</em></span></span>})}</span>
      <em className="pageDataStatusToggle">열기</em>
    </summary>
    <div className="pageDataStatusBody">
      <DataHealthNotice dataHealth={data.dataHealth} platform={platform}/>
      <div className="pageDataStatusGuide"><span><b>숫자가 이상할 때</b><small>실패한 값을 0으로 바꾸지 않습니다. 해당 채널만 다시 수집한 뒤 기준시각을 확인하세요.</small></span><button type="button" onClick={onOpenCollection}>데이터수집 열기</button></div>
    </div>
  </details>;
}

function DataHealthNotice({ dataHealth, platform='all' }) {
  if(!dataHealth||dataHealth.overallStatus==='READY')return null;
  const selected=platform==='all'?null:dataHealth.channels?.find(item=>item.platform===platform.toUpperCase());
  const affected=selected&&(selected.failedDatasets?.length||selected.dataMode==='PREVIOUS')?selected:dataHealth.channels?.filter(item=>item.failedDatasets?.length||item.dataMode==='PREVIOUS')||[];
  const names=Array.isArray(affected)?affected.map(item=>({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'})[item.platform]).join('·'):({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'})[affected.platform];
  const previous=Array.isArray(affected)?affected.some(item=>item.dataMode==='PREVIOUS'):affected?.dataMode==='PREVIOUS';
  return <section className="dataHealthNotice" role="status"><div><b>{previous?`${names}는 마지막 성공 자료를 보여드려요`:selected?.failedDatasets?.length?`${names} 자료 일부를 불러오지 못했어요`:`${names||'일부 공통 자료'}를 확인하고 있어요`}</b><p>{previous?'새 수집이 실패했거나 오래되어 계산 결과는 “확인 필요”로 보호합니다. 저장된 이전 자료는 그대로 볼 수 있습니다.':'다른 채널은 정상적으로 계속 보여드립니다. 실패한 자료를 0으로 계산하지 않았으며, 데이터수집에서 해당 채널만 다시 받을 수 있습니다.'}</p></div><span>{previous?'이전 자료 · 계산 보호':'채널 분리 보호 중'}</span></section>;
}

function ChannelUnavailable({ health, onOpenCollection }) {
  return <section className="channelUnavailable"><span>DATA SAFETY</span><h2>{({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'})[health.platform]} 숫자를 잠시 숨겼어요</h2><p>불러오지 못한 자료를 0으로 보여주면 잘못 판단할 수 있어 보호했습니다. 다른 채널에는 영향이 없습니다.</p><small>확인할 자료 · {health.failedDatasets.join(', ')}</small><button type="button" onClick={onOpenCollection}>데이터수집에서 이 채널 다시 받기</button></section>;
}

function FinancialTrustBanner({ trust={}, onOpenProduct }) {
  if (trust.status !== 'BLOCKED') return null;
  const awaitingEvidence=trust.cost_coverage_rate==null;
  const coverage=awaitingEvidence?'판단 보류':`${num(trust.cost_coverage_rate).toFixed(1)}%`;
  const unassigned=trust.unassigned_ad_spend==null||awaitingEvidence?'판단 보류':won(trust.unassigned_ad_spend);
  const costGap=awaitingEvidence?'원가 미입력 판단 보류':`원가 미입력 ${count(trust.missing_cost_products)}개 / ${won(trust.missing_cost_revenue)}`;
  return <section className="financialTrustBanner" role="alert"><div><span>FINANCIAL TRUST GATE · 미산정 보호</span><b>재무 지표를 임시 차단했습니다.</b><p>{awaitingEvidence?'이 화면에는 계산할 원가·매출 근거가 없어 0으로 표시하지 않았습니다. 상품·원가 화면에서 실제 자료를 확인해주세요.':(trust.reasons||[]).map(item=>item.message).join(' ')}</p><small>원가 반영률 {coverage} · {costGap} · 미귀속 광고비 {unassigned}</small></div><button type="button" onClick={onOpenProduct}>상품·원가 연결하기</button></section>;
}

const metricStatusLabel={READY:'정상',PARTIAL:'표본 부족',BLOCKED:'차단',NO_DATA:'데이터 없음',PARSE_ERROR:'해석 오류',STALE:'확인 필요'};
function MetricProvenanceStrip({ snapshots=[] }) {
  if (!snapshots.length) return null;
  return <section className="metricProvenance" aria-label="핵심 지표 출처와 상태"><div className="metricProvenanceTitle"><b>핵심 지표 신뢰도</b><span>출처 · 기준시각 · 계산식 버전</span></div><div className="metricProvenanceGrid">{snapshots.map(metric=><article key={metric.id} className={`metricSnapshot ${String(metric.status||'NO_DATA').toLowerCase()}`}><div><b>{metric.label}</b><em>{metricStatusLabel[metric.status]||metric.status}</em></div><p>{(metric.source||[]).map(item=>`${item.platform} · ${item.dataset}`).join(' + ')}</p><small>{metric.as_of?`${dateTime(metric.as_of)} 기준`:'기준시각 없음'} · {metric.formula?.version||'버전 없음'}</small></article>)}</div></section>;
}

export default function Dashboard({ initialData, initialState }) {
  const router=useRouter();
  const [routePending,startRouteTransition]=useTransition();
  const normalizedInitial=hubRoutesModule.normalizeHubState(initialState);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [platform, setPlatform] = useState(normalizedInitial.platform);
  const [view, setView] = useState(normalizedInitial.view);
  const [workspace,setWorkspace]=useState(normalizedInitial.workspace);
  const [selectedProduct,setSelectedProduct]=useState(normalizedInitial.product);
  const [period,setPeriod]=useState(normalizedInitial.period);
  const [openNavGroup,setOpenNavGroup]=useState(hubRoutesModule.groupForView(normalizedInitial.view));
  const [navQuery,setNavQuery]=useState('');
  const [pendingView,setPendingView]=useState(null);
  const [pendingWorkspace,setPendingWorkspace]=useState(null);
  const prefetchedViews=useRef(new Set([normalizedInitial.view]));
  const [fontScale,setFontScale]=useStoredState('font-scale','large',['large','xlarge']);
  const [sidebarCollapsed,setSidebarCollapsed]=useStoredState('desktop-sidebar-collapsed',false,[true,false]);
  const incomingNavigationSnapshot=useMemo(
    ()=>navigationOperationSnapshotModule.buildNavigationOperationSnapshot(initialData),
    [initialData.loadedView,initialData.generatedAt,initialData.unifiedOrders,initialData.customerService,initialData.unifiedInventory,initialData.alerts,initialData.channelConnections]
  );
  const [navigationSnapshot,setNavigationSnapshot]=useState(incomingNavigationSnapshot);
  useEffect(()=>{document.documentElement.dataset.fontScale=fontScale;},[fontScale]);
  useEffect(()=>{
    document.documentElement.dataset.harinSidebar=sidebarCollapseModule.sidebarRootState(sidebarCollapsed);
  },[sidebarCollapsed]);
  useEffect(()=>{
    let stored=null;
    try{stored=navigationOperationSnapshotModule.parseNavigationOperationSnapshot(window.localStorage.getItem(NAVIGATION_SNAPSHOT_KEY));}catch{}
    const selected=navigationOperationSnapshotModule.selectNavigationOperationSnapshot(incomingNavigationSnapshot,stored);
    setNavigationSnapshot(current=>navigationOperationSnapshotModule.selectNavigationOperationSnapshot(selected,current));
    if(incomingNavigationSnapshot){
      try{window.localStorage.setItem(NAVIGATION_SNAPSHOT_KEY,JSON.stringify(incomingNavigationSnapshot));}catch{}
    }
  },[incomingNavigationSnapshot]);
  useEffect(()=>{
    const next=hubRoutesModule.normalizeHubState(initialState);
    window.__HARIN_CLIENT_HEALTH__?.finishRoute?.(hubRoutesModule.buildHubHref(next));
    setView(next.view);setWorkspace(next.workspace);setPlatform(next.platform);setSelectedProduct(next.product);setPeriod(next.period);setPendingView(null);setPendingWorkspace(null);
    setOpenNavGroup(hubRoutesModule.groupForView(next.view));
  },[initialState.view,initialState.workspace,initialState.platform,initialState.product,initialState.period]);
  useEffect(()=>{
    const syncFromAddress=()=>{
      const next=hubRoutesModule.parseHubHref(window.location.href);
      setView(next.view);setWorkspace(next.workspace);setPlatform(next.platform);setSelectedProduct(next.product);setPeriod(next.period);
      setOpenNavGroup(hubRoutesModule.groupForView(next.view));
    };
    window.addEventListener('popstate',syncFromAddress);
    return ()=>window.removeEventListener('popstate',syncFromAddress);
  },[]);
  if (initialData.error) return <main className="errorPage"><div><b>데이터를 불러오지 못했어요</b><p>{initialData.error}</p></div></main>;

  const { kpis, products, syncs, reports, actions } = initialData;

  async function runSync() {
    setSyncing(true); setSyncMessage('Cafe24 데이터를 가져오는 중이에요…');
    try {
      const response = await fetch('/api/cafe24/fetch-all', { method:'POST' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '동기화 실패');
      setSyncMessage(`완료 · 상품 ${result.counts.products} · 주문 ${result.counts.orders} · 트래픽 ${result.counts.traffic}`);
      return result;
    } catch (error) { setSyncMessage(`확인 필요 · ${error.message}`); return {ok:false,error:error.message}; }
    finally { setSyncing(false); }
  }

  const navigationSnapshotKnown=Boolean(navigationSnapshot);
  const navigationSnapshotStale=navigationSnapshotKnown&&navigationOperationSnapshotModule.navigationOperationSnapshotFreshness(navigationSnapshot).stale;
  const operationBadges=navigationSnapshot?.badges||{};
  const nav = hubRoutesModule.HUB_NAV.map(item=>({...item,badge:navigationSnapshotKnown?num(operationBadges[item.id]):null}));
  const navGroups=hubRoutesModule.HUB_NAV_GROUPS.map(group=>{const items=group.items.map(id=>nav.find(item=>item.id===id)).filter(Boolean);return {...group,items,actionCount:items.reduce((sum,item)=>sum+num(item.badge),0)};});
  const navContext=hubRoutesModule.navigationContext(view,platform);
  const latestRefreshAt=syncs.find(item=>item.finished_at||item.started_at)?.finished_at||syncs.find(item=>item.finished_at||item.started_at)?.started_at||null;
  const connectionLabel=navigationSnapshot?.connection?.label?`${navigationSnapshot.connection.label}${navigationSnapshotStale?' · 최근 확인':''}`:'연결 상태 확인';
  const connectionTone=navigationSnapshot?.connection?.tone||'check';
  const selectedHealth=platform==='all'?null:initialData.dataHealth?.channels?.find(item=>item.platform===platform.toUpperCase());
  const channelUnavailable=Boolean(selectedHealth?.failedDatasets?.length);
  const viewIsLoading=Boolean(pendingView||pendingWorkspace||routePending||(initialData.loadedView&&view!==initialData.loadedView)||(initialData.loadedWorkspace!==undefined&&workspace!==initialData.loadedWorkspace));
  const canvasProfile=adaptiveCanvasModule.resolveCanvasProfile({view:pendingView||view,workspace:pendingWorkspace||workspace});
  function navigate(next={},replace=false){
    const state=hubRoutesModule.normalizeHubState({view,workspace,platform,product:selectedProduct,period,...next});
    if(state.view!==view)setPendingView(state.view);
    else {setWorkspace(state.workspace);setPlatform(state.platform);setSelectedProduct(state.product);setPeriod(state.period);}
    setOpenNavGroup(hubRoutesModule.groupForView(state.view));
    const href=hubRoutesModule.buildHubHref(state);
    const current=`${window.location.pathname}${window.location.search}`;
    window.__HARIN_CLIENT_HEALTH__?.startRoute?.(href);
    startRouteTransition(()=>router[replace||current===href?'replace':'push'](href,{scroll:false}));
  }
  const openView=id=>navigate(hubRoutesModule.primaryNavigationState(id));
  const selectPlatform=id=>navigate({platform:id,product:id==='coupang'?selectedProduct:'ALL'},true);
  const prefetchView=id=>{
    if(prefetchedViews.current.has(id))return;
    prefetchedViews.current.add(id);
    router.prefetch(hubRoutesModule.buildHubHref(hubRoutesModule.primaryNavigationState(id)));
  };

  return <div className="shell">
    <HarinTopbar context={navContext} connectionLabel={connectionLabel} connectionTone={connectionTone} fontScale={fontScale} onFontScale={setFontScale} syncing={syncing} onSync={runSync}/>
    <HarinSidebar groups={navGroups} countsKnown={navigationSnapshotKnown} countsStale={navigationSnapshotStale} view={pendingView||view} openGroup={openNavGroup} query={navQuery} collapsed={sidebarCollapsed} onQuery={setNavQuery} onOpenGroup={setOpenNavGroup} onCollapsed={setSidebarCollapsed} onOpenView={openView} onPrefetch={prefetchView}/>
    <main className={`hubMain${viewIsLoading?' routePending':''}`} data-view={view} aria-busy={viewIsLoading?'true':'false'} data-canvas-profile={canvasProfile} data-loader-profile={initialData.loaderPerformance?.profile||undefined} data-loader-ms={initialData.loaderPerformance?.duration_ms??undefined} data-loader-target={initialData.loaderPerformance?.target_ms??undefined} data-loader-within-target={initialData.loaderPerformance?.within_target===undefined?undefined:String(initialData.loaderPerformance.within_target)} data-loader-remote-queries={initialData.loaderPerformance?.remote_query_count??undefined} data-loader-slowest={(initialData.loaderPerformance?.slow_queries||[]).map(item=>`${item.table}:${item.duration_ms}`).join(',')||undefined}>
      {viewIsLoading?<HarinRouteProgress label={nav.find(item=>item.id===(pendingView||view))?.label}/>:null}
      <HarinBreadcrumbBar context={navContext}/>
      {view==='keyword'?<KeywordOwnerShell platform={platform} workspace={workspace} data={initialData}/>:null}
      {channelScopedViews.has(view)&&view!=='keyword'&&(view!=='product'||workspace==='catalog')&&<section className="platformSwitch" aria-label="플랫폼 선택">
        {[['all','allDot','전체'],['naver','naverDot','네이버'],['coupang','coupangDot','쿠팡'],['cafe24','cafeDot','Cafe24']].map(([id,dot,label])=><button key={id} className={platform===id?'selected':''} onClick={()=>selectPlatform(id)}><i className={dot}/>{label}</button>)}
        <span className="periodFilter">최근 7일 기준</span>
      </section>}
      {view!=='keyword'?<HarinFocusedWorkspaceNav view={view} workspace={workspace} pendingWorkspace={pendingWorkspace} platform={platform} period={period} product={selectedProduct} onNavigate={nextWorkspace=>{setPendingWorkspace(nextWorkspace);window.__HARIN_CLIENT_HEALTH__?.startRoute?.(hubRoutesModule.buildHubHref({view,workspace:nextWorkspace,platform,period,product:selectedProduct}));}}/>:null}
      <DataStatusPanel data={initialData} platform={platform} refreshedAt={latestRefreshAt} generatedAt={initialData.generatedAt} onOpenCollection={()=>openView('collection')}/>
      {!embeddedHelpViews.has(view)&&!(view==='product'&&workspace==='catalog'&&platform==='all')&&!(view==='insight'&&workspace==='channels'&&platform==='coupang')&&<HelpBox key={`${view}:${workspace}:${platform}`} help={getHubHelp(view)} persistKey={`${view}:${workspace}:${platform}`}/>}
      {financialContextViews.has(view)&&<FinancialTrustBanner trust={initialData.financialTrust} onOpenProduct={()=>navigate({platform:'all',view:'product',workspace:'costs',product:'ALL'})}/>}
      {syncMessage && <div className="syncToast">{syncMessage}</div>}

      {channelUnavailable&&['insight','keyword','product'].includes(view)&&<ChannelUnavailable health={selectedHealth} onOpenCollection={()=>openView('collection')}/>}
      {view==='main' && platform==='all' && !channelUnavailable && <Phase14MainCommandCenter center={initialData.salesCommandCenter} onOpen={item=>{const target=String(item.platform||'ALL').toLowerCase();navigate({platform:['naver','coupang','cafe24'].includes(target)?target:'all',view:item.view||'main',product:'ALL',period:'DAY'});}} onOpenTargets={()=>{const detail=document.getElementById('monthly-target-details');if(detail){detail.open=true;detail.scrollIntoView({behavior:'smooth',block:'start'});}}}/>}
      {view==='main' && platform==='all' && !channelUnavailable && <div className="mainAiSlot"><HarinAiPagePanel panel={initialData.aiPagePanels?.main}/></div>}
      {view==='main' && platform==='all' && !channelUnavailable && <details className="commandEvidence" id="monthly-target-details"><summary><span><b>목표 설정·계산 근거 보기</b><small>월 목표를 바꾸거나 숫자의 출처를 확인할 때만 열어보세요.</small></span><em>열기</em></summary><div><BusinessPacingPanel platform={platform} pacing={initialData.pacing}/><MetricProvenanceStrip snapshots={initialData.metricSnapshots||[]}/></div></details>}
      {view==='collection' && workspace==='naver-api' && <NaverApiConnectionCenter center={initialData.naverApiCenter}/>}
      {view==='collection' && workspace==='advertising' && <AdvertisingChannelCenter center={initialData.advertisingChannelCenter}/>}
      {view==='collection' && workspace==='provider-fallback' && <ProviderFallbackCenter center={initialData.providerFallbackCenter}/>}
      {view==='collection' && workspace==='optional-providers' && <OptionalProviderCenter center={initialData.optionalProviderCenter}/>}
      {view==='collection' && workspace==='provider-runtime' && <ProviderOperationsCenter center={initialData.providerOperationsCenter}/>}
      {view==='collection' && workspace==='execution-paths' && <ExecutionPathCenter center={initialData.executionPathCenter}/>}
      {view==='collection' && workspace==='owned-site' && <OwnedSiteConnectionCenter center={initialData.ownedSiteCenter}/>}
      {view==='collection' && workspace==='shipping-reference' && <ShippingReferenceCenter center={initialData.shippingReferenceCenter}/>}
      {view==='collection' && workspace==='operations-health' && <OperationsHealthCenter center={initialData.operationsHealthCenter}/>}
      {view==='collection' && workspace==='overview' && <CollectionView syncs={syncs} products={products} kpis={kpis} runSync={runSync} syncing={syncing} naver={initialData.naver} coupang={initialData.coupang} automationRuns={initialData.automationRuns} qualityChecks={initialData.qualityChecks} alerts={initialData.alerts} dataHealth={initialData.dataHealth} channelConnections={initialData.channelConnections} collectionCenter={initialData.collectionCenter} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.collection}/>} />}
      {/* Compatibility intent: view==='insight' && workspace==='channels' still owns the channel-detail workspace below. */}
      {view==='insight' && !channelUnavailable && <HarinAnalysisWorkbench view="insight" workspace={workspace} platform={platform} data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.insight}>{(platform==='all'||platform==='naver')?<HarinAiFoundation foundation={initialData.aiFoundation}/>:null}</HarinAiPagePanel>}>
        {workspace==='overview'?<DecisionOverview key={`decision-${platform}`} platform={platform} reports={reports} platformEvents={initialData.platformEvents||[]}/>:null}
        {workspace==='causes'?<>{(platform==='all'||platform==='naver')?<><NaverExecutiveBoard board={initialData.naver?.executiveBoard}/><MarketingInsightSummary diagnosis={initialData.naver?.marketingDiagnosis}/></>:null}<InsightView key={`insight-${platform}`} platform={platform} reports={reports} actions={actions} liveNaver={initialData.naver} platformEvents={initialData.platformEvents||[]}/></>:null}
        {workspace==='channels'?<><InsightView key={`channel-insight-${platform}`} platform={platform} reports={reports} actions={actions} liveNaver={initialData.naver} platformEvents={initialData.platformEvents||[]}/>{platform==='coupang'?<CoupangSalesCenter coupang={initialData.coupang} selectedProduct={selectedProduct} selectedPeriod={period} onSelectProduct={product=>navigate({product},true)} onSelectPeriod={nextPeriod=>navigate({period:nextPeriod},true)}/>:null}{['naver','cafe24'].includes(platform)?<details className="channelLegacyDetails"><summary><span><b>{platformLabel[platform]} 채널 운영 상세</b><small>필요할 때만 기존 채널 상세를 펼쳐보세요.</small></span><em>열기</em></summary><div><MainView platform={platform} data={initialData}/></div></details>:null}</>:null}
      </HarinAnalysisWorkbench>}
      {view==='orders' && (<UnifiedOrdersCenter center={initialData.unifiedOrders} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.orders}/>}><CoupangOrdersView coupang={initialData.coupang}/></UnifiedOrdersCenter>)}
      {view==='cs' && (<UnifiedCustomerServiceCenter center={initialData.customerService} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.cs}/>}/>)}
      {view==='inventory' && (<UnifiedInventoryOperationsCenter coupang={initialData.coupang} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.inventory}/>}/>)}
      {view==='settlement' && (<UnifiedSettlementOperationsCenter center={initialData.unifiedSettlement} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.settlement}/>}><CoupangSettlementView coupang={initialData.coupang}/></UnifiedSettlementOperationsCenter>)}
      {view==='keyword' && !channelUnavailable && <HarinAnalysisWorkbench view="keyword" workspace={workspace} platform={platform} data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.keyword}/>}>
        {workspace==='diagnosis'&&(platform==='all'||platform==='naver')?<MarketingDiagnosisCenter diagnosis={initialData.naver?.marketingDiagnosis}/>:null}{!['history','performance'].includes(workspace)?<HarinKeywordDetailWorkbench key={`keyword-${platform}-${workspace}`} platform={platform} workspace={workspace} data={initialData}/>:null}
      </HarinAnalysisWorkbench>}
      {view==='product' && !channelUnavailable && <HarinAnalysisWorkbench view="product" workspace={workspace} platform={platform} data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.product}/>}>
        <PlatformProductView key={`product-${platform}-${workspace}`} platform={platform} workspace={workspace} data={initialData}/>
      </HarinAnalysisWorkbench>}
      {view==='knowledge' && <AiKnowledgeCenter />}
      {view==='reports' && <HarinExecutionWorkbench view="reports" data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.reports}/>}><HarinReportsCenter reports={reports} learningHistory={initialData.reportLearningHistory}/></HarinExecutionWorkbench>}
      {view==='changes' && <HarinExecutionWorkbench view="changes" data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.changes}/>}><HarinFinancialChangeCenter bidWorkbench={initialData.naverBidWorkbench} actionPanel={<ActionPanel actions={actions} financialTrustToken={initialData.financialTrustToken}/>}/></HarinExecutionWorkbench>}
      {view==='validation' && <HarinExecutionWorkbench view="validation" data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.validation}/>}><CustomerRetentionValidationCenter data={initialData.retentionValidation}/></HarinExecutionWorkbench>}
      {view==='experiments' && <HarinExecutionWorkbench view="experiments" data={initialData} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.experiments}/>}><HarinExperimentLab /></HarinExecutionWorkbench>}
      {view==='notifications' && <HarinNotificationCenter reports={reports} center={initialData.collectionCenter} aiPanel={<HarinAiPagePanel panel={initialData.aiPagePanels?.notifications}/>} />}
    </main>
    <HarinOwnerWorkspace pageKey={view} pageLabel={navContext.item.label}/>
    <HarinLiveStatusDock center={initialData.collectionCenter} alerts={initialData.alerts} generatedAt={initialData.generatedAt}/>
    <HarinMobileNavigation nav={nav} groups={navGroups} countsKnown={navigationSnapshotKnown} countsStale={navigationSnapshotStale} view={view} onOpenView={openView} onPrefetch={prefetchView} fontScale={fontScale} onFontScale={setFontScale}/>
    <footer className="hubFooter" data-canvas-profile={canvasProfile}>하린식품 광고·매출 통합 관리 허브 <span>·</span> 네이버 + 쿠팡 + Cafe24 + Supabase</footer>
  </div>;
}

const executionWorkflowSteps=[
  {id:'reports',href:'/diagnoses',number:'01',label:'진단',description:'근거와 문제 확인'},
  {id:'changes',href:'/approvals',number:'02',label:'변경 기록',description:'실행·검증·복구 이력'},
  {id:'validation',href:'/execution-validation',number:'03',label:'7·14일 검증',description:'매출·이익 결과 비교'},
  {id:'experiments',href:'/ab-tests',number:'04',label:'A/B 학습',description:'검증된 기준 축적'}
];

function ExecutionWorkflowNav({view,data={}}){
  const validation=data.retentionValidation?.execution?.summary||{};
  const learning=data.reportLearningHistory?.summary||{};
  const actionItems=Array.isArray(data.actions)?data.actions:[];
  const counts={
    reports:num(learning.learned??data.reports?.length),
    changes:actionItems.filter(item=>['PLANNED','ON_HOLD'].includes(item.status)).length,
    validation:num(validation.day7_ready)+num(validation.day14_ready),
    experiments:num(validation.linked_experiments)
  };
  return <section className="executionWorkflow" aria-label="진단부터 학습까지 운영 흐름">
    <header><div><span>결정 → 검증 → 학습</span><h1>한 번의 진단을 끝까지 이어서 확인해요</h1><p>페이지를 합치지 않고, 지금 할 단계와 다음 단계를 한 줄로 연결했습니다.</p></div><aside><b>{executionWorkflowSteps.findIndex(step=>step.id===view)+1}/4</b><small>현재 단계</small></aside></header>
    <nav>{executionWorkflowSteps.map((step,index)=><div className="executionWorkflowStep" key={step.id}><Link href={step.href} className={view===step.id?'active':''} aria-current={view===step.id?'step':undefined}><i>{step.number}</i><span><b>{step.label}</b><small>{step.description}</small></span><em>{counts[step.id]}건</em></Link>{index<executionWorkflowSteps.length-1?<strong aria-hidden="true">→</strong>:null}</div>)}</nav>
  </section>;
}

function SalesCommandCenter({ center={}, onOpen, onOpenTargets }) {
  const metrics=center.metrics||{}, likelihood=center.likelihood||{}, actions=center.actions||[], products=center.products||{}, cashflow=center.cashflow||{};
  const statusLabel={READY:'실행 가능',BLOCKED:'선행 작업 필요',ON_HOLD:'보류',COMPLETED:'완료'};
  const sourceLabel={TRUST_GATE:'재무 신뢰',ALERT:'운영 알림',DATA_QUALITY:'데이터 품질',ACTION:'실행결정',PACING:'월 목표'};
  const actionButton=item=>item.view==='product'?'상품 확인':item.view==='collection'?'수집 확인':item.view==='notifications'?'알림 처리':item.view==='reports'?'결정 확인':'상세 보기';
  return <section className={`salesCommandCenter ${String(likelihood.code||'TARGET_REQUIRED').toLowerCase()}`}>
    <header className="commandHero"><div><span className="eyebrow">SALES COMMAND CENTER · {center.asOf||'기준일 확인 중'}</span><h1>오늘의 매출 판단을<br/><em>한 화면에서 끝내세요.</em></h1><p>{metrics.target?metrics.forecastShortage>0?`현재 속도대로면 월말에 ${won(metrics.forecastShortage)}이 부족해요. 오늘 ${won(metrics.requiredDailyRevenue)}을 채우는 일부터 확인하세요.`:`현재 속도를 유지하면 이번 달 목표권이에요. 아래 위험 항목만 먼저 처리하세요.`:'이번 달 목표를 입력하면 부족 금액과 하루 필요 매출을 바로 계산해드려요.'}</p></div><aside className={String(likelihood.code||'TARGET_REQUIRED').toLowerCase()}><span>목표 달성 가능성</span><strong>{likelihood.label||'계산 대기'}</strong><small>{likelihood.description}</small><button type="button" onClick={onOpenTargets}>목표·근거 확인</button></aside></header>
    <div className="commandMetricGrid">
      <article><small>이번 달 목표 매출</small><strong>{metrics.target?won(metrics.target):'입력 필요'}</strong><span>{center.month||'이번 달'} 기준</span></article>
      <article><small>현재 매출</small><strong>{metrics.current==null?'확인 필요':won(metrics.current)}</strong><span>{metrics.progressRate==null?'목표 또는 매출 자료 확인 필요':`목표의 ${metrics.progressRate.toFixed(1)}%`}</span></article>
      <article><small>월말 예상 매출</small><strong>{metrics.forecast==null?'확인 필요':won(metrics.forecast)}</strong><span>현재 일평균 속도 기준</span></article>
      <article className={metrics.shortage>0?'warning':''}><small>현재 목표까지 부족</small><strong>{metrics.shortage==null?'확인 필요':won(metrics.shortage)}</strong><span>현재 매출과 목표의 차이</span></article>
      <article className={metrics.requiredDailyRevenue>0?'focus':''}><small>남은 기간 하루 필요 매출</small><strong>{metrics.requiredDailyRevenue==null?'확인 필요':won(metrics.requiredDailyRevenue)}</strong><span>오늘 행동의 기준 숫자</span></article>
      <article className={`likelihood ${String(likelihood.code||'TARGET_REQUIRED').toLowerCase()}`}><small>목표 달성 가능성</small><strong>{likelihood.label||'계산 대기'}</strong><span>{likelihood.description}</span></article>
    </div>
    <section className="commandActionSection"><header><div><span className="eyebrow">TODAY ACTION · TOP 3</span><h2>오늘 해야 할 매출 행동 3개</h2></div><small>서버가 긴급도·매출 영향·데이터 신뢰도를 함께 보고 정렬했어요.</small></header><div className="commandActions">{actions.map((item,index)=><article className={String(item.decision_status||'READY').toLowerCase()} key={item.id}><b className="commandRank">{index+1}</b><div><span>{sourceLabel[item.source]||item.source} · {item.platform}</span><strong>{item.title}</strong><p>{item.reason}</p><small>{item.next_step}</small></div><aside><em>{statusLabel[item.decision_status]||item.decision_status}</em><button type="button" onClick={()=>onOpen(item)}>{actionButton(item)}</button></aside></article>)}{!actions.length&&<Empty>지금 바로 처리할 위험 행동이 없습니다. 채널 상태와 성장 상품을 확인하세요.</Empty>}</div></section>
    <div className="commandDecisionGrid">
      <article className="commandCard channelCommand"><header><span className="eyebrow">CHANNEL HEALTH</span><h2>채널별 상태</h2></header><div>{(center.channels||[]).map(item=><section className={String(item.status||'WAITING').toLowerCase()} key={item.platform}><i/><span><b>{{NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'}[item.platform]}</b><small>{item.summary||'수집 기록을 확인하세요.'}</small></span><em>{item.label}</em><button type="button" onClick={()=>onOpen({view:'insight',platform:item.platform})} aria-label={`${{NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'}[item.platform]} 인사이트 열기`}>성과 보기</button></section>)}</div><button type="button" onClick={()=>onOpen({view:'collection',platform:'ALL'})}>데이터수집 확인</button></article>
      <article className="commandCard productCommand"><header><span className="eyebrow">PRODUCT SIGNAL</span><h2>성장·위험 상품</h2></header><div className="productSignalColumns"><section><b>성장 상품</b>{(products.growth||[]).map(item=><div key={item.key}><span><strong>{item.name}</strong><small>{item.platform} · 최근 7일 {won(item.currentRevenue)}</small></span><em>+{item.growthRate==null?'신규':`${item.growthRate.toFixed(1)}%`}</em></div>)}{!products.growth?.length&&<small>비교 가능한 성장 상품이 아직 없어요.</small>}</section><section><b>위험 상품</b>{(products.risk||[]).map(item=><div key={item.key}><span><strong>{item.name}</strong><small>{item.riskReason}</small></span><em>확인</em></div>)}{!products.risk?.length&&<small>현재 감지된 급감·재고 위험이 없어요.</small>}</section></div><button type="button" onClick={()=>onOpen({view:'product',platform:'ALL'})}>상품 자세히 보기</button></article>
      <article className={`commandCard cashflowCommand ${String(cashflow.status||'CHECK_REQUIRED').toLowerCase()}`}><header><span className="eyebrow">30-DAY CASH OUTLOOK</span><h2>30일 현금흐름 예상</h2></header><div><section><small>예상 매출 유입</small><strong>{cashflow.expectedInflow==null?'확인 필요':won(cashflow.expectedInflow)}</strong></section><section><small>예상 광고비 지출</small><strong>{cashflow.expectedAdOutflow==null?'확인 필요':`- ${won(cashflow.expectedAdOutflow)}`}</strong></section><section className="cashBalance"><small>비용 반영 후 남을 금액</small><strong>{cashflow.expectedBalance==null?'확인 필요':won(cashflow.expectedBalance)}</strong></section></div><p>{cashflow.description}</p><small>실제 통장 잔액이나 정산일이 아닌, 현재 판매 속도를 30일로 늘린 운영 예상치입니다.</small></article>
    </div>
  </section>;
}

function TodayPriorityCenter({ center={}, platform='all', onOpen }) {
  const statusLabel={READY:'실행 가능',BLOCKED:'선행 작업 필요',ON_HOLD:'보류',COMPLETED:'완료'};
  const sourceLabel={TRUST_GATE:'재무 신뢰',ALERT:'운영 알림',DATA_QUALITY:'데이터 품질',ACTION:'실행결정',PACING:'월 목표'};
  const target=platformReportName[platform];
  const scoped=(center.items||[]).filter(item=>platform==='all'||item.platform===target||item.platform==='ALL').slice(0,6);
  return <section className={`priorityCenter ${String(center.status||'READY').toLowerCase()}`}><header><div><span className="eyebrow">TODAY PRIORITY · SERVER RANKED</span><h2>오늘의 운영 우선순위</h2><small>액션·오류·데이터 품질·월 목표를 같은 신뢰 기준으로 정렬합니다.</small></div><div className="prioritySummary"><span><b>{center.summary?.blocked||0}</b>차단</span><span><b>{center.summary?.ready||0}</b>처리 가능</span></div></header><div className="priorityList">{scoped.map(item=><article className={String(item.decision_status||'READY').toLowerCase()} key={item.id}><b className="priorityRank">{item.rank}</b><section><span>{sourceLabel[item.source]||item.source} · {item.platform}</span><strong>{item.title}</strong><p>{item.reason}</p><small>{item.next_step}</small></section><aside><em>{statusLabel[item.decision_status]||item.decision_status}</em><button type="button" onClick={()=>onOpen(item)}>{item.view==='product'?'원가·매핑 열기':item.view==='collection'?'수집·검증 열기':item.view==='notifications'?'알림 처리하기':item.view==='reports'?'실행결정 열기':'상세 확인'}</button></aside></article>)}{!scoped.length&&<Empty>현재 선택한 플랫폼에 즉시 처리할 우선순위가 없습니다.</Empty>}</div></section>;
}

function MainView({ platform, platformName, data, maxPv, maxRef, selectedProduct, selectedPeriod, onSelectProduct, onSelectPeriod }) {
  const { kpis, traffic, referrers, topProducts, recentOrders, syncs, actions } = data;
  if (platform === 'coupang') return <CoupangSalesCenter coupang={data.coupang} selectedProduct={selectedProduct} selectedPeriod={selectedPeriod} onSelectProduct={onSelectProduct} onSelectPeriod={onSelectPeriod} />;
  if (platform === 'naver') return <NaverSummary actions={actions} naver={data.naver} financialTrust={data.financialTrust} financialTrustToken={data.financialTrustToken} />;
  if (platform === 'cafe24') return <Cafe24CommandCenter analytics={data.cafe24Analytics} syncs={syncs} />;
  return <details className="legacyMainDetails"><summary><span><b>기존 상세 통계 보기</b><small>방문자·페이지뷰·주문 내역이 필요할 때만 열어보세요.</small></span><em>열기</em></summary><div><ExecutiveSummary reports={data.reports} actions={actions} priorityCenter={data.priorityCenter}/><AnomalyBanner alerts={data.alerts||[]} platform={platform}/><section className="kpiGrid"><Kpi tone="orange" icon="₩" label="Cafe24 결제 매출" value={won(kpis.sales)} sub={`${count(kpis.orders)}건 주문`}/><Kpi tone="blue" icon="#" label="주문수" value={`${count(kpis.orders)}건`} sub={`객단가 ${won(kpis.averageOrder)}`}/><Kpi tone="green" icon="V" label="방문자" value={`${count(kpis.visitors)}명`} sub={`전환율 ${kpis.conversion.toFixed(1)}%`}/><Kpi tone="purple" icon="P" label="페이지뷰" value={`${count(kpis.pageviews)}회`} sub={`판매 상품 ${count(kpis.products)}개`}/></section><CafePanels traffic={traffic} referrers={referrers} topProducts={topProducts} recentOrders={recentOrders} maxPv={maxPv} maxRef={maxRef}/></div></details>;
}

function ExecutiveSummary({ reports, actions, priorityCenter={} }) {
  const report = reports.find(item => item.summary_json?.insights?.length);
  const summary = report?.summary_json || {};
  const executive = summary.executive || {};
  const good = executive.doing_well || (summary.insights || []).filter(item => item.level === 'good').slice(0, 3);
  const problems = executive.problems || (summary.insights || []).filter(item => ['warning', 'danger'].includes(item.level)).slice(0, 3);
  const opportunities = executive.opportunities || (summary.recommendations || []).slice(0, 3);
  const today = (priorityCenter.items||[]).slice(0,3);
  return <section className="executivePanel"><div className="executiveHead"><div><span className="eyebrow">EXECUTIVE SUMMARY</span><h2>오늘의 경영 요약</h2></div><small>{report ? `${report.period_start}~${report.period_end} 보고서 기준` : '보고서 생성 후 자동 표시'}</small></div><div className="executiveGrid"><ExecutiveColumn tone="good" title="잘되고 있는 것" items={good}/><ExecutiveColumn tone="problem" title="문제" items={problems}/><ExecutiveColumn tone="opportunity" title="성장기회" items={opportunities}/><ExecutiveColumn tone="action" title="오늘의 액션 TOP3" items={today.length ? today : actions.filter(item => item.status === 'PLANNED').slice(0, 3)}/></div></section>;
}

function ExecutiveColumn({ tone, title, items }) {
  return <article className={tone}><b>{title}</b>{items.length ? items.slice(0, 3).map((item, index) => <p key={index}><em>{index + 1}</em><span>{item.title || item.target_name || item.body || item.reason}</span></p>) : <small>새 보고서에서 자동 계산됩니다.</small>}</article>;
}

function AnomalyBanner({ alerts, platform }) {
  const target=platformReportName[platform];
  const items=alerts.filter(item=>item.source_type==='ANOMALY'&&(platform==='all'||item.platform===target));
  if(!items.length)return null;
  return <section className="anomalyBanner"><header><div><span className="eyebrow">ANOMALY ALERT</span><h2>확인이 필요한 이상징후</h2></div><em>{items.length}건 감지</em></header><div className="anomalyBannerGrid">{items.slice(0,4).map(item=><article className={item.severity.toLowerCase()} key={item.id}><span>{item.platform}</span><b>{item.title}</b><small>{item.message}</small></article>)}</div><p>일일 자동보고서와 수동 재생성 모두 같은 서버 규칙으로 다시 계산합니다.</p></section>;
}

function BusinessPacingPanel({ platform, pacing={} }) {
  const targetPlatform=platformReportName[platform];
  const initial=(pacing.items||[]).find(item=>item.platform===targetPlatform)||(pacing.items||[])[0]||{};
  const [item,setItem]=useState(initial);
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [form,setForm]=useState({revenueTarget:Math.round(num(initial.revenueTarget)),adBudget:Math.round(num(initial.adBudget)),targetRoas:Math.round(num(initial.targetRoas||250)),notes:''});
  useEffect(()=>{const next=(pacing.items||[]).find(row=>row.platform===targetPlatform)||(pacing.items||[])[0]||{};setItem(next);setForm({revenueTarget:Math.round(num(next.revenueTarget)),adBudget:Math.round(num(next.adBudget)),targetRoas:Math.round(num(next.targetRoas||250)),notes:''});},[targetPlatform,pacing]);
  async function save(event){event.preventDefault();if(!window.confirm(`${platformLabel[platform]} 월 목표와 광고예산을 지금 변경할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.`))return;setSaving(true);setMessage('변경 전후 확인 후 바로 적용하는 중…');try{const response=await fetch('/api/targets',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({month:pacing.month,platform:targetPlatform,...form})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);setMessage('변경 완료 · 실제 저장값 재확인까지 끝났습니다.');setEditing(false);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving(false);}}
  const statusLabel={ON_TRACK:'목표 속도 정상',WATCH:'속도 점검',AT_RISK:'월말 목표 위험',TARGET_REQUIRED:'목표 입력 필요'}[item.status]||'계산 대기';
  const revenueProgress=item.revenueProgressRate==null?0:Math.min(100,num(item.revenueProgressRate));
  const budgetProgress=item.budgetUsageRate==null?0:Math.min(100,num(item.budgetUsageRate));
  const comparisons=platform==='all'?(pacing.items||[]).filter(row=>row.platform!=='ALL'):[];
  return <section className={`pacingPanel ${String(item.status||'TARGET_REQUIRED').toLowerCase()}`}>
    <header><div><span className="eyebrow">MONTHLY TARGET · SERVER FORECAST</span><h2>{platformLabel[platform]} 월 목표·예산 페이싱</h2><small>{pacing.month} · {item.elapsedDays||0}/{item.daysInMonth||0}일 경과 · {pacing.asOf} 기준</small></div><div className="pacingStatus"><em>{statusLabel}</em><button onClick={()=>setEditing(value=>!value)}>{editing?'입력 닫기':'목표·예산 설정'}</button></div></header>
    <div className="pacingMetricGrid"><article><small>현재 매출</small><strong>{won(item.revenueActual)}</strong><span>월말 예상 {won(item.revenueForecast)}</span></article><article><small>월 매출목표</small><strong>{item.revenueTarget?won(item.revenueTarget):'입력 필요'}</strong><span>{item.revenueTarget?`달성률 ${num(item.revenueProgressRate).toFixed(1)}%`:'예측은 계속 계산됩니다.'}</span></article><article><small>현재 광고비</small><strong>{won(item.adSpendActual)}</strong><span>월말 예상 {won(item.adSpendForecast)}</span></article><article><small>월 광고예산</small><strong>{item.adBudget?won(item.adBudget):'입력 필요'}</strong><span>{item.adBudget?`잔여 ${won(item.budgetRemaining)}`:'플랫폼별로 따로 설정 가능'}</span></article><article><small>남은 날 하루 매출</small><strong>{item.revenueTarget?won(item.requiredDailyRevenue):'-'}</strong><span>목표 달성에 필요한 일매출</span></article><article><small>남은 날 권장 광고비</small><strong>{item.adBudget?won(item.recommendedDailySpend):'-'}</strong><span>예산 초과 방지 일할액</span></article></div>
    <div className="pacingBars"><div><span><b>매출 목표 진행</b><em>{item.revenueProgressRate==null?'목표 미설정':`${num(item.revenueProgressRate).toFixed(1)}%`}</em></span><i><u style={{width:`${revenueProgress}%`}}/></i><small>오늘까지 기대 진도 {num(item.expectedProgressRate).toFixed(1)}% · 속도지수 {item.revenuePacingRate==null?'-':`${num(item.revenuePacingRate).toFixed(0)}%`}</small></div><div><span><b>광고예산 소진</b><em>{item.budgetUsageRate==null?'예산 미설정':`${num(item.budgetUsageRate).toFixed(1)}%`}</em></span><i><u style={{width:`${budgetProgress}%`}}/></i><small>현재 ROAS {item.actualRoas==null?'-':`${num(item.actualRoas).toFixed(1)}%`} · 목표 {num(item.targetRoas||250).toFixed(0)}%</small></div></div>
    {comparisons.length>0&&<div className="platformPacingStrip">{comparisons.map(row=><article className={String(row.status).toLowerCase()} key={row.platform}><span>{row.platform}</span><b>{won(row.revenueActual)}</b><small>예상 {won(row.revenueForecast)} · 광고 {won(row.adSpendActual)}</small><em>{{ON_TRACK:'정상',WATCH:'점검',AT_RISK:'위험',TARGET_REQUIRED:'목표 필요'}[row.status]}</em></article>)}</div>}
    {editing&&<form className="pacingForm" onSubmit={save}><label><span>월 매출목표</span><input type="number" min="0" step="10000" value={form.revenueTarget} onChange={event=>setForm({...form,revenueTarget:event.target.value})}/></label><label><span>월 광고예산</span><input type="number" min="0" step="10000" value={form.adBudget} onChange={event=>setForm({...form,adBudget:event.target.value})}/></label><label><span>목표 ROAS %</span><input type="number" min="0" step="10" value={form.targetRoas} onChange={event=>setForm({...form,targetRoas:event.target.value})}/></label><label className="pacingNotes"><span>메모</span><input maxLength="500" placeholder="예: 추석 프로모션 반영" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label><button disabled={saving}>{saving?'적용 중…':'확인하고 바로 적용'}</button></form>}
    {message&&<p className="pacingMessage">{message}</p>}
  </section>;
}

function PlatformDecisionMetrics({ platform, summary }) {
  const profit=summary.profitability||{}, coverage=summary.data_coverage||{}, naver=summary.naver||{}, cafe=summary.cafe24||{}, coupang=summary.coupang||{};
  if(platform==='naver')return <section className="decisionMetrics"><Kpi tone="blue" icon="₩" label="네이버 광고비" value={won(naver.spend??naver.cost)} sub={`클릭 ${count(naver.clicks)}회`}/><Kpi tone="green" icon="P" label="Paid ROAS" value={`${num(naver.roas??profit.paid_roas).toFixed(1)}%`} sub="전환매출 ÷ 광고비"/><Kpi tone="orange" icon="C" label="CPC" value={won(naver.cpc??(num(naver.clicks)?num(naver.spend??naver.cost)/num(naver.clicks):0))} sub={`전환 ${num(naver.conversions).toFixed(1)}건`}/><Kpi tone="purple" icon="Q" label="데이터 신뢰도" value={coverage.naver_ads?.status||'확인 필요'} sub={coverage.naver_ads?`${coverage.naver_ads.actual_days}/${coverage.naver_ads.expected_days}일 수집`:'네이버 보고서 생성 필요'}/></section>;
  if(platform==='coupang')return <section className="decisionMetrics"><Kpi tone="orange" icon="₩" label="쿠팡 매출" value={won(coupang.revenue??coupang.gross_sales)} sub={`${count(coupang.orders)}건 주문`}/><Kpi tone="blue" icon="#" label="판매수량" value={`${count(coupang.units??coupang.quantity)}개`} sub="쿠팡 주문 기준"/><Kpi tone="green" icon="P" label="정산·이익" value={won(coupang.profit??coupang.settlement_amount)} sub="쿠팡 보고서 계산값"/><Kpi tone="purple" icon="Q" label="데이터 상태" value={coverage.coupang?.status||'확인 필요'} sub={coverage.coupang?.actual_days?`${coverage.coupang.actual_days}/${coverage.coupang.expected_days}일 수집`:'쿠팡 보고서 생성 필요'}/></section>;
  if(platform==='cafe24')return <section className="decisionMetrics"><Kpi tone="orange" icon="₩" label="Cafe24 매출" value={won(cafe.revenue)} sub={`${count(cafe.orders)}건 주문`}/><Kpi tone="blue" icon="#" label="주문수" value={`${count(cafe.orders)}건`} sub={`전환율 ${num(cafe.conversion_rate).toFixed(1)}%`}/><Kpi tone="green" icon="N" label="순매출" value={profit.net_sales==null?won(cafe.revenue):won(profit.net_sales)} sub={`환불 ${won(profit.refunds)} · 취소 ${won(profit.cancellations)}`}/><Kpi tone="purple" icon="V" label="방문자" value={`${count(cafe.visitors)}명`} sub="Cafe24 Analytics 기준"/></section>;
  return <section className="decisionMetrics"><Kpi tone="green" icon="P" label="Paid ROAS" value={profit.paid_roas==null?'새 보고서 필요':`${num(profit.paid_roas).toFixed(1)}%`} sub="네이버 귀속매출 ÷ 광고비"/><Kpi tone="purple" icon="M" label="MER" value={profit.mer==null?'새 보고서 필요':`${num(profit.mer).toFixed(1)}%`} sub="전체 순매출 ÷ 광고비"/><Kpi tone="orange" icon="N" label="통합 순매출" value={profit.net_sales==null?'새 보고서 필요':won(profit.net_sales)} sub={`환불 ${won(profit.refunds)} · 취소 ${won(profit.cancellations)}`}/><Kpi tone="blue" icon="Q" label="데이터 신뢰도" value={coverage.naver_ads?.status||'새 보고서 필요'} sub={coverage.naver_ads?`광고 ${coverage.naver_ads.actual_days}/${coverage.naver_ads.expected_days}일 수집`:'보고서에서 서버 계산'}/></section>;
}

function DecisionOverview({ reports, platformEvents, platform='all' }) {
  const scopedReports=reports.filter(item=>reportHasPlatform(item,platform));
  const summary = (scopedReports.find(item => item.summary_json?.profitability)||scopedReports[0])?.summary_json || {};
  const profit = summary.profitability || {}, coverage = summary.data_coverage || {}, categories = summary.naver?.campaign_categories || [];
  const scopedEvents=platform==='all'?platformEvents:platformEvents.filter(item=>item.platform===platformReportName[platform]||item.platform==='ALL');
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false), [message,setMessage]=useState('');
  const today=new Date().toISOString().slice(0,10);
  const [form,setForm]=useState({platform:'NAVER',event_type:'CAMPAIGN_CHANGE',effective_date:today,title:'',analysis_impact:''});
  async function save(event){event.preventDefault();setSaving(true);setMessage('저장 중…');try{const response=await fetch('/api/platform-events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'저장 실패');setMessage('저장 완료 · 다음 보고서부터 비교 경고에 반영됩니다.');setTimeout(()=>window.location.reload(),700);}catch(error){setMessage(`확인 필요 · ${error.message}`);setSaving(false);}}
  return <><section className="platformContext"><b>{platformLabel[platform]} 인사이트</b><span>{platform==='all'?'플랫폼을 합산한 경영 지표입니다.':'다른 플랫폼 수치를 섞지 않고 선택한 플랫폼 데이터만 표시합니다.'}</span></section><PlatformDecisionMetrics platform={platform} summary={summary}/><section className="twoCol decisionDetails"><article className="panel"><PanelTitle tag="PLATFORM CHANGE" title={`${platformLabel[platform]} 분석 기준 이벤트`} right={`${scopedEvents.length}건`}/><div className="eventList">{scopedEvents.slice(0,6).map(item=><div key={item.id}><time>{item.effective_date}</time><section><b>{item.title}</b><span>{item.analysis_impact||item.description}</span></section><em>{item.platform}</em></div>)}</div><button className="eventAdd" onClick={()=>setOpen(value=>!value)}>{open?'입력 닫기':'변경 이벤트 직접 등록'}</button>{open&&<form className="eventForm" onSubmit={save}><select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}><option>NAVER</option><option>CAFE24</option><option>COUPANG</option><option>ALL</option></select><select value={form.event_type} onChange={e=>setForm({...form,event_type:e.target.value})}><option value="CAMPAIGN_CHANGE">캠페인 변경</option><option value="BID_CHANGE">입찰 변경</option><option value="LANDING_CHANGE">상세/랜딩 변경</option><option value="PROMOTION">쿠폰/프로모션</option><option value="DATA_ISSUE">데이터 이슈</option><option value="OTHER">기타</option></select><input type="date" value={form.effective_date} onChange={e=>setForm({...form,effective_date:e.target.value})}/><input placeholder="변경 제목" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input className="wide" placeholder="분석에 미치는 영향" value={form.analysis_impact} onChange={e=>setForm({...form,analysis_impact:e.target.value})}/><button disabled={saving}>{saving?'저장 중…':'저장'}</button></form>}{message&&<small className="eventMessage">{message}</small>}</article><article className="panel"><PanelTitle tag={platform==='naver'?'NAVER TAXONOMY':'DATA SCOPE'} title={platform==='naver'?'캠페인 유형·표본 신뢰도':`${platformLabel[platform]} 분석 범위`} right={platform==='naver'?`${categories.length}개 유형`:`보고서 ${scopedReports.length}개`}/>{platform==='naver'?<div className="categoryList">{categories.length?categories.map(item=><div key={item.category}><section><b>{item.category}</b><small>{item.campaigns}개 · 클릭 {count(item.clicks)} · 전환 {num(item.conversions).toFixed(1)}</small></section><strong>{num(item.roas).toFixed(0)}%</strong><em className={item.confidence?.level?.toLowerCase()}>{item.confidence?.label}</em></div>):<Empty>네이버 보고서를 생성하면 캠페인 유형과 신뢰도가 표시됩니다.</Empty>}</div>:<div className="scopeSummary"><b>{platformLabel[platform]} 전용 데이터</b><p>선택한 플랫폼의 보고서, 진단, 변경 이벤트만 이 화면에 반영됩니다.</p><small>전체 관점의 수익성은 상단에서 ‘전체’를 선택하면 확인할 수 있습니다.</small></div>}</article></section></>;
}

function NaverSummary({ actions, naver, financialTrust, financialTrustToken }) {
  const {totals,daily,topCampaigns}=naver; const max=Math.max(...daily.map(item=>Math.max(item.cost,item.revenue)),1);
  return <><section className="hero naverHero"><div><span className="eyebrow">NAVER API · {naver.periodStart}~{naver.periodEnd}</span><h1>네이버 광고 성과를<br/><em>실데이터로 진단합니다.</em></h1><p>캠페인 {naver.campaigns}개 · 광고그룹 {naver.adgroups}개 · 키워드 {count(naver.keywords)}개 자동 연결</p></div><div className="heroStatus"><span>최근 7일 ROAS</span><strong>{totals.roas.toFixed(1)}%</strong><small>{naver.latestSync?.finished_at?`갱신 ${dateTime(naver.latestSync.finished_at)}`:'API 수집 데이터'}</small></div></section>
  <section className="kpiGrid"><Kpi tone="orange" icon="%" label="전환매출 ROAS" value={`${totals.roas.toFixed(1)}%`} sub="네이버 API 기준"/><Kpi tone="blue" icon="₩" label="광고비" value={won(totals.cost)} sub={`클릭 ${count(totals.clicks)}회`}/><Kpi tone="green" icon="₩" label="전환매출" value={won(totals.revenue)} sub={`전환 ${totals.conversions.toFixed(1)}건`}/><Kpi tone="purple" icon="C" label="CTR" value={`${totals.ctr.toFixed(2)}%`} sub={`노출 ${count(totals.impressions)}회`}/></section>
  <BidGuidePanel metrics={totals.metrics} financialTrust={financialTrust} financialTrustToken={financialTrustToken}/>
  <section className="twoCol"><article className="panel"><PanelTitle tag="DAILY PERFORMANCE" title="일별 광고비·전환매출" right="최근 7일"/><div className="naverDailyChart">{daily.map(item=><div className="naverDay" key={item.date}><div className="dualBars"><i className="costBar" style={{height:`${Math.max(4,item.cost/max*150)}px`}}/><i className="revenueBar" style={{height:`${Math.max(4,item.revenue/max*150)}px`}}/></div><span>{shortDate(item.date)}</span></div>)}</div><div className="legend"><span><i className="dot orangeDot"/>광고비</span><span><i className="dot greenDot"/>전환매출</span></div></article><article className="panel"><PanelTitle tag="CAMPAIGN" title="캠페인 성과 TOP" right="전환매출순"/><div className="campaignList">{topCampaigns.slice(0,6).map((item,index)=><div className="campaignRow" key={item.id}><b>{index+1}</b><div><strong>{item.name}</strong><small>CPC {won(item.metrics?.cpc)} · CVR {num(item.metrics?.cvrPercent).toFixed(1)}% · CPA {won(item.metrics?.cpa)}</small></div><em>{item.cost?`${item.roas.toFixed(0)}%`:'-'}</em></div>)}</div></article></section>
  <section className="twoCol"><article className="panel"><PanelTitle tag="LIVE DIAGNOSIS" title="자동 진단" right="API 기준"/><div className="findingList"><div className={totals.roas>=250?'finding good':'finding warn'}><b>ROAS {totals.roas>=250?'목표 달성':'개선 필요'}</b><span>최근 7일 전환매출 ROAS는 {totals.roas.toFixed(1)}%이며 관리 목표는 250%입니다.</span></div><div className="finding good"><b>실시간 데이터 연결</b><span>고정 보고서가 아닌 네이버 검색광고 API의 일간 성과로 계산했습니다.</span></div><div className="finding warn"><b>개별 캠페인 점검</b><span>전환매출이 없거나 ROAS가 낮은 캠페인은 실행결정으로 등록해 추적하세요.</span></div></div></article><ActionPanel actions={actions} financialTrustToken={financialTrustToken}/></section></>;
}

function bidActionLabel(action) {
  return { LOWER_BID:'입찰 감액 권장', RAISE_BID:'입찰 증액 권장', KEEP_BID:'현재 입찰 유지', HOLD_FOR_DATA:'표본 축적 후 판단', HOLD_FOR_FINANCIAL_DATA:'원가·광고비 연결 후 판단', CALCULATE_REQUIRED:'입력값 확인 필요' }[action]||'계산 대기';
}

function BidGuidePanel({ metrics={}, financialTrust={}, financialTrustToken='' }) {
  const [form,setForm]=useState({averageOrderValue:Math.round(num(metrics.averageOrderValue)),conversionRatePercent:num(metrics.cvrPercent).toFixed(2),targetRoasPercent:num(metrics.targetRoasPercent||250),currentCpc:Math.round(num(metrics.cpc))});
  const [guide,setGuide]=useState(null),[calculating,setCalculating]=useState(false),[message,setMessage]=useState('');
  const view=guide?{...metrics,...guide,bidAction:guide.action}:metrics;
  function change(event){setForm(current=>({...current,[event.target.name]:event.target.value}));}
  const financiallyReady=financialTrust.allowed?.allowed_cpc!==false;
  async function calculate(event){event.preventDefault();if(!financiallyReady){setMessage('원가 반영률 95%와 광고비 귀속을 먼저 완료해야 목표 CPC를 계산합니다.');return;}setCalculating(true);setMessage('서버에서 계산 중…');try{const response=await fetch('/api/naver/bid-guide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...form,financialTrustToken})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'계산 실패');setGuide(result.guide);setMessage('계산 완료 · 광고 설정은 자동 변경하지 않습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setCalculating(false);}}
  const adjustment=view.recommendedAdjustmentRate;
  return <article className="panel bidGuidePanel"><PanelTitle tag="SERVER BID GUIDE" title="성과 지표·목표 CPC·입찰 가이드" right={!financiallyReady?'재무 신뢰 대기':metrics.status==='READY'?'표본 충분':'관찰 필요'}/><section className="bidMetricGrid"><span><small>CPC</small><b>{won(metrics.cpc)}</b><em>광고비 ÷ 클릭</em></span><span><small>CVR</small><b>{num(metrics.cvrPercent).toFixed(2)}%</b><em>전환 ÷ 클릭</em></span><span><small>CPA</small><b>{metrics.conversions?won(metrics.cpa):'-'}</b><em>광고비 ÷ 전환</em></span><span><small>AOV</small><b>{metrics.conversions?won(metrics.averageOrderValue):'-'}</b><em>전환매출 ÷ 전환</em></span><span className="target"><small>목표 CPC</small><b>{financiallyReady&&view.targetCpc?won(view.targetCpc):'미산정'}</b><em>목표 ROAS {num(view.targetRoasPercent).toFixed(0)}%</em></span><span className={`recommend ${view.bidAction||''}`}><small>권장 입찰률</small><b>{!financiallyReady?'미산정':adjustment==null?'-':`${adjustment>0?'+':''}${num(adjustment).toFixed(1)}%`}</b><em>{financiallyReady?bidActionLabel(view.bidAction):'원가·광고비 연결 후 판단'}</em></span></section><form className="bidCalculator" onSubmit={calculate}><label><span>객단가</span><input name="averageOrderValue" type="number" min="1" value={form.averageOrderValue} onChange={change}/></label><label><span>CVR %</span><input name="conversionRatePercent" type="number" min="0.01" step="0.01" value={form.conversionRatePercent} onChange={change}/></label><label><span>목표 ROAS %</span><input name="targetRoasPercent" type="number" min="1" step="1" value={form.targetRoasPercent} onChange={change}/></label><label><span>현재 CPC</span><input name="currentCpc" type="number" min="1" value={form.currentCpc} onChange={change}/></label><button type="submit" disabled={calculating||!financiallyReady}>{!financiallyReady?'원가 입력 후 계산':calculating?'계산 중…':'수동 재계산'}</button></form>{message&&<small className="bidMessage">{message}</small>}<p className="bidSafety">서버 계산식: 목표 CPC = 객단가 × CVR ÷ 목표 ROAS 배수 · 자동 입찰 변경 없음 · 권장 범위 -30%~+20%</p></article>;
}

function ActionPanel({ actions, financialTrustToken='' }) {
  const [items, setItems] = useState(actions);
  const [updating, setUpdating] = useState('');
  const [editing, setEditing] = useState('');
  const [message, setMessage] = useState('');
  async function updateAction(id, patch) {
    setUpdating(id);
    setMessage('');
    try {
      const response = await fetch(`/api/actions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch.status==='EXECUTED'?{...patch,financialTrustToken}:patch) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '변경 실패');
      setItems(current => current.map(item => item.id === id ? { ...item, ...result.action } : item));
      setEditing('');
      setMessage('액션 정보가 저장되었습니다.');
    } catch (error) { setMessage(`확인 필요 · ${error.message}`); }
    finally { setUpdating(''); }
  }
  function holdAction(action) {
    const reason = window.prompt('보류 사유를 입력하세요.', action.hold_reason || '재고·예산·데이터 확인 후 재검토');
    if (reason === null) return;
    updateAction(action.id, { status: 'ON_HOLD', hold_reason: reason });
  }
  return <article className="panel actionPanel"><PanelTitle tag="ACTION" title="실행결정" right={`${items.length}건 저장`}/>{message&&<div className="actionMessage">{message}</div>}<div className="actionList interactive">{items.slice(0,7).map((a,i)=><div className={`actionItem ${String(a.decision_status||'').toLowerCase()}`} key={a.id}><b>{i+1}</b><div className="actionBody"><strong>{a.target_name}</strong><small>{a.reason}</small><ActionMeta action={a}/>{a.decision_status==='BLOCKED'&&<small className="actionBlockedReason">선행 작업 필요 · {(a.blocked_reasons||[])[0]}</small>}{a.hold_reason&&a.status==='ON_HOLD'&&<small className="holdReason">보류 사유 · {a.hold_reason}</small>}{a.evaluation&&<small className={`effect ${a.evaluation.outcome.toLowerCase()}`}>효과평가 · {a.evaluation.explanation}</small>}{editing===a.id&&<ActionEditor action={a} disabled={updating===a.id} onCancel={()=>setEditing('')} onSave={patch=>updateAction(a.id,patch)}/>}</div><div className="actionControls"><button className="manage" disabled={updating===a.id} onClick={()=>setEditing(editing===a.id?'':a.id)}>관리</button>{a.status==='PLANNED'?<><button title={a.can_execute===false?(a.blocked_reasons||[])[0]:''} disabled={updating===a.id||a.can_execute===false} onClick={()=>updateAction(a.id,{status:'EXECUTED'})}>{a.can_execute===false?'차단됨':'완료'}</button><button className="hold" disabled={updating===a.id} onClick={()=>holdAction(a)}>보류</button><button className="cancel" disabled={updating===a.id} onClick={()=>updateAction(a.id,{status:'CANCELLED'})}>취소</button></>:a.status==='ON_HOLD'?<><button disabled={updating===a.id} onClick={()=>updateAction(a.id,{status:'PLANNED'})}>재개</button><em className="on_hold">보류됨</em></>:<em className={a.status.toLowerCase()}>{a.status==='EXECUTED'?'실행완료':a.status==='CANCELLED'?'취소됨':a.status==='REVIEWED'?'효과평가 완료':a.status}</em>}</div></div>)}</div></article>;
}

function ActionMeta({ action }) {
  const today = new Date().toISOString().slice(0,10);
  const overdue = action.due_at && action.due_at < today && !['EXECUTED','CANCELLED','REVIEWED'].includes(action.status);
  const priorityLabels = { LOW:'낮음', MEDIUM:'보통', HIGH:'높음', URGENT:'긴급' };
  return <span className="actionMeta"><em className={`priority ${String(action.priority||'MEDIUM').toLowerCase()}`}>{priorityLabels[action.priority]||'보통'}</em><em>{action.assignee?`담당 ${action.assignee}`:'담당자 미정'}</em><em className={overdue?'overdue':''}>{action.due_at?`${overdue?'기한초과':'기한'} ${action.due_at}`:'기한 미정'}</em></span>;
}

function ActionEditor({ action, disabled, onCancel, onSave }) {
  const [priority,setPriority]=useState(action.priority||'MEDIUM');
  const [assignee,setAssignee]=useState(action.assignee||'');
  const [dueAt,setDueAt]=useState(action.due_at||'');
  return <div className="actionEditor"><label>우선순위<select value={priority} onChange={event=>setPriority(event.target.value)}><option value="LOW">낮음</option><option value="MEDIUM">보통</option><option value="HIGH">높음</option><option value="URGENT">긴급</option></select></label><label>담당자<input value={assignee} maxLength={100} placeholder="담당자 이름" onChange={event=>setAssignee(event.target.value)}/></label><label>실행 기한<input type="date" value={dueAt} onChange={event=>setDueAt(event.target.value)}/></label><div><button type="button" className="secondary" disabled={disabled} onClick={onCancel}>취소</button><button type="button" disabled={disabled} onClick={()=>onSave({priority,assignee,due_at:dueAt})}>{disabled?'저장 중…':'저장'}</button></div></div>;
}

function CafePanels({ traffic, referrers, topProducts, recentOrders, maxPv, maxRef }) { return <>
  <section className="twoCol"><article className="panel"><PanelTitle tag="TREND" title="방문·페이지뷰 추이" right={`최근 ${traffic.length}일`}/>{traffic.length?<div className="barChart">{traffic.map(item=><div className="barCol" key={item.date}><div className="barValue">{item.pageviews}</div><div className="bars"><i className="visitorsBar" style={{height:`${Math.max(8,item.visitors/maxPv*170)}px`}}/><i className="pvBar" style={{height:`${Math.max(12,item.pageviews/maxPv*170)}px`}}/></div><span>{shortDate(item.date)}</span></div>)}</div>:<Empty>트래픽 데이터가 없습니다.</Empty>}</article><article className="panel"><PanelTitle tag="SOURCE" title="유입경로 TOP" right="방문 기준"/><div className="sourceList">{referrers.slice(0,6).map((item,index)=><div className="sourceRow" key={`${item.source}-${index}`}><b>{index+1}</b><div><span>{item.source}</span><i><u style={{width:`${Math.max(4,Number(item.visitors||0)/maxRef*100)}%`}}/></i></div><strong>{count(item.visitors)}명</strong></div>)}</div></article></section>
  <section className="twoCol"><article className="panel"><PanelTitle tag="PRODUCT" title="판매상품 TOP" right="결제 추정액"/><div className="rankList">{topProducts.slice(0,6).map((item,index)=><div className="rankRow" key={item.name}><span className="rank">{index+1}</span><div><b>{item.name}</b><small>{item.orders}건 · {item.quantity}개 판매</small></div><strong>{won(item.sales)}</strong></div>)}</div></article><article className="panel"><PanelTitle tag="ORDER" title="최근 주문" right="최신순"/><div className="orderList">{recentOrders.map(order=><div className="orderRow" key={order.id}><div><b>{order.channel}</b><small>{order.id} · {dateLabel(order.date)}</small></div><strong>{won(order.amount)}</strong></div>)}</div></article></section></>;
}

function Cafe24CommandCenter({ analytics = {}, syncs = [] }) {
  const totals=analytics.totals||{},funnel=analytics.funnel||{},customers=analytics.customers||{},daily=analytics.daily||[],acquisition=analytics.acquisition||[],products=analytics.products||[],coverage=analytics.coverage||{};
  const maxRevenue=Math.max(...daily.map(item=>num(item.revenue)),1),maxVisitors=Math.max(...daily.map(item=>num(item.visitors)),1);
  const stageStatus={OK:'수집됨',REAL_ZERO:'실제 0',PARTIAL:'일부 수집',NOT_COLLECTED:'미수집'};
  const lastCafeSync=syncs.find(item=>item.platform==='CAFE24');
  return <>
    <section className="cafeCommandHero"><div><span className="eyebrow">CAFE24 COMMERCE ANALYTICS</span><h1>유입부터 재구매까지<br/><em>자사몰 성장 흐름</em></h1><p>방문·주문·상품·고객 데이터를 서버에서 계산합니다. 없는 원천은 0으로 만들지 않습니다.</p></div><aside><span>최근 Cafe24 수집</span><b>{lastCafeSync?.status==='SUCCESS'?'정상 수집':lastCafeSync?.status||'기록 확인'}</b><small>{lastCafeSync?.finished_at?dateTime(lastCafeSync.finished_at):'성공 기록 없음'}</small></aside></section>
    <section className="kpiGrid cafeKpis"><Kpi tone="orange" icon="₩" label="결제 매출" value={won(totals.revenue)} sub={`${count(totals.orders)}건 · 객단가 ${won(num(totals.orders)?num(totals.revenue)/num(totals.orders):0)}`}/><Kpi tone="green" icon="V" label="방문자" value={`${count(totals.visitors)}명`} sub={`방문→주문 ${funnel.visitorToOrderRate==null?'-':`${num(funnel.visitorToOrderRate).toFixed(1)}%`}`}/><Kpi tone="blue" icon="C" label="식별 고객" value={`${count(customers.identifiedCustomers)}명`} sub={`주문 식별률 ${customers.identifiedRate==null?'-':`${num(customers.identifiedRate).toFixed(1)}%`}`}/><Kpi tone="purple" icon="R" label="기존 고객" value={`${count(customers.returningCustomers)}명`} sub={customers.returningRate==null?'고객 원천 미수집':`식별 고객의 ${num(customers.returningRate).toFixed(1)}%`}/></section>
    <article className="panel cafeFunnelPanel"><PanelTitle tag="COMMERCE FUNNEL" title="방문→구매 전환 퍼널" right={`${analytics.period?.start||'-'} ~ ${analytics.period?.end||'-'}`}/><div className="cafeFunnel">{(funnel.stages||[]).map((stage,index)=><div className={`cafeFunnelStage ${String(stage.status).toLowerCase()}`} key={stage.key}><small>STEP {index+1}</small><b>{stage.label}</b><strong>{stage.value==null?'미수집':count(stage.value)}</strong><em>{stageStatus[stage.status]||stage.status}</em></div>)}</div><p className="cafeDataNote">장바구니와 결제진입은 현재 Analytics 원천에 없어 미수집으로 표시합니다. 방문→주문 전환율만 실제 수집값으로 계산합니다.</p></article>
    <section className="cafeWideGrid"><article className="panel cafeDailyPanel"><PanelTitle tag="DAILY FLOW" title="일별 방문·주문·매출" right={`${daily.length}일`}/>{daily.length?<div className="cafeDailyChart">{daily.map(item=><div className="cafeDailyDay" key={item.date}><div className="cafeInstantTip"><b>{dateLabel(item.date)}</b><span>방문 {count(item.visitors)}명</span><span>주문 {count(item.orders)}건</span><strong>{won(item.revenue)}</strong></div><div className="cafeDailyBars"><i className="visit" style={{height:`${Math.max(5,num(item.visitors)/maxVisitors*145)}px`}}/><i className="revenue" style={{height:`${Math.max(5,num(item.revenue)/maxRevenue*145)}px`}}/></div><span>{shortDate(item.date)}</span><small>{count(item.orders)}건</small></div>)}</div>:<Empty>일별 Cafe24 데이터가 없습니다.</Empty>}<div className="legend"><span><i className="dot greenDot"/>방문</span><span><i className="dot orangeDot"/>매출</span><span>막대에 올리면 즉시 상세 표시</span></div></article>
      <article className="panel cafeCustomerPanel"><PanelTitle tag="CUSTOMER" title="신규·기존·미식별 고객" right={customers.status==='PARTIAL'?'부분 식별':'원천 확인'}/><div className="customerSplit"><div><span>식별 주문</span><b>{count(customers.identifiedOrders)}건</b><small>{won(customers.identifiedRevenue)}</small></div><div><span>미식별 주문</span><b>{count(customers.anonymousOrders)}건</b><small>{won(customers.anonymousRevenue)}</small></div></div><div className="customerDetail"><p><span>신규 식별고객</span><b>{count(customers.newCustomers)}명</b></p><p><span>기존 식별고객</span><b>{count(customers.returningCustomers)}명</b></p><p><span>2회 이상 구매고객</span><b>{count(customers.repeatPurchaseCustomers)}명</b></p><p><span>고객 분석상태</span><b>{customers.status==='PARTIAL'?'부분 분석':'미수집'}</b></p></div><small className="privacyNote">{customers.historyStart?`${customers.historyStart} 이후 저장된 주문 기준 · `:''}고객 ID는 서버 집계에만 사용하며 화면·보고서에는 노출하지 않습니다.</small></article></section>
    <section className="cafeWideGrid"><article className="panel cafeAcquisitionPanel"><PanelTitle tag="ACQUISITION" title="유입 채널 구성" right={coverage.referrers==='PERIOD_MISMATCH'?'기간불일치':`귀속 ${coverage.referrerAttribution==='NOT_COLLECTED'?'미수집':'부분 수집'}`}/><div className="acquisitionList">{acquisition.map(item=><div key={item.key}><header><b>{item.label}</b><em>{num(item.share).toFixed(1)}%</em></header><i><u style={{width:`${Math.max(2,num(item.share))}%`}}/></i><footer><span>방문 {count(item.visitors)}명</span><span>주문 {item.orderAttribution?`${count(item.orders)}건`:'미수집'}</span><span>매출 {item.revenueAttribution?won(item.revenue):'미수집'}</span></footer></div>)}{!acquisition.length&&<Empty>유입경로 데이터가 없습니다.</Empty>}</div></article><article className="panel cafeDiagnosisPanel"><PanelTitle tag="AUTO DIAGNOSIS" title="Cafe24 자동 진단" right={`${analytics.findings?.length||0}개`}/><div className="findingList">{(analytics.findings||[]).map((item,index)=><div className={`finding ${item.level}`} key={`${item.title}-${index}`}><small>{item.area}</small><b>{item.title}</b><span>{item.body}</span></div>)}{!analytics.findings?.length&&<div className="finding good"><b>주요 경고 없음</b><span>현재 수집범위에서 즉시 확인할 경고가 없습니다.</span></div>}</div></article></section>
    <article className="panel cafeProductPerformance"><PanelTitle tag="PRODUCT PERFORMANCE" title="상품별 매출·주문·판매·고객" right="매출순"/><div className="cafeProductTable"><div className="cafeProductHead"><span>상품</span><span>매출</span><span>비중</span><span>주문</span><span>판매수량</span><span>기존고객</span></div>{products.slice(0,15).map((item,index)=><div className="cafeProductRow" key={`${item.name}-${index}`}><b>{item.name}</b><strong>{won(item.revenue)}</strong><span>{num(item.salesShare).toFixed(1)}%</span><span>{count(item.orders)}건</span><span>{count(item.quantity)}개</span><span>{item.customers?`${count(item.returningCustomers)}/${count(item.customers)}명`:'미식별'}</span></div>)}{!products.length&&<Empty>주문상품 데이터가 없습니다.</Empty>}</div></article>
  </>;
}

function CollectionView({ syncs, products, kpis, runSync, syncing, naver, coupang, automationRuns = [], qualityChecks = [], alerts = [], dataHealth, channelConnections, collectionCenter, aiPanel }) {
  const [naverSyncing,setNaverSyncing]=useState(false); const [naverMessage,setNaverMessage]=useState('');
  const [coupangSyncing,setCoupangSyncing]=useState(false);
  const [rgSyncing,setRgSyncing]=useState(false);
  const [allSyncing,setAllSyncing]=useState(false); const [qaRunning,setQaRunning]=useState(false);
  const [retryingDeadLetters,setRetryingDeadLetters]=useState(false);
  const [liveCollectionCenter,setLiveCollectionCenter]=useState(collectionCenter||{});
  function updateChannel(platform,patch){setLiveCollectionCenter(current=>({...current,channels:(current.channels||[]).map(channel=>channel.platform===platform?{...channel,...patch}:channel)}));}
  async function runCafe24Sync(){const result=await runSync();if(result?.ok!==false){const counts=result?.counts||{};updateChannel('CAFE24',{health_status:'READY',stored_summary:`상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 트래픽 ${count(counts.traffic)}`,latest_collection_summary:'방금 직접 수집 완료',last_success_at:new Date().toISOString(),last_attempt_at:new Date().toISOString(),error_message:null});}return result;}
  async function runNaverAdsSync(){setNaverSyncing(true);setNaverMessage('네이버 광고 데이터를 수집하는 중이에요…');try{const response=await fetch('/api/naver/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'네이버 광고 동기화 실패');const summary=`광고 · 캠페인 ${count(result.counts?.campaigns)} · 광고그룹 ${count(result.counts?.adgroups)} · 키워드 ${count(result.counts?.keywords)}`;updateChannel('NAVER',{health_status:'READY',stored_summary:summary,latest_collection_summary:'네이버 광고 방금 수집 완료',last_success_at:new Date().toISOString(),last_attempt_at:new Date().toISOString(),error_message:null});setNaverMessage(`${summary} · 화면에 바로 반영했어요.`);}catch(error){updateChannel('NAVER',{health_status:'FAILED',last_attempt_at:new Date().toISOString(),error_message:error.message});setNaverMessage(`확인 필요 · ${error.message}`);}finally{setNaverSyncing(false);}}
  async function runNaverSync(){setNaverSyncing(true);setNaverMessage('네이버 광고와 커머스 상품·주문·문의·정산을 함께 수집하는 중이에요…');try{const [adsResponse,commerceResponse]=await Promise.all([fetch('/api/naver/sync',{method:'POST'}),fetch('/api/naver-commerce/sync',{method:'POST'})]);const [ads,commerce]=await Promise.all([adsResponse.json(),coupangFixedIpResult(commerceResponse)]);if(!adsResponse.ok||!ads.ok)throw new Error(ads.error||'네이버 광고 동기화 실패');if(!commerce.ok)throw new Error(commerce.error||'네이버 커머스 동기화 실패');const counts=commerce.naverCommerceSync?.counts||commerce.request?.result_json?.naverCommerceSync?.counts||{};const summary=`광고 키워드 ${count(ads.counts?.keywords)} · 상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 문의·클레임 ${count(num(counts.inquiries)+num(counts.claims))} · 정산 ${count(counts.settlements)}`;updateChannel('NAVER',{health_status:'READY',stored_summary:summary,latest_collection_summary:'광고·커머스 방금 수집 완료',last_success_at:new Date().toISOString(),last_attempt_at:new Date().toISOString(),error_message:null});setNaverMessage(`완료 · ${summary}`);}catch(error){updateChannel('NAVER',{health_status:'FAILED',last_attempt_at:new Date().toISOString(),error_message:error.message});setNaverMessage(`확인 필요 · ${error.message}`);}finally{setNaverSyncing(false);}}
  async function runCoupangSync(){setCoupangSyncing(true);setNaverMessage('쿠팡 전체 수집 요청을 서울 고정 IP 서버에 전달하는 중이에요…');try{const response=await fetch('/api/coupang/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'쿠팡 동기화 요청 실패');updateChannel('COUPANG',{health_status:'RUNNING',latest_collection_summary:'상품·주문·정산·재고 수집 요청',last_attempt_at:new Date().toISOString(),error_message:null});setNaverMessage(result.existing?'이미 쿠팡 전체 수집이 대기 또는 실행 중입니다.':'요청 완료 · 서울 고정 IP 서버가 상품·주문·정산·재고 수집을 시작합니다.');}catch(error){updateChannel('COUPANG',{health_status:'FAILED',last_attempt_at:new Date().toISOString(),error_message:error.message});setNaverMessage(`확인 필요 · ${error.message}`);}finally{setCoupangSyncing(false);}}
  async function runRgSync(){setRgSyncing(true);setNaverMessage('로켓그로스 재고 수집 요청을 서울 고정 IP 서버에 전달하는 중이에요…');try{const response=await fetch('/api/coupang/rg-inventory/sync',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'로켓그로스 재고 요청 실패');updateChannel('COUPANG',{health_status:'RUNNING',latest_collection_summary:'로켓그로스 재고 수집 요청',last_attempt_at:new Date().toISOString(),error_message:null});setNaverMessage('요청 완료 · 서울 고정 IP 서버가 재고 수집을 시작합니다.');}catch(error){updateChannel('COUPANG',{health_status:'FAILED',last_attempt_at:new Date().toISOString(),error_message:error.message});setNaverMessage(`확인 필요 · ${error.message}`);}finally{setRgSyncing(false);}}
  async function runAll(){setAllSyncing(true);setNaverMessage('연결된 플랫폼만 수집·검증하는 중이에요…');try{const response=await fetch('/api/sync/all',{method:'POST'});const result=await response.json();if(!response.ok&&response.status!==207)throw new Error(result.error||'전체 동기화 실패');const updates=result.channel_updates||result.result_json?.channel_updates||[];const updateMap=new Map(updates.map(item=>[item.platform,item]));setLiveCollectionCenter(current=>({...current,channels:(current.channels||[]).map(channel=>updateMap.has(channel.platform)?{...channel,...updateMap.get(channel.platform)}:channel)}));const qa=result.qa?.checked||result.result_json?.qa?.checked||0;const attempted=result.attempted_count??result.result_json?.attempted_count??0;const skipped=result.skipped_count??result.result_json?.skipped_count??0;const failed=(result.jobs||result.result_json?.jobs||[]).filter(item=>!item.ok&&!item.skipped).length;setNaverMessage(`${failed?'일부 확인 필요':'완료'} · 연결 채널 ${attempted}개 실행${skipped?` · 미연결 ${skipped}개 호출 안 함`:''} · QA ${qa}개 · 실제 결과를 바로 반영했어요.`);}catch(error){setNaverMessage(`확인 필요 · ${error.message}`);}finally{setAllSyncing(false);}}
  async function runQa(){setQaRunning(true);setNaverMessage('저장된 데이터의 누락·오류·중복을 검사하는 중이에요…');try{const response=await fetch('/api/qa/run',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'QA 실패');setNaverMessage(`검사 완료 · ${result.checked||0}개 항목 · 화면을 유지합니다.`);}catch(error){setNaverMessage(`확인 필요 · ${error.message}`);}finally{setQaRunning(false);}}
  async function probeNaverCommerce(){setNaverSyncing(true);setNaverMessage('서울 고정 IP 서버에서 네이버 커머스 상품·주문·문의 권한을 확인하는 중이에요…');try{const response=await fetch('/api/naver-commerce/probe',{method:'POST'});const result=await coupangFixedIpResult(response);if(!result.ok)throw new Error(result.error||'네이버 커머스 연결 확인 실패');const probe=result.naverCommerce||result.request?.result_json?.naverCommerce;const ready=probe?.status==='SUCCESS';updateChannel('NAVER',{connection_status:ready?'READ_READY':'VERIFY_REQUIRED',last_attempt_at:new Date().toISOString(),error_message:ready?null:'일부 권한을 다시 확인해주세요.'});setNaverMessage(ready?'네이버 커머스 연결 확인 완료 · 상품·주문·문의·클레임 읽기 가능':`네이버 커머스 ${probe?.status||'확인 완료'} · 일부 권한을 다시 확인해주세요.`);}catch(error){updateChannel('NAVER',{connection_status:'FAILED',last_attempt_at:new Date().toISOString(),error_message:error.message});setNaverMessage(`확인 필요 · ${error.message}`);}finally{setNaverSyncing(false);}}
  async function retryDeadLetters(items){setRetryingDeadLetters(true);setNaverMessage('선택한 실패 작업을 다시 대기열에 넣는 중이에요…');try{const requested=(items||[]).map(item=>({kind:item.kind,id:item.id}));const response=await fetch('/api/operations/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:requested})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'재시도 요청 실패');const keys=new Set(requested.map(item=>`${item.kind}:${item.id}`));setLiveCollectionCenter(current=>{const reliability=current.reliability||{};const remaining=(reliability.dead_letters||[]).filter(item=>!keys.has(`${item.kind}:${item.id}`));return {...current,reliability:{...reliability,dead_letters:remaining},summary:{...(current.summary||{}),dead_letters:remaining.length,active_queue:Number(current.summary?.active_queue||0)+Number(result.requeued||0)}};});setNaverMessage(`재시도 요청 완료 · ${result.requeued||0}건 · 실패 목록에서 바로 옮겼어요.`);}catch(error){setNaverMessage(`확인 필요 · ${error.message}`);}finally{setRetryingDeadLetters(false);}}
  const channelSync={NAVER:runNaverSync,CAFE24:runCafe24Sync,COUPANG:runCoupangSync};
  const connectionActions={NAVER:probeNaverCommerce,CAFE24:()=>window.location.assign('/oauth/cafe24/start'),COUPANG:runCoupangSync};
  const busy={NAVER:naverSyncing,CAFE24:syncing,COUPANG:coupangSyncing};
  const collectedSummary=platform=>liveCollectionCenter?.channels?.find(item=>item.platform===platform)?.stored_summary||'최근 수집량 확인 필요';
  return <HarinReliabilityWorkbench mode="collection" center={liveCollectionCenter} alerts={alerts} primaryLabel="전체 수집 + 검증" onPrimary={runAll} primaryBusy={allSyncing} onRetry={retryDeadLetters} retrying={retryingDeadLetters} aiPanel={aiPanel}>
  <UnifiedCollectionOperationsCenter compact center={liveCollectionCenter} message={naverMessage} onRunAll={runAll} allSyncing={allSyncing} onSync={channelSync} onConnect={connectionActions} syncing={busy} onRetryDeadLetters={retryDeadLetters} retryingDeadLetters={retryingDeadLetters}>
    <ChannelConnectionCenter data={channelConnections} busy={busy} onAction={connectionActions}/>
    <PlatformStatus dataHealth={dataHealth} syncs={syncs} automationRuns={automationRuns} onSync={channelSync} syncing={busy}/>
    <CoupangQueuePanel health={coupang.queueHealth} onRetry={runCoupangSync} busy={coupangSyncing}/>
    <section className="setupGrid three"><article className="panel setupCard"><span className="setupIcon naverBg">N</span><h2>네이버 광고 상세</h2><p>{collectedSummary('NAVER')}</p><button className="enabledButton naverButton" onClick={runNaverAdsSync} disabled={naverSyncing}>{naverSyncing?'수집 중…':'네이버 광고만 동기화'}</button></article><article className="panel setupCard"><span className="setupIcon">C</span><h2>쿠팡 WING 상세</h2><p>{collectedSummary('COUPANG')}</p><button className="enabledButton" onClick={runRgSync} disabled={rgSyncing}>{rgSyncing?'요청 중…':'로켓그로스 재고만 갱신'}</button></article><article className="panel setupCard"><span className="setupIcon cafeBg">24</span><h2>Cafe24 상세</h2><p>{collectedSummary('CAFE24')}</p><button className="enabledButton" onClick={runCafe24Sync} disabled={syncing}>{syncing?'수집 중…':'Cafe24 다시 수집'}</button></article></section>
    <QaPanel checks={qualityChecks} alerts={alerts} runQa={runQa} running={qaRunning}/><CoupangDataImporter/><ReportImporter/><article className="panel"><PanelTitle tag="SYNC LOG" title="최근 자동수집 기록" right={`${syncs.length}건`}/><SyncTable syncs={syncs}/></article>
  </UnifiedCollectionOperationsCenter>
  </HarinReliabilityWorkbench>;
}

const connectionStatusLabel={READ_READY:'읽기 연결',WRITE_READY:'읽기·쓰기 준비',RECONNECT_REQUIRED:'재연결 필요',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'확인 필요',FAILED:'연결 실패'};
function ChannelConnectionCenter({ data, busy={}, onAction={} }) {
  if(!data?.channels?.length)return null;
  return <article className="panel channelConnectionCenter"><header><div><span>{data.phase} · CHANNEL PERMISSION GATE</span><h2>{data.title}</h2><p>{data.rule}</p></div><b>조회 성공 → 변경 허용</b></header><div className="channelConnectionGrid">{data.channels.map(channel=><section className={`channelConnectionCard ${String(channel.status).toLowerCase()}`} key={channel.platform}><header><div><i>{channel.platform==='CAFE24'?'24':channel.platform.slice(0,1)}</i><span><b>{channel.name}</b><small>{channel.service}</small></span></div><em>{connectionStatusLabel[channel.status]||channel.status}</em></header><p>{channel.summary}</p><div className="capabilityTable"><div className="capabilityHead"><span>업무</span><span>조회</span><span>변경</span></div>{channel.capabilities.map(item=><div className="capabilityRow" key={item.key}><b>{item.label}</b><span className={String(item.read.status).toLowerCase()} title={item.read.reason}>{item.read.label}</span><span className={String(item.write.status).toLowerCase()} title={item.write.reason}>{item.write.label}</span></div>)}</div><footer><small>{channel.lastVerifiedAt?`마지막 확인 ${dateTime(channel.lastVerifiedAt)}`:'연결 확인 기록 없음'}</small><button type="button" onClick={onAction[channel.platform]} disabled={busy[channel.platform]}>{busy[channel.platform]?'확인 중…':channel.action.label}</button></footer></section>)}</div></article>;
}

const collectionStatusLabel={READY:'정상',PARTIAL:'일부 자료 확인',FAILED:'최근 수집 실패',RUNNING:'수집 중',STALE:'갱신 필요',WAITING:'수집 대기'};
function PlatformStatus({ dataHealth, syncs, automationRuns, onSync, syncing }) {
  const fallback=['NAVER','CAFE24','COUPANG'].map(platform=>{const log=syncs.find(item=>item.platform===platform);return {platform,status:log?.status==='SUCCESS'?'READY':log?.status==='PARTIAL'?'PARTIAL':'WAITING',lastSuccessAt:log?.finished_at,lastAttemptAt:log?.finished_at,nextScheduledAt:dataHealth?.nextScheduledAt,failedDatasets:[],storedSummary:'저장량 확인 필요'};});
  const channels=dataHealth?.channels?.length?dataHealth.channels:fallback;
  return <section className="platformStatusGrid channelOpsGrid">{channels.map(item=>{const run=automationRuns.find(value=>value.job_name===`${item.platform}_SYNC`),label=item.dataMode==='PREVIOUS'?'이전 자료 표시':collectionStatusLabel[item.status]||item.status;return <article className={`channelOpsCard ${String(item.status).toLowerCase()}`} key={item.platform}><header><span>{item.platform}</span><b>{label}</b></header><strong>{item.storedSummary}</strong><dl><div><dt>마지막 성공</dt><dd>{item.lastSuccessAt?dateTime(item.lastSuccessAt):'성공 기록 없음'}</dd></div><div><dt>마지막 시도</dt><dd>{item.lastAttemptAt?dateTime(item.lastAttemptAt):'시도 기록 없음'}</dd></div><div><dt>다음 자동수집</dt><dd>{item.nextScheduledAt?`${dateTime(item.nextScheduledAt)} · 매일`:'매일 오전 5:30'}</dd></div></dl>{item.errorMessage&&<p>{item.errorMessage}</p>}{item.dataMode==='PREVIOUS'?<small>마지막 성공 자료는 유지하고 계산 결과는 확인 필요로 표시합니다.</small>:item.failedDatasets?.length?<small>확인할 자료 · {item.failedDatasets.join(', ')}</small>:<small>{run?.attempt_count>1?`${run.attempt_count}회 재시도 후 처리`:'채널별로 독립 처리됩니다.'}</small>}<button type="button" onClick={onSync[item.platform]} disabled={syncing[item.platform]}>{syncing[item.platform]?'수집 요청 중…':'이 채널만 다시 수집'}</button></article>})}</section>;
}

const queueStatusLabel={PENDING:'대기',RUNNING:'수집 중',RETRY_WAIT:'재시도 대기',SUCCESS:'완료',FAILED:'장기 실패'};
function CoupangQueuePanel({ health={}, onRetry, busy }) {
  const active=(health.recent||[]).filter(item=>['PENDING','RUNNING','RETRY_WAIT'].includes(item.status));
  const problems=health.longFailures||[];
  const rows=[...active,...problems.filter(item=>!active.some(activeItem=>activeItem.id===item.id))].slice(0,10);
  return <article className="panel coupangQueuePanel"><header><div><span>FIXED IP QUEUE · 13.124.12.17</span><b>쿠팡 작업 큐·재시도</b><small>서울 고정 IP 서버가 대기 작업을 가져가며 실패하면 최대 8회 다시 시도합니다.</small></div><button type="button" onClick={onRetry} disabled={busy}>{busy?'요청 중…':'쿠팡 새 작업 요청'}</button></header><section className="queueSummary"><span><small>대기</small><b>{count(health.pending)}건</b></span><span><small>실행 중</small><b>{count(health.running)}건</b></span><span><small>재시도 대기</small><b>{count(health.retryWaiting)}건</b></span><span className={health.longFailures?.length?'danger':''}><small>장기 실패</small><b>{count(health.longFailures?.length)}건</b></span></section>{rows.length?<div className="queueRows">{rows.map(item=><div className={item.terminalFailure||item.longRunning?'danger':''} key={item.id}><em>{queueStatusLabel[item.status]||item.status}</em><section><b>{item.requestType==='FULL'?'쿠팡 전체 수집':item.requestType}</b><small>요청 {item.requestedAt?dateTime(item.requestedAt):'-'} · {count(item.attemptCount)}회 시도 · 대기 {count(item.ageMinutes)}분{item.nextAttemptAt?` · 다음 ${dateTime(item.nextAttemptAt)}`:''}</small>{item.errorMessage&&<p>{String(item.errorMessage).slice(0,180)}</p>}</section></div>)}</div>:<div className="queueEmpty"><b>대기·장기 실패 작업 없음</b><span>최근 쿠팡 수집 큐가 정상적으로 비워졌습니다.</span></div>}</article>;
}

function QaPanel({ checks, alerts, runQa, running }) { const latestByDataset=[];for(const item of checks){const key=`${item.platform}:${item.dataset}`;if(!latestByDataset.some(row=>`${row.platform}:${row.dataset}`===key))latestByDataset.push(item);}return <article className="panel qaPanel"><div className="qaHead"><PanelTitle tag="DATA QA" title="데이터 품질 검증" right={`열린 알림 ${alerts.length}건`}/><button onClick={runQa} disabled={running}>{running?'검사 중…':'지금 검사'}</button></div><div className="qaGrid">{latestByDataset.slice(0,12).map(item=><div key={item.id}><em className={item.severity.toLowerCase()}>{item.status_code}</em><span><b>{item.platform} · {item.dataset}</b><small>{item.message}</small></span></div>)}</div></article>; }

function ReportImporter() {
  const [platform, setPlatform] = useState('NAVER');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  async function upload(event) {
    event.preventDefault();
    if (!file) return setMessage('먼저 파일을 선택해주세요.');
    setUploading(true); setMessage('파일을 안전하게 저장하는 중이에요…');
    try {
      const form = new FormData(); form.set('platform', platform); form.set('file', file);
      const response = await fetch('/api/reports/import', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '업로드 실패');
      setMessage(`저장 완료 · ${result.report.title}`);
      setTimeout(()=>window.location.reload(), 900);
    } catch (error) { setMessage(`확인 필요 · ${error.message}`); setUploading(false); }
  }
  return <article className="panel importPanel"><PanelTitle tag="FILE IMPORT" title="진단·광고 보고서 업로드" right="최대 5MB"/><form onSubmit={upload}><label><span>플랫폼</span><select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="NAVER">네이버</option><option value="COUPANG">쿠팡</option></select></label><label className="fileField"><span>파일</span><input type="file" accept=".html,.htm,.md,.txt,.csv" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>{file?`${file.name} · ${(file.size/1024).toFixed(1)}KB`:'HTML, MD, TXT, CSV 지원'}</small></label><button type="submit" disabled={uploading}>{uploading?'저장 중…':'보고서 저장'}</button></form>{message&&<div className="importMessage">{message}</div>}</article>;
}

function CoupangDataImporter() {
  const [dataset,setDataset]=useState('AUTO');
  const [file,setFile]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState('');
  async function upload(event) {
    event.preventDefault();
    if (!file) return setMessage('먼저 쿠팡 CSV 또는 XLSX 파일을 선택해주세요.');
    setUploading(true); setMessage('열 이름을 확인하고 주문·상품·정산 데이터를 저장하는 중이에요…');
    try {
      const form=new FormData(); form.set('dataset',dataset); form.set('file',file);
      const response=await fetch('/api/coupang/import',{method:'POST',body:form});
      const result=await response.json();
      if((!response.ok&&response.status!==207)||!result.ok)throw new Error(result.error||'쿠팡 데이터 가져오기 실패');
      const values=result.counts||{};
      setMessage(`완료 · 주문 ${count(values.orders)} · 주문상품 ${count(values.orderItems)} · 상품 ${count(values.products)} · 정산 ${count(values.settlements)}${values.invalidRows?` · 확인 필요 ${count(values.invalidRows)}행`:''}${result.report?.created?' · 분석 보고서 자동 생성':''}`);
      setTimeout(()=>window.location.reload(),1200);
    } catch(error) { setMessage(`확인 필요 · ${error.message}`); setUploading(false); }
  }
  return <article className="panel importPanel coupangImportPanel"><PanelTitle tag="COUPANG DATA IMPORT" title="쿠팡 WING 데이터 가져오기" right="CSV/XLSX · 최대 15MB"/><p className="importGuide">자체개발 API를 기본 수집수단으로 사용합니다. CSV/XLSX 업로드는 API 장애나 과거자료 보완용으로 계속 지원합니다.</p><form onSubmit={upload}><label><span>자료 종류</span><select value={dataset} onChange={event=>setDataset(event.target.value)}><option value="AUTO">자동 판별</option><option value="ORDERS">주문·주문상품</option><option value="PRODUCTS">상품</option><option value="SETTLEMENTS">정산</option></select></label><label className="fileField"><span>쿠팡 원본 파일</span><input type="file" accept=".csv,.xlsx" onChange={event=>setFile(event.target.files?.[0]||null)}/><small>{file?`${file.name} · ${(file.size/1024).toFixed(1)}KB`:'쿠팡 WING에서 다운로드한 CSV 또는 XLSX'}</small></label><button type="submit" disabled={uploading}>{uploading?'분석·저장 중…':'데이터 가져오기'}</button></form>{message&&<div className="importMessage">{message}</div>}</article>;
}

function InsightView({reports,actions,liveNaver,platform='all',platformEvents}) {
  const available=reports.filter(item=>(item.summary_json?.cafe24||item.summary_json?.naver||item.summary_json?.coupang)&&reportHasPlatform(item,platform));const detailed=[...available.filter(item=>item.platform===platformReportName[platform]),...available.filter(item=>item.platform!==platformReportName[platform])];
  const [selected,setSelected]=useState(detailed[0]?.id||'');
  const report=detailed.find(item=>item.id===selected)||detailed[0];const rawSummary=report?.summary_json||{};const scopeTerm=platformReportName[platform];const scopeItems=items=>platform==='all'?(items||[]):(items||[]).filter(item=>{const text=JSON.stringify(item).toUpperCase();return text.includes(scopeTerm)||(platform==='cafe24'&&text.includes('자사몰'))||(platform==='coupang'&&text.includes('로켓'));});const summary={...rawSummary,insights:scopeItems(rawSummary.insights),recommendations:scopeItems(rawSummary.recommendations)};const cafe=(platform==='all'||platform==='cafe24')?(summary.cafe24||{}):{};const naver=(platform==='all'||platform==='naver')?(summary.naver||{}):{};const coupang=(platform==='all'||platform==='coupang')?(summary.coupang||{}):{};const keywords=(platform==='all'||platform==='naver')?(summary.keywords||{}):{};const compare=summary.comparison||{};
  const rate=value=>value==null?'비교 데이터 없음':`${value>=0?'+':''}${num(value).toFixed(1)}%`;
  const score=summary.score??Math.max(0,100-(naver.connected&&naver.roas<250?20:0)-(!cafe.orders?15:0));
  if(!report)return <><section className="pageIntro"><span className="eyebrow">{platformReportName[platform]} INSIGHT</span><h1>{platformLabel[platform]} 보고서 기반 인사이트</h1><p>상세 자동보고서가 생성되면 선택한 플랫폼 분석이 이 화면에 자동 반영됩니다.</p></section><article className="panel"><Empty>{platformLabel[platform]} 보고서를 먼저 생성해주세요. 다른 플랫폼 데이터는 대신 표시하지 않습니다.</Empty></article></>;
  const isCoupang=platform==='coupang',isNaver=platform==='naver',isCafe24=platform==='cafe24';
  const coupangCampaigns=coupang.top_campaigns||[],coupangWaste=coupang.waste_keywords||[];
  const metricCards=isCoupang?[
    ['orange','₩','쿠팡 광고비',won(coupang.ad_spend),`전기 대비 ${rate(compare.coupang_ad_spend?.change_rate)}`],
    ['green','%','쿠팡 14일 ROAS',`${num(coupang.ad_roas).toFixed(1)}%`,`전환매출 ${won(coupang.ad_revenue)}`],
    ['blue','#','쿠팡 광고 주문',`${num(coupang.ad_orders).toFixed(0)}건`,`클릭 ${count(coupang.ad_clicks)}회`],
    ['purple','!','무전환 키워드',`${coupangWaste.length}개`,`실행 대기 ${actions.filter(item=>item.status==='PLANNED'&&item.platform==='COUPANG').length}건`]
  ]:isNaver?[
    ['orange','₩','네이버 광고비',won(naver.ad_spend),`전기 대비 ${rate(compare.naver_spend?.change_rate)}`],
    ['green','%','네이버 ROAS',`${num(naver.roas||liveNaver?.totals?.roas).toFixed(1)}%`,`전기 대비 ${rate(compare.naver_roas?.change_rate)}`],
    ['blue','#','네이버 전환',`${count(naver.purchase_count)}건`,`전환매출 ${won(naver.revenue)}`],
    ['purple','!','무전환 비용',won(keywords.waste_cost),`키워드 ${keywords.waste?.length||0}개`]
  ]:isCafe24?[
    ['orange','₩','Cafe24 매출',won(cafe.revenue),`전기 대비 ${rate(compare.cafe24_revenue?.change_rate)}`],
    ['blue','#','Cafe24 주문',`${count(cafe.orders)}건`,`전환율 ${num(cafe.conversion_rate).toFixed(1)}%`],
    ['green','V','방문자',`${count(cafe.visitors)}명`,`객단가 ${won(cafe.average_order_value)}`],
    ['purple','R','기존 식별고객',`${count(cafe.analytics?.customers?.returningCustomers)}명`,`신규 ${count(cafe.analytics?.customers?.newCustomers)}명 · 미식별 주문 ${count(cafe.analytics?.customers?.anonymousOrders)}건`]
  ]:[
    ['orange','₩','Cafe24 매출',won(cafe.revenue),`전기 대비 ${rate(compare.cafe24_revenue?.change_rate)}`],
    ['green','%','네이버 ROAS',`${num(naver.roas||liveNaver?.totals?.roas).toFixed(1)}%`,`광고비 ${won(naver.ad_spend)}`],
    ['blue','C','쿠팡 ROAS',`${num(coupang.ad_roas).toFixed(1)}%`,`광고비 ${won(coupang.ad_spend)}`],
    ['purple','!','전체 실행 대기',`${actions.filter(item=>item.status==='PLANNED').length}건`,'플랫폼 통합 우선순위']
  ];
  const comparisonCards=isCoupang?[["쿠팡 광고비",compare.coupang_ad_spend],["쿠팡 전환매출",compare.coupang_ad_revenue],["쿠팡 ROAS",compare.coupang_ad_roas],["쿠팡 주문",compare.coupang_orders],["쿠팡 매출",compare.coupang_sales]]:isNaver?[["네이버 광고비",compare.naver_spend],["전환매출",compare.naver_revenue],["ROAS",compare.naver_roas]]:isCafe24?[["Cafe24 매출",compare.cafe24_revenue],["주문수",compare.cafe24_orders],["전환율",compare.cafe24_conversion]]:[["Cafe24 매출",compare.cafe24_revenue],["네이버 광고비",compare.naver_spend],["네이버 ROAS",compare.naver_roas],["쿠팡 광고비",compare.coupang_ad_spend],["쿠팡 ROAS",compare.coupang_ad_roas]];
  return <><section className="pageIntro insightIntro"><div><span className="eyebrow">{platformLabel[platform]} REPORT-DRIVEN INSIGHT</span><h1>{platformLabel[platform]} 보고서 기반 상세 인사이트</h1><p>보고서가 생성될 때마다 지표·비교·진단·권고사항이 자동으로 업데이트됩니다.</p></div><select value={report.id} onChange={event=>setSelected(event.target.value)}>{detailed.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></section><section className="insightHero"><div><span>종합 운영점수</span><strong>{score}</strong><small>/ 100</small></div><section><b>{report.title}</b><p>{report.period_start} ~ {report.period_end}</p><ul>{(summary.executive_summary||summary.insights?.map(item=>item.body)||[]).slice(0,4).map((text,index)=><li key={index}>{text}</li>)}</ul></section></section><section className="kpiGrid">{metricCards.map(([tone,icon,label,value,sub])=><Kpi key={label} tone={tone} icon={icon} label={label} value={value} sub={sub}/>)}</section><section className="comparisonGrid">{comparisonCards.map(([label,item])=><article key={label}><span>{label}</span><b>{rate(item?.change_rate)}</b><small>현재 {label.includes('ROAS')||label.includes('전환율')?`${num(item?.current).toFixed(1)}%`:label.includes('주문')?`${count(item?.current)}건`:won(item?.current)}</small></article>)}</section><section className="twoCol insightDetail"><article className="panel"><PanelTitle tag="DIAGNOSIS" title="자동 진단" right={`${summary.insights?.length||0}개`}/><div className="findingList">{(summary.insights||[]).map((item,index)=><div className={`finding ${item.level}`} key={index}><small>{item.area||'INSIGHT'}</small><b>{item.title}</b><span>{item.body}</span></div>)}</div></article><article className="panel"><PanelTitle tag="PRIORITY" title="권고사항" right="자동 계산"/><div className="recommendationList">{(summary.recommendations||[]).length?(summary.recommendations||[]).map((item,index)=><div key={index}><em className={item.priority?.toLowerCase()}>{item.priority}</em><section><b>{item.title}</b><span>{item.reason}</span><small>기대효과 · {item.expected}</small></section></div>):<Empty>추가 권고사항이 없습니다.</Empty>}</div></article></section>{isCoupang?<section className="twoCol insightDetail"><article className="panel"><PanelTitle tag="COUPANG CAMPAIGN" title="쿠팡 캠페인 성과" right={`${coupangCampaigns.length}개`}/><div className="insightTable"><div className="insightTableHead"><span>캠페인</span><span>광고비</span><span>매출</span><span>ROAS</span></div>{coupangCampaigns.map(item=><div className="insightTableRow" key={item.campaign_id}><b>{item.campaign_name}</b><span>{won(item.ad_spend)}</span><span>{won(item.revenue)}</span><em>{num(item.roas).toFixed(0)}%</em></div>)}</div></article><article className="panel"><PanelTitle tag="COUPANG KEYWORD" title="쿠팡 무전환 키워드" right={`${coupangWaste.length}개`}/><div className="miniKeywordList">{coupangWaste.map((item,index)=><div key={`${item.keyword}-${index}`}><b>{item.keyword}</b><span>클릭 {count(item.clicks)}</span><em>{won(item.ad_spend)}</em></div>)}</div></article></section>:<><section className="twoCol insightDetail"><article className="panel"><PanelTitle tag="CAMPAIGN" title="네이버 캠페인 성과" right={`${naver.top_campaigns?.length||0}개`}/><div className="insightTable"><div className="insightTableHead"><span>캠페인</span><span>광고비</span><span>매출</span><span>ROAS</span></div>{(naver.top_campaigns||[]).map(item=><div className="insightTableRow" key={item.id}><b>{item.name}</b><span>{won(item.cost)}</span><span>{won(item.revenue)}</span><em>{num(item.roas).toFixed(0)}%</em></div>)}</div></article><article className="panel"><PanelTitle tag="KEYWORD" title="무전환 키워드" right={`${keywords.waste?.length||0}개`}/><div className="miniKeywordList">{(keywords.waste||[]).map(item=><div key={item.ncc_keyword_id}><b>{item.keyword}</b><span>클릭 {count(item.clicks)}</span><em>{won(item.cost)}</em></div>)}</div></article></section><section className="twoCol insightDetail"><article className="panel"><PanelTitle tag="PRODUCT" title="Cafe24 상품 성과" right={`${cafe.top_products?.length||0}개`}/><div className="rankList">{(cafe.top_products||[]).map((item,index)=><div className="rankRow" key={item.name}><span className="rank">{index+1}</span><div><b>{item.name}</b><small>{item.orders}건 · {item.quantity}개</small></div><strong>{won(item.revenue)}</strong></div>)}</div></article><article className="panel"><PanelTitle tag="SOURCE" title="Cafe24 유입경로" right={`${cafe.top_sources?.length||0}개`}/><div className="sourceList">{(cafe.top_sources||[]).map((item,index)=><div className="sourceRow" key={`${item.source}-${index}`}><b>{index+1}</b><div><span>{item.source}</span></div><strong>{count(item.visitors)}명</strong></div>)}</div></article></section></>}</>;
}

function SyncTable({ syncs }) { return <div className="syncTable"><div className="syncHeader"><span>실행일시</span><span>상태</span><span>저장 결과</span></div>{syncs.map(log=>{const counts=log.metadata?.counts||{};const detail=log.platform==='NAVER'&&log.job_type==='COMMERCE_SYNC'?`네이버 커머스 · 상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 문의/클레임 ${count(Number(counts.inquiries||0)+Number(counts.claims||0))} · 정산 ${count(counts.settlements)}`:log.platform==='NAVER'?`네이버 광고 · 캠페인 ${count(counts.campaigns)} · 키워드 ${count(counts.keywords)}`:log.platform==='COUPANG'?`쿠팡 · 재고 ${count(counts.rgInventory)} · 품절 ${count(counts.rgOutOfStock??counts.outOfStock)} · 주문 ${count(counts.orders)} · 정산 ${count(counts.settlements)}`:`Cafe24 · 상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 트래픽 ${count(counts.traffic)}`;return <div className="syncRow" key={log.id}><span>{dateTime(log.started_at)}</span><span className={`status ${String(log.status).toLowerCase()}`}>{log.status}</span><span>{log.metadata?.counts?detail:`${log.platform||'플랫폼'} · ${count(log.rows_received)}건`}</span></div>})}</div>; }
