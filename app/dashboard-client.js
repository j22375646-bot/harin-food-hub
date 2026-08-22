'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import costWorkbenchModule from '../lib/products/cost-workbench.js';
import freshnessModule from '../lib/ui/freshness.js';
import { getHubHelp } from '../lib/ui/help-content.js';
import hubRoutesModule from '../lib/navigation/hub-routes.js';
import { useStoredState } from './use-hub-preference.js';
import { HarinBreadcrumbBar, HarinFocusedWorkspaceNav, HarinMobileNavigation, HarinSidebar, HarinTopbar } from './_shell/harin-app-shell.js';
import { HarinProgressiveDetails, HarinRouteProgress } from './_design-system/harin-ui.js';
import { HarinBulkCheckbox, HarinBulkSelectionBar, useHarinBulkSelection } from './_design-system/harin-bulk-selection.js';
import HarinIcon from './_design-system/harin-icon.js';

const { PAGE_SIZE:COST_PAGE_SIZE, COST_FIELDS, costStatus, filterCostProducts, paginateCostProducts, summarizeCostProgress } = costWorkbenchModule;
const { relativeFreshnessLabel } = freshnessModule;

function LazyWorkbenchFallback(){
  return <section className="lazyWorkbenchFallback" role="status" aria-live="polite" aria-busy="true"><i aria-hidden="true"/><span><b>작업공간을 준비하고 있어요</b><small>현재 화면은 유지하고 필요한 기능만 불러옵니다.</small></span></section>;
}
const UnifiedOrdersCenter=dynamic(()=>import('./unified-orders-center.js'),{loading:LazyWorkbenchFallback});
const ProductGrowthCenter=dynamic(()=>import('./product-growth-center.js'),{loading:LazyWorkbenchFallback});
const ProductAdTargetsCenter=dynamic(()=>import('./product-ad-targets-center.js'),{loading:LazyWorkbenchFallback});
const NaverSearchTermCenter=dynamic(()=>import('./naver-search-term-center.js'),{loading:LazyWorkbenchFallback});
const MarketingDiagnosisCenter=dynamic(()=>import('./marketing-diagnosis-center.js'),{loading:LazyWorkbenchFallback});
const MarketingInsightSummary=dynamic(()=>import('./marketing-diagnosis-center.js').then(module=>module.MarketingInsightSummary),{loading:LazyWorkbenchFallback});
const NaverExecutiveBoard=dynamic(()=>import('./naver-executive-board.js'),{loading:LazyWorkbenchFallback});
const HarinAiFoundation=dynamic(()=>import('./harin-ai-foundation.js'),{loading:LazyWorkbenchFallback});
const HarinAiPagePanel=dynamic(()=>import('./harin-ai-page-panel.js'),{loading:LazyWorkbenchFallback});
const AiKnowledgeCenter=dynamic(()=>import('./ai-knowledge-center.js'),{loading:LazyWorkbenchFallback});
const CustomerRetentionValidationCenter=dynamic(()=>import('./customer-retention-validation-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedCustomerServiceCenter=dynamic(()=>import('./unified-customer-service-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedProductOperationsCenter=dynamic(()=>import('./unified-product-operations-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedInventoryOperationsCenter=dynamic(()=>import('./unified-inventory-operations-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedSettlementOperationsCenter=dynamic(()=>import('./unified-settlement-operations-center.js'),{loading:LazyWorkbenchFallback});
const UnifiedCollectionOperationsCenter=dynamic(()=>import('./unified-collection-operations-center.js'),{loading:LazyWorkbenchFallback});
const Phase14MainCommandCenter=dynamic(()=>import('./_main/harin-main-command-center.js'),{loading:LazyWorkbenchFallback});
const HarinAnalysisWorkbench=dynamic(()=>import('./_analysis/harin-analysis-workbench.js'),{loading:LazyWorkbenchFallback});
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
  useEffect(()=>{document.documentElement.dataset.fontScale=fontScale;},[fontScale]);
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

  const operatingInventory=Array.isArray(initialData.coupang?.rgInventory)?initialData.coupang.rgInventory.filter(item=>num(item.sales_last_30_days)>0&&num(item.total_orderable_quantity)>0):[];
  const inventoryActionCount=initialData.unifiedInventory?.summary?.action_required??operatingInventory.filter(item=>['CRITICAL','LOW'].includes(String(item.stock_status||'').toUpperCase())).length;
  const operationBadges={orders:num(initialData.unifiedOrders?.summary?.actionRequired),cs:num(initialData.coupang?.unansweredInquiries),inventory:num(inventoryActionCount),notifications:initialData.alerts.length||0};
  const nav = hubRoutesModule.HUB_NAV.map(item=>({...item,badge:operationBadges[item.id]||0}));
  const navGroups=hubRoutesModule.HUB_NAV_GROUPS.map(group=>{const items=group.items.map(id=>nav.find(item=>item.id===id)).filter(Boolean);return {...group,items,actionCount:items.reduce((sum,item)=>sum+num(item.badge),0)};});
  const navContext=hubRoutesModule.navigationContext(view,platform);
  const latestRefreshAt=syncs.find(item=>item.finished_at||item.started_at)?.finished_at||syncs.find(item=>item.finished_at||item.started_at)?.started_at||null;
  const connectionChannels=initialData.channelConnections?.channels||[];
  const readyChannelCount=connectionChannels.filter(item=>['READ_READY','WRITE_READY'].includes(item.status)).length;
  const connectionLabel=readyChannelCount===3?'3개 채널 연결':readyChannelCount>0?`${readyChannelCount}/3 채널 연결`:'연결 상태 확인';
  const connectionTone=readyChannelCount===3?'ready':'check';
  const selectedHealth=platform==='all'?null:initialData.dataHealth?.channels?.find(item=>item.platform===platform.toUpperCase());
  const channelUnavailable=Boolean(selectedHealth?.failedDatasets?.length);
  const viewIsLoading=Boolean(pendingView||pendingWorkspace||routePending||(initialData.loadedView&&view!==initialData.loadedView)||(initialData.loadedWorkspace!==undefined&&workspace!==initialData.loadedWorkspace));
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
  const openView=id=>navigate({view:id,product:'ALL',period:'DAY'});
  const selectPlatform=id=>navigate({platform:id,product:id==='coupang'?selectedProduct:'ALL'},true);
  const prefetchView=id=>{
    if(prefetchedViews.current.has(id))return;
    prefetchedViews.current.add(id);
    router.prefetch(hubRoutesModule.buildHubHref({view:id,platform:'all',product:'ALL',period:'DAY'}));
  };

  return <div className="shell">
    <HarinTopbar context={navContext} connectionLabel={connectionLabel} connectionTone={connectionTone} fontScale={fontScale} onFontScale={setFontScale} syncing={syncing} onSync={runSync}/>
    <HarinSidebar groups={navGroups} view={pendingView||view} openGroup={openNavGroup} query={navQuery} onQuery={setNavQuery} onOpenGroup={setOpenNavGroup} onOpenView={openView} onPrefetch={prefetchView}/>
    <main className={`hubMain${viewIsLoading?' routePending':''}`} aria-busy={viewIsLoading?'true':'false'} data-loader-profile={initialData.loaderPerformance?.profile||undefined} data-loader-ms={initialData.loaderPerformance?.duration_ms??undefined} data-loader-target={initialData.loaderPerformance?.target_ms??undefined} data-loader-within-target={initialData.loaderPerformance?.within_target===undefined?undefined:String(initialData.loaderPerformance.within_target)} data-loader-remote-queries={initialData.loaderPerformance?.remote_query_count??undefined} data-loader-slowest={(initialData.loaderPerformance?.slow_queries||[]).map(item=>`${item.table}:${item.duration_ms}`).join(',')||undefined}>
      {viewIsLoading?<HarinRouteProgress label={nav.find(item=>item.id===(pendingView||view))?.label}/>:null}
      <HarinBreadcrumbBar context={navContext}/>
      {channelScopedViews.has(view)&&(view!=='product'||workspace==='catalog')&&<section className="platformSwitch" aria-label="플랫폼 선택">
        {(view==='keyword'?[['naver','naverDot','네이버'],['coupang','coupangDot','쿠팡']]:[['all','allDot','전체'],['naver','naverDot','네이버'],['coupang','coupangDot','쿠팡'],['cafe24','cafeDot','Cafe24']]).map(([id,dot,label])=><button key={id} className={platform===id?'selected':''} onClick={()=>selectPlatform(id)}><i className={dot}/>{label}</button>)}
        <span className="periodFilter">{view==='keyword'?'플랫폼별 분리 운영 · 최근 7일':'최근 7일 기준'}</span>
      </section>}
      <HarinFocusedWorkspaceNav view={view} workspace={workspace} pendingWorkspace={pendingWorkspace} platform={platform} period={period} product={selectedProduct} onNavigate={nextWorkspace=>{setPendingWorkspace(nextWorkspace);window.__HARIN_CLIENT_HEALTH__?.startRoute?.(hubRoutesModule.buildHubHref({view,workspace:nextWorkspace,platform,period,product:selectedProduct}));}}/>
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
        {workspace==='diagnosis'&&(platform==='all'||platform==='naver')?<MarketingDiagnosisCenter diagnosis={initialData.naver?.marketingDiagnosis}/>:null}{workspace!=='history'?<PlatformKeywordView key={`keyword-${platform}-${workspace}`} platform={platform} workspace={workspace} data={initialData}/>:null}
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
    <HarinMobileNavigation nav={nav} groups={navGroups} view={view} onOpenView={openView} onPrefetch={prefetchView} fontScale={fontScale} onFontScale={setFontScale}/>
    <footer className="hubFooter">하린식품 광고·매출 통합 관리 허브 <span>·</span> 네이버 + 쿠팡 + Cafe24 + Supabase</footer>
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

function PlatformKeywordView({ platform, workspace, data }) {
  if(platform==='naver'||platform==='all')return <KeywordView naver={data.naver} workspace={workspace}/>;
  if(platform==='coupang')return <CoupangDemandView coupang={data.coupang}/>;
  if(platform==='cafe24')return <Cafe24AcquisitionView referrers={data.referrers||[]} topProducts={data.topProducts||[]}/>;
  return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">ALL PLATFORM DISCOVERY</span><h1>통합 검색·유입 신호</h1><p>네이버 검색어, 쿠팡 상품 수요, Cafe24 유입경로를 플랫폼별 원본 기준으로 비교합니다.</p></div></section><section className="platformOverviewGrid"><article className="panel"><PanelTitle tag="NAVER" title="검색광고 키워드" right={`${count(data.naver?.keywords)}개 등록`}/><p className="platformMetric">{(data.naver?.keywordTop||[]).length}개</p><small>최근 성과가 확인된 키워드</small></article><article className="panel"><PanelTitle tag="COUPANG" title="상품 수요 신호" right="주문 기반"/><p className="platformMetric">{(data.coupang?.productPerformance||[]).length}개</p><small>판매·매출이 집계된 상품</small></article><article className="panel"><PanelTitle tag="CAFE24" title="유입경로" right="Analytics"/><p className="platformMetric">{(data.referrers||[]).length}개</p><small>검색·광고·직접 유입 채널</small></article></section><article className="panel platformGuide"><PanelTitle tag="HOW TO USE" title="플랫폼을 선택해 상세 분석" right="상단 버튼"/><p>상단의 네이버·쿠팡·Cafe24 버튼을 누르면 해당 플랫폼 전용 키워드 및 수요 화면으로 전환됩니다.</p></article></>;
}

function CoupangAdImporter(){
  const [files,setFiles]=useState([]),[uploading,setUploading]=useState(false),[message,setMessage]=useState('');
  async function upload(){setUploading(true);setMessage('광고비·키워드·전환매출을 저장하고 보고서를 만드는 중이에요…');try{const form=new FormData();files.forEach(file=>form.append('files',file));const response=await fetch('/api/coupang/ad-import',{method:'POST',body:form});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'광고파일 처리 실패');const rows=result.results.reduce((sum,item)=>sum+num(item.stored_rows),0);setMessage(`완료 · ${result.results.length}개 파일 · ${count(rows)}행 저장 · 쿠팡/통합 보고서 생성`);setTimeout(()=>window.location.reload(),1000);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setUploading(false);}}
  return <article className="panel coupangAdImporter"><div><PanelTitle tag="COUPANG ADS IMPORT" title="광고·키워드 파일 업데이트" right="XLSX 여러 개"/><p>일별 광고비 정산과 PA 일별 키워드 파일을 함께 선택하세요. 같은 행은 중복 저장되지 않고 쿠팡·통합 보고서가 자동 생성됩니다.</p></div><div className="costUploadControls"><label><input type="file" accept=".xlsx" multiple onChange={event=>setFiles([...event.target.files])}/><span>{files.length?`${files.length}개 선택됨`:'광고 XLSX 선택'}</span></label><button onClick={upload} disabled={uploading||!files.length}>{uploading?'분석 중…':'광고파일 업데이트'}</button></div>{message&&<small className="costUploadMessage">{message}</small>}</article>;
}

function CoupangDemandView({coupang}) {
  const daily=coupang.adDaily||[],top=coupang.adKeywordTop||[],waste=coupang.adKeywordWaste||[],campaigns=coupang.adCampaigns||[],billing=coupang.adBilling||[];
  const totals=daily.reduce((sum,item)=>({impressions:sum.impressions+num(item.impressions),clicks:sum.clicks+num(item.clicks),spend:sum.spend+num(item.ad_spend),orders:sum.orders+num(item.orders_14d),revenue:sum.revenue+num(item.revenue_14d)}),{impressions:0,clicks:0,spend:0,orders:0,revenue:0});
  const roas=totals.spend?totals.revenue/totals.spend*100:0,cpc=totals.clicks?totals.spend/totals.clicks:0,cvr=totals.clicks?totals.orders/totals.clicks*100:0,max=Math.max(...daily.map(item=>Math.max(num(item.ad_spend),num(item.revenue_14d))),1),period=daily.length?`${daily[0].date}~${daily.at(-1).date}`:'업로드 대기';
  const billed=billing.reduce((sum,item)=>sum+num(item.billed_amount),0),vat=billing.reduce((sum,item)=>sum+num(item.vat),0);
  return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">COUPANG PA · {period}</span><h1>쿠팡 광고·키워드 분석</h1><p>현재 운영 중인 8개 캠페인만 노출·클릭·광고비·14일 전환매출 계산에 포함합니다. 그 외 캠페인 원본은 DB에만 보관합니다.</p></div></section><CoupangAdImporter/><section className="kpiGrid"><Kpi tone="orange" icon="₩" label="활성 캠페인 광고비" value={won(totals.spend)} sub={`청구액 ${won(billed)} · VAT ${won(vat)}`}/><Kpi tone="green" icon="%" label="14일 ROAS" value={`${roas.toFixed(1)}%`} sub={`전환매출 ${won(totals.revenue)}`}/><Kpi tone="blue" icon="C" label="CPC" value={won(cpc)} sub={`클릭 ${count(totals.clicks)}회`}/><Kpi tone="purple" icon="V" label="CVR" value={`${cvr.toFixed(2)}%`} sub={`주문 ${num(totals.orders).toFixed(1)}건`}/></section><article className="panel coupangAdTrend"><PanelTitle tag="DAILY ADS" title="활성 캠페인 일별 광고비·전환매출" right={period}/>{daily.length?<div className="adTrendBars">{daily.map(item=><div className="adTrendDay" key={item.date}><div><i className="adSpendBar" style={{height:`${Math.max(3,num(item.ad_spend)/max*190)}px`}}/><i className="adRevenueBar" style={{height:`${Math.max(3,num(item.revenue_14d)/max*190)}px`}}/><span className="instantChartTooltip"><strong>{item.date}</strong><small>광고비 <b>{won(item.ad_spend)}</b></small><small>14일 매출 <b>{won(item.revenue_14d)}</b></small><small>ROAS <b>{num(item.roas_14d).toFixed(1)}%</b></small></span></div><small>{shortDate(item.date)}</small></div>)}</div>:<Empty>쿠팡 광고 XLSX를 올리면 일별 그래프가 표시됩니다.</Empty>}<div className="legend"><span><i className="dot orangeDot"/>광고비</span><span><i className="dot greenDot"/>14일 전환매출</span></div></article><section className="twoCol keywordCols"><article className="panel"><PanelTitle tag="GROWTH KEYWORD" title="전환 키워드 TOP" right={`${top.length}개`}/><CoupangKeywordTable items={top.slice(0,20)} mode="growth"/></article><article className="panel"><PanelTitle tag="WASTE KEYWORD" title="광고비 사용·전환 0" right={`${waste.length}개`}/><CoupangKeywordTable items={waste.slice(0,20)} mode="waste"/></article></section><article className="panel"><PanelTitle tag="ACTIVE CAMPAIGN" title="운영 중 쿠팡 캠페인 성과" right={`${campaigns.length}개`}/><div className="insightTable"><div className="insightTableHead"><span>캠페인</span><span>광고비</span><span>매출</span><span>ROAS</span></div>{campaigns.slice(0,20).map(item=><div className="insightTableRow" key={item.campaign_id}><b>{item.campaign_name}</b><span>{won(item.ad_spend)}</span><span>{won(item.revenue)}</span><em>{num(item.roas).toFixed(0)}%</em></div>)}</div></article></>;
}

function CoupangKeywordTable({items,mode}){return <div className="keywordTable">{items.length?items.map((item,index)=><div className="keywordRow" key={item.keyword}><b>{index+1}</b><div><strong>{item.keyword}</strong><small>노출 {count(item.impressions)} · 클릭 {count(item.clicks)} · 광고비 {won(item.ad_spend)} · 주문 {num(item.orders).toFixed(1)}</small></div><em className={mode}>{mode==='growth'?`${num(item.roas).toFixed(0)}%`:won(item.ad_spend)}</em></div>):<Empty>해당 키워드가 없습니다.</Empty>}</div>}

function Cafe24AcquisitionView({referrers,topProducts}) {
  const visitors=referrers.reduce((sum,item)=>sum+num(item.visitors),0), revenue=referrers.reduce((sum,item)=>sum+num(item.revenue),0);
  return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">CAFE24 ACQUISITION</span><h1>Cafe24 유입·검색 채널</h1><p>자사몰은 검색광고 키워드 대신 Analytics 유입경로와 유입 후 상품 매출을 연결해 봅니다.</p></div></section><section className="kpiGrid"><Kpi tone="green" icon="V" label="유입 방문자" value={`${count(visitors)}명`} sub={`${referrers.length}개 경로`}/><Kpi tone="orange" icon="₩" label="유입경로 매출" value={won(revenue)} sub="Analytics 응답 기준"/><Kpi tone="blue" icon="S" label="상위 유입경로" value={referrers[0]?.source||'수집 대기'} sub={`${count(referrers[0]?.visitors)}명`}/><Kpi tone="purple" icon="P" label="판매상품" value={`${topProducts.length}개`} sub="주문상품 집계"/></section><section className="twoCol"><article className="panel"><PanelTitle tag="SOURCE" title="유입경로 성과" right="방문순"/><div className="platformDataList">{referrers.slice(0,15).map((item,index)=><div className="platformDataRow" key={`${item.source}-${index}`}><b>{index+1}</b><section><strong>{item.source}</strong><small>방문 {count(item.visitors)} · 주문 {count(item.orders)}</small></section><em>{won(item.revenue)}</em></div>)}{!referrers.length&&<Empty>Cafe24 Analytics 유입경로 수집이 필요합니다.</Empty>}</div></article><article className="panel"><PanelTitle tag="LANDING PRODUCT" title="유입 후 판매상품" right="매출순"/><div className="platformDataList">{topProducts.slice(0,15).map((item,index)=><div className="platformDataRow" key={`${item.name}-${index}`}><b>{index+1}</b><section><strong>{item.name}</strong><small>주문 {count(item.orders)}건 · 판매 {count(item.quantity)}개</small></section><em>{won(item.sales??item.revenue)}</em></div>)}</div></article></section></>;
}

function KeywordView({naver,workspace='search-terms'}) {
  const [refreshing,setRefreshing]=useState(false);const [actioning,setActioning]=useState('');const [message,setMessage]=useState('');
  async function refresh(){setRefreshing(true);setMessage('3,134개 키워드의 최근 7일 성과를 분석하는 중이에요…');try{const response=await fetch('/api/naver/keyword-stats',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'키워드 갱신 실패');setMessage(`완료 · 실제 성과 키워드 ${result.rows}개`);setTimeout(()=>window.location.reload(),900);}catch(error){setMessage(`확인 필요 · ${error.message}`);setRefreshing(false);}}
  async function register(item,action_type){const key=`${item.ncc_keyword_id}:${action_type}`;setActioning(key);setMessage('실행계획을 등록하는 중이에요…');try{const response=await fetch('/api/naver/keyword-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyword_id:item.ncc_keyword_id,keyword:item.keyword,action_type,cost:item.cost,conversion_revenue:item.conversion_revenue,clicks:item.clicks,conversions:item.conversions})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'등록 실패');setMessage(result.created?`등록 완료 · ${item.keyword} · 진단목록에서 확인하세요`:`이미 같은 실행계획이 대기 중입니다 · ${item.keyword}`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setActioning('');}}
  async function registerWasteAll(){const selected=waste.slice(0,20);if(!selected.length)return;setActioning('bulk');setMessage('무전환 키워드 실행계획을 묶어서 등록하는 중이에요…');try{const response=await fetch('/api/naver/keyword-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:selected.map(item=>({keyword_id:item.ncc_keyword_id,keyword:item.keyword,action_type:'LOWER_BID',cost:item.cost,conversion_revenue:item.conversion_revenue,clicks:item.clicks,conversions:item.conversions}))})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'등록 실패');setMessage(`등록 완료 · 신규 ${result.created}건${result.existing?` · 기존 대기 ${result.existing}건`:''} · 진단목록에서 확인하세요`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setActioning('');}}
  const top=naver.keywordTop||[],waste=naver.keywordWaste||[],period=naver.keywordPeriod;
  if(workspace==='search-terms')return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">CUSTOMER SEARCH TERMS</span><h1>고객이 실제로 검색한 말</h1><p>등록 키워드와 섞지 않고 실제 유입 검색어의 의도·낭비·확장 기회만 확인합니다.</p></div></section><NaverSearchTermCenter initialData={naver.searchTermCenter}/></>;
  if(workspace==='diagnosis')return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">KEYWORD OPPORTUNITY</span><h1>기회·낭비 키워드 진단</h1><p>매출을 만든 키워드와 돈만 쓰는 키워드를 나눠 다음 행동을 정합니다.</p></div></section><section className="kpiGrid"><Kpi tone="green" icon="+" label="성장 후보" value={`${top.filter(item=>num(item.conversion_revenue)>0).length}개`} sub="전환매출 확인"/><Kpi tone="orange" icon="!" label="낭비 후보" value={`${waste.length}개`} sub={won(waste.reduce((sum,item)=>sum+num(item.cost),0))}/><Kpi tone="blue" icon="%" label="최고 ROAS" value={`${Math.max(...top.map(item=>num(item.roas)),0).toFixed(0)}%`} sub="최근 실적"/><Kpi tone="purple" icon="D" label="분석 기간" value={period?.period_end||'수집 대기'} sub={period?.period_start||'최근 7일'}/></section><section className="twoCol keywordCols"><article className="panel"><PanelTitle tag="EXPAND" title="확장 검토" right={`${top.length}개`}/><KeywordTable items={top.filter(item=>num(item.conversion_revenue)>0).slice(0,5)} mode="growth" actioning={actioning} onAction={register}/></article><article className="panel"><PanelTitle tag="REDUCE" title="감액·중지 검토" right={`${waste.length}개`}/><KeywordTable items={waste.slice(0,5)} mode="waste" actioning={actioning} onAction={register}/></article></section></>;
  return <><section className="pageIntro keywordIntro"><div><span className="eyebrow">REGISTERED KEYWORDS</span><h1>등록 키워드 성과·조치</h1><p>광고 계정에 등록한 키워드의 성과를 보고 관찰·감액·중지 검토를 등록합니다.</p></div><button onClick={refresh} disabled={refreshing}>{refreshing?'분석 중…':'등록 키워드 갱신'}</button></section>{message&&<div className="syncToast">{message}</div>}<section className="registeredKeywordDivider"><span>등록 키워드 성과</span><p>광고 계정에 등록한 {count(naver.keywords)}개 키워드의 최근 7일 성과입니다.</p></section><section className="kpiGrid"><Kpi tone="green" icon="K" label="성과 키워드" value={`${top.length?Math.max(top.length,waste.length):0}+`} sub="최근 API 응답"/><Kpi tone="orange" icon="₩" label="TOP 키워드 매출" value={won(top.reduce((sum,item)=>sum+num(item.conversion_revenue),0))} sub="상위 20개 합계"/><Kpi tone="blue" icon="%" label="최고 ROAS" value={`${Math.max(...top.map(item=>num(item.roas)),0).toFixed(0)}%`} sub="성과 키워드 기준"/><Kpi tone="purple" icon="!" label="무전환 광고비" value={won(waste.reduce((sum,item)=>sum+num(item.cost),0))} sub={`${waste.length}개 점검`}/></section><section className="twoCol keywordCols"><article className="panel"><PanelTitle tag="GROWTH" title="전환매출 키워드 TOP" right={period?`${period.period_start}~${period.period_end}`:'최근 7일'}/><KeywordTable items={top.filter(item=>num(item.conversion_revenue)>0).slice(0,10)} mode="growth" actioning={actioning} onAction={register}/></article><article className="panel"><div className="keywordPanelHead"><PanelTitle tag="WASTE" title="광고비 사용·전환 0" right={`${waste.length}개`}/><button className="bulkAction" onClick={registerWasteAll} disabled={!waste.length||Boolean(actioning)}>{actioning==='bulk'?'등록 중…':'전체 감액검토'}</button></div><KeywordTable items={waste.slice(0,10)} mode="waste" actioning={actioning} onAction={register}/></article></section></>;
}
function KeywordTable({items,mode,actioning,onAction}){return <div className="keywordTable">{items.length?items.map((item,index)=><div className="keywordRow actionable" key={item.ncc_keyword_id}><b>{index+1}</b><div><strong>{item.keyword}</strong><small>클릭 {count(item.clicks)} · CPC {won(item.metrics?.cpc)} · CVR {num(item.metrics?.cvrPercent).toFixed(1)}% · 목표 CPC {item.metrics?.targetCpc?won(item.metrics.targetCpc):'-'} · {bidActionLabel(item.metrics?.bidAction)}</small><span className="keywordActions">{mode==='growth'?<button onClick={()=>onAction(item,'WATCH')} disabled={Boolean(actioning)}>{actioning===`${item.ncc_keyword_id}:WATCH`?'등록 중…':'관찰 등록'}</button>:<><button onClick={()=>onAction(item,'LOWER_BID')} disabled={Boolean(actioning)}>{actioning===`${item.ncc_keyword_id}:LOWER_BID`?'등록 중…':'감액'}</button><button className="dangerButton" onClick={()=>onAction(item,'PAUSE')} disabled={Boolean(actioning)}>{actioning===`${item.ncc_keyword_id}:PAUSE`?'등록 중…':'중지 검토'}</button></>}</span></div><em className={mode}>{mode==='growth'?`${num(item.roas).toFixed(0)}%`:won(item.cost)}</em></div>):<Empty>해당 키워드가 없습니다.</Empty>}</div>}

function PlatformProductView({platform,workspace,data}) {
  const common={products:data.products||[],topProducts:data.topProducts||[],masterProducts:data.masterProducts||[],channelProducts:data.channelProducts||[],productCosts:data.productCosts||[],channelCostSettings:data.channelCostSettings||[],channelShippingRules:data.channelShippingRules||[],shippingRuleEvidence:data.shippingRuleEvidence||{},costCalibration:data.costCalibration||{},profitability:data.liveProfitability||{},financialTrust:data.financialTrust||{},financialReadiness:data.financialReadiness||{},productAdTargets:data.productAdTargets||{summary:{},items:[]},mapping:data.productMapping||{summary:{},candidates:[],links:[]},unifiedPerformance:data.unifiedProductPerformance||{summary:{},items:[]},productOperations:data.productOperations||{summary:{},items:[]}};
  if(workspace==='catalog'&&platform==='coupang')return <CoupangProductHub coupang={data.coupang}/>;
  if(workspace==='catalog'&&platform==='naver')return <NaverProductHub channelProducts={common.channelProducts} naver={data.naver}/>;
  return <ProductView {...common} platform={workspace==='catalog'?platform:'all'} workspace={workspace}/>;
}

function CoupangProductHub({coupang}) {
  const items=coupang.productPerformance||[], inventory=coupang.rgInventory||[];
  return <><section className="pageIntro productIntro"><div><span className="eyebrow">COUPANG PRODUCT HUB</span><h1>쿠팡 상품 관리</h1><p>상품별 주문·판매수량·매출과 로켓그로스 판매가능재고를 함께 확인합니다.</p></div></section><section className="kpiGrid"><Kpi tone="orange" icon="₩" label="30일 매출" value={won(coupang.salesOverview?.last30?.revenue)} sub={`${count(coupang.salesOverview?.last30?.orders)}건 주문`}/><Kpi tone="blue" icon="#" label="판매수량" value={`${count(coupang.salesOverview?.last30?.units)}개`} sub="최근 30일"/><Kpi tone="green" icon="S" label="판매가능재고" value={`${count(coupang.rgTotalOrderable)}개`} sub={`${inventory.length}개 SKU`}/><Kpi tone="purple" icon="!" label="품절·저재고" value={`${count(num(coupang.rgOutOfStock)+num(coupang.rgLowStock))}개`} sub="재고 조치 필요"/></section><article className="panel"><PanelTitle tag="COUPANG CATALOG" title="상품별 매출·판매·재고" right={`${items.length}개 상품`}/><div className="platformDataList">{items.slice(0,30).map((item,index)=><div className="platformDataRow productPlatformRow" key={item.vendorItemId}><b>{index+1}</b><section><strong>{item.name}</strong><small>상품 ID {item.vendorItemId} · 주문 {count(item.totals?.orders)}건 · 판매 {count(item.totals?.units)}개</small></section><span className={num(item.inventory?.quantity)<=0?'platformPill danger':'platformPill good'}>재고 {count(item.inventory?.quantity)}개</span><em>{won(item.totals?.revenue)}</em></div>)}{!items.length&&<Empty>쿠팡 주문·상품 데이터를 동기화해주세요.</Empty>}</div></article></>;
}

function NaverProductHub({channelProducts,naver}) {
  const items=channelProducts.filter(item=>item.platform==='NAVER');
  return <><section className="pageIntro productIntro"><div><span className="eyebrow">NAVER AD REFERENCE</span><h1>네이버 광고 연결</h1><p>현재 데이터는 스마트스토어 실상품이 아니라 검색광고 캠페인·광고그룹 연결입니다.</p></div></section><section className="kpiGrid"><Kpi tone="green" icon="A" label="광고그룹 연결" value={`${items.length}개`} sub="실상품 연결과 별도"/><Kpi tone="orange" icon="₩" label="전환매출" value={won(naver?.totals?.revenue)} sub="최근 7일 광고 성과"/><Kpi tone="blue" icon="%" label="ROAS" value={`${num(naver?.totals?.roas).toFixed(1)}%`} sub={`${naver?.campaigns||0}개 캠페인`}/><Kpi tone="purple" icon="K" label="등록 키워드" value={`${count(naver?.keywords)}개`} sub="검색광고 API"/></section><article className="panel"><PanelTitle tag="NAVER ADGROUP LINK" title="광고그룹·기준상품 연결" right={`${items.length}개 연결`}/><div className="platformDataList">{items.map((item,index)=><div className="platformDataRow" key={item.id}><b>{index+1}</b><section><strong>{item.external_product_name||item.external_product_id}</strong><small>광고그룹 ID {item.external_product_id} · 실상품이 아닌 광고 성과 귀속용</small></section><em>광고 참고</em></div>)}{!items.length&&<Empty>기준상품에 연결된 네이버 광고그룹이 없습니다.</Empty>}</div></article></>;
}

function FinancialReadinessCenter({ readiness={}, showAdTargets=true }) {
  const router=useRouter();
  const coverage=readiness.current_cost_coverage_rate;
  const priorities=(readiness.priority_products||[]).filter(item=>item.required_for_target);
  const eligibleIds=new Set(readiness.sellableMasterIds||[]);
  const costPriorities=priorities.filter(item=>item.master_product_id&&eligibleIds.has(item.master_product_id));
  const statusLabel={READY:'완료',ACTION_REQUIRED:'입력 필요',CHECK_REQUIRED:'확인 필요'};
  const [costRows,setCostRows]=useState(()=>Object.fromEntries(costPriorities.map(item=>[item.master_product_id,{unit_cost:'',packaging_cost:'',other_unit_cost:''}])));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  const scrollTo=target=>(document.getElementById(target)||document.querySelector(target))?.scrollIntoView({behavior:'smooth',block:'start'});
  async function savePriorityCost(product){
    const row=costRows[product.master_product_id]||{};
    if(num(row.unit_cost)+num(row.packaging_cost)+num(row.other_unit_cost)<=0){setMessage(`${product.name}의 실제 비용을 1원 이상 입력해주세요.`);return;}
    setSaving(product.master_product_id);setMessage('변경 전후 영향을 계산 중…');
    if(!window.confirm(`${product.name}의 입력 원가를 지금 저장할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.`)){setSaving('');setMessage('');return;}
    try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'PRODUCT',master_product_id:product.master_product_id,...row})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);setMessage(`${product.name} 원가 저장 완료 · 실제 저장값도 확인했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}
  }
  return <><article className={`panel financialReadinessCenter ${String(readiness.status||'ACTION_REQUIRED').toLowerCase()}`}>
    <header className="financialReadinessHead"><div><span>이익 계산 준비</span><h2>이익 신뢰 회복센터</h2><p>실제 원가를 임의로 추정하지 않고, 매출 영향이 큰 상품부터 입력해 이익 계산을 안전하게 엽니다.</p></div><strong>{readiness.status==='READY'?'이익 계산 가능':'계산 보호 중'}</strong></header>
    <div className="financialReadinessProgress"><div><span style={{width:`${Math.max(0,Math.min(100,num(coverage)))}%`}}/></div><p><b>현재 {coverage==null?'확인 필요':`${num(coverage).toFixed(1)}%`}</b><em>목표 {num(readiness.target_cost_coverage_rate||95).toFixed(0)}%</em></p></div>
    <div className="financialReadinessKpis"><span><small>우선 입력</small><b>{count(readiness.priority_input_count)}개</b><em>95% 달성 최소 묶음</em></span><span><small>미입력 매출</small><b>{won(readiness.missing_cost_revenue)}</b><em>{count(readiness.missing_cost_products)}개 상품</em></span><span><small>추가 반영 필요</small><b>{won(readiness.required_additional_revenue)}</b><em>매출 기준</em></span><span><small>미귀속 광고비</small><b>{won(readiness.unassigned_ad_spend)}</b><em>쿠팡 상품 연결 확인</em></span></div>
    <div className="financialReadinessChecklist">{(readiness.checklist||[]).map(item=><section className={String(item.status).toLowerCase()} key={item.id}><i>{item.status==='READY'?'✓':'!'}</i><div><b>{item.title}</b><p>{item.detail}</p></div><em>{statusLabel[item.status]||item.status}</em></section>)}</div>
    {priorities.length?<><div className="financialPriorityPreview"><header><b>먼저 처리할 상품</b><span>전체 주문 매출이 큰 순서 · 이 목록까지 처리하면 95% 도달</span></header>{priorities.map(item=><button type="button" key={`${item.master_product_id||'unmapped'}:${item.rank}`} onClick={()=>item.mapping_required?router.push('/products/mappings'):scrollTo(`product-cost-${item.master_product_id}`)}><i>{item.rank}</i><span><b>{item.name}</b><small>매출 {won(item.revenue)} · 전체의 {num(item.revenue_share_rate).toFixed(1)}%</small></span><em>{item.mapping_required?'상품 연결 먼저':`입력 후 ${num(item.projected_coverage_rate).toFixed(1)}%`}</em></button>)}</div>{costPriorities.length?<section className="priorityCostInputs" id="priority-cost-inputs"><header><b>실제 원가 입력</b><span>모르는 비용은 0원으로 확정하지 말고 비워두세요.</span></header><div className="priorityCostHead"><span>상품</span><span>상품 원가</span><span>포장비</span><span>기타 단위비</span><span>미리보기</span></div>{costPriorities.map(item=>{const row=costRows[item.master_product_id]||{};return <div className="priorityCostRow" id={`product-cost-${item.master_product_id}`} key={item.master_product_id}><span><i>{item.rank}</i><b>{item.name}</b><small>매출 {won(item.revenue)}</small></span>{['unit_cost','packaging_cost','other_unit_cost'].map(field=><input key={field} type="number" min="0" step="100" placeholder="실제 금액" value={row[field]??''} onChange={event=>setCostRows(current=>({...current,[item.master_product_id]:{...row,[field]:event.target.value}}))}/>)}<button type="button" disabled={saving===item.master_product_id} onClick={()=>savePriorityCost(item)}>{saving===item.master_product_id?'계산 중':'저장 검토'}</button></div>;})}{message&&<p className="priorityCostMessage">{message}</p>}</section>:null}</>:<div className="financialReadyMessage">우선 입력할 상품이 없습니다. 원가 반영 목표를 충족했습니다.</div>}
    <footer><button type="button" onClick={()=>scrollTo('priority-cost-inputs')}>우선 원가 입력하기</button><button type="button" className="secondaryButton" onClick={()=>router.push('/products/mappings')}>상품 연결 검토</button></footer>
    <details><summary>이 화면은 어떻게 쓰나요?</summary><p><b>예시:</b> 전체 매출 100만원 중 원가가 확인된 상품 매출이 50만원이면 반영률은 50%입니다. 다음으로 매출이 큰 상품 몇 개의 실제 원가를 입력해 95만원까지 확인되면 이익 계산이 열립니다. 매입가를 모르면 0원으로 저장하지 말고 거래명세서 확인 후 입력하세요.</p></details>
  </article>{showAdTargets?<ProductAdTargetsCenter center={readiness.productAdTargets||{summary:{},items:[]}}/>:null}</>;
}

function CatalogCards({items=[]}) {
  const [visibleCount,setVisibleCount]=useState(18);
  const visible=items.slice(0,visibleCount);
  return <><div className="productGrid">{visible.map(product=><div className="productCard" key={product.id}>{product.image?<div className="productImage" role="img" aria-label={product.name} style={{backgroundImage:`url(${product.image})`}}/>:<div className="imageFallback">H</div>}<div><span className={String(product.catalog_status||'stopped').toLowerCase()}>{product.status_label}</span><b>{product.name}</b><strong>{won(product.price)}</strong></div></div>)}</div>{visibleCount<items.length&&<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(count=>count+18)}>상품 18개 더 보기 <small>{visible.length}/{items.length}</small></button>}</>;
}

function CatalogBucket({title,description,items=[]}) {
  const [open,setOpen]=useState(false);
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span><b>{title}</b><small>{description}</small></span><em>{items.length}개</em></summary>{open?<CatalogCards items={items}/>:null}</details>;
}

function Cafe24Catalog({ products=[] }) {
  const selling=products.filter(item=>item.catalog_status==='SELLING');
  const soldOut=products.filter(item=>item.catalog_status==='OUT_OF_STOCK');
  const stopped=products.filter(item=>item.catalog_status==='STOPPED');
  const excluded=products.filter(item=>item.catalog_status==='NON_PRODUCT');
  return <article className="panel catalog cafe24Catalog"><PanelTitle tag="CAFE24 CATALOG" title="판매 가능한 상품" right={`${selling.length}개`}/><CatalogCards items={selling}/>{!selling.length&&<Empty>현재 판매중인 Cafe24 상품이 없습니다.</Empty>}<div className="catalogExcludedNote">이벤트·멤버십·쿠폰·리뷰 적립금·사은품 {excluded.length}개는 상품 작업에서 자동 제외했습니다.</div><CatalogBucket title="품절 상품" description="판매가 다시 가능해지면 자동으로 위 목록으로 이동합니다." items={soldOut}/><CatalogBucket title="판매중단 상품" description="판매 또는 진열을 중단한 상품입니다." items={stopped}/></article>;
}

function ProductView({ products, topProducts, masterProducts, channelProducts, productCosts, channelCostSettings, channelShippingRules, shippingRuleEvidence, costCalibration, profitability, financialTrust, financialReadiness, productAdTargets, mapping, unifiedPerformance, productOperations, platform='all', workspace='catalog' }) {
  const [building,setBuilding]=useState(false); const [message,setMessage]=useState('');
  channelCostSettings=channelCostSettings.map(item=>item.platform==='COUPANG'?{...item,cost_calibration:costCalibration}:item);
  const productById=new Map(products.map(item=>[String(item.id),item]));
  const cafeLinkByMaster=new Map(channelProducts.filter(item=>item.platform==='CAFE24').map(item=>[item.master_product_id,item]));
  const sellableMasterProducts=masterProducts.filter(master=>{const link=cafeLinkByMaster.get(master.id),source=link&&productById.get(String(link.external_product_id));return master.is_active!==false&&link?.is_active!==false&&source?.is_sellable===true;});
  const sellableMasterIds=sellableMasterProducts.map(item=>item.id);
  const sellableSet=new Set(sellableMasterIds);
  const sellableCosts=productCosts.filter(item=>sellableSet.has(item.master_product_id));
  const linkedCafe24=sellableMasterProducts.length;
  const isRealExternalProduct=item=>item.platform==='COUPANG'||(item.platform==='NAVER'&&String(item.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');
  const linkedOther=channelProducts.filter(item=>isRealExternalProduct(item)&&item.is_active!==false&&sellableSet.has(item.master_product_id)).length;
  async function buildCatalog(){setBuilding(true);setMessage('Cafe24 판매상태와 비상품을 다시 분류하는 중이에요…');try{const response=await fetch('/api/products/bootstrap',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'상품 등록 실패');setMessage(`완료 · 판매중 ${result.selling} · 품절 ${result.out_of_stock} · 판매중단 ${result.stopped} · 비상품 제외 ${result.excluded}`);setTimeout(()=>window.location.reload(),900);}catch(error){setMessage(`확인 필요 · ${error.message}`);setBuilding(false);}}
  const profitReady=financialTrust?.allowed?.contribution_profit===true;
  const visibleTargetItems=(productAdTargets?.items||[]).filter(item=>sellableSet.has(item.master_product_id));
  const visibleTargets={...productAdTargets,summary:{...(productAdTargets?.summary||{}),total_products:visibleTargetItems.length,ready_products:visibleTargetItems.filter(item=>item.status==='READY').length,observe_products:visibleTargetItems.filter(item=>item.status==='OBSERVE').length,blocked_products:visibleTargetItems.filter(item=>item.status==='BLOCKED').length,configured_products:visibleTargetItems.filter(item=>item.target_profit_margin_rate!=null).length},items:visibleTargetItems};
  const visiblePerformanceItems=(unifiedPerformance?.items||[]).filter(item=>sellableSet.has(item.master_product_id));
  const visibleUnifiedPerformance={...unifiedPerformance,summary:{...(unifiedPerformance?.summary||{}),active_products:visiblePerformanceItems.length},items:visiblePerformanceItems};
  financialReadiness={...financialReadiness,productAdTargets:visibleTargets,sellableMasterIds};
  const workspaceMeta={
    catalog:['PRODUCT CATALOG','판매 상품목록','판매중 상품을 먼저 보고 품절·판매중단·행사용 항목은 접어서 확인합니다.','product'],
    mappings:['CHANNEL MAPPING','채널 실상품 매칭','Cafe24 판매상품을 기준으로 네이버 스마트스토어와 쿠팡 실상품을 각각 연결합니다. 네이버 광고그룹은 제외합니다.','link'],
    costs:['COST SETTINGS','상품 원가·공통비용','실제 상품 원가와 채널 수수료·배송비를 입력해 이익 계산의 신뢰를 엽니다.','price'],
    profit:['PROFIT ANALYSIS','상품별 실제 이익','채널 매출에서 원가·수수료·배송비·광고비를 뺀 공헌이익을 비교합니다.','growth'],
    offers:['OFFER BUILDER','판매구성 비교','1개·2개·묶음 구성별 실제 이익과 할인 한도를 비교합니다.','product'],
    'ad-targets':['AD TARGETS','상품별 광고 목표','목표 이익률을 기준으로 ROAS·CPA·CPC 안전선을 계산합니다.','target']
  }[workspace]||['PRODUCT CATALOG','판매 상품목록','판매중 상품을 관리합니다.','product'];
  const mappingStatus=sellableMasterProducts.length>0?<article className="panel mappingPanel productMappingStatus"><div className="mappingPanelTitle"><i><HarinIcon name="link" size={21}/></i><PanelTitle tag="REAL COMMERCE PRODUCTS" title="판매중 실상품 연결 현황" right={`${linkedOther+linkedCafe24}개 연결`}/></div><div className="mappingTable"><div className="mappingHeader"><span>기준상품</span><span>Cafe24</span><span>네이버 스마트스토어</span><span>쿠팡</span></div>{sellableMasterProducts.slice(0,20).map(master=>{const links=channelProducts.filter(item=>item.master_product_id===master.id&&item.is_active!==false);const realNaver=links.find(item=>item.platform==='NAVER'&&String(item.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');const channelLinks={CAFE24:links.find(item=>item.platform==='CAFE24'),NAVER:realNaver,COUPANG:links.find(item=>item.platform==='COUPANG')};return <div className="mappingRow" key={master.id}><b>{master.name}</b>{['CAFE24','NAVER','COUPANG'].map(p=>{const link=channelLinks[p];return <span key={p} className={link?'mapped':'unmapped'}>{link?link.external_product_name:'미연결'}</span>})}</div>})}</div><p className="mappingCommerceNote"><HarinIcon name="shield" size={16}/> 네이버 광고그룹은 이 표와 상품 연결 계산에서 제외됩니다. 스마트스토어 실상품만 표시합니다.</p></article>:null;
  return <><section className="pageIntro productIntro phase13ProductIntro productWorkspaceIntro"><div className="productWorkspaceTitle"><i><HarinIcon name={workspaceMeta[3]} size={25}/></i><span><span className="eyebrow">{workspaceMeta[0]}</span><h1>{workspaceMeta[1]}</h1><p>{workspaceMeta[2]}</p></span></div>{workspace==='catalog'?<button onClick={buildCatalog} disabled={building}><HarinIcon name="sync" size={17}/>{building?'분류 중…':'Cafe24 상품상태 갱신'}</button>:null}</section>{message&&<div className="syncToast">{message}</div>}<section className="kpiGrid productWorkspaceKpis"><Kpi tone="orange" icon={<HarinIcon name="growth" size={20}/>} label="공헌이익" value={profitReady?won(profitability.contribution_profit):'미산정'} sub={`원가 반영률 ${profitability.cost_coverage_rate==null?'확인 필요':`${num(profitability.cost_coverage_rate).toFixed(0)}%`}`}/><Kpi tone="blue" icon={<HarinIcon name="product" size={20}/>} label="판매중 상품" value={`${sellableMasterProducts.length}개`} sub="매칭·원가 입력 가능"/><Kpi tone="green" icon={<HarinIcon name="store" size={20}/>} label="Cafe24 연결" value={`${linkedCafe24}개`} sub="판매중 기준상품"/><Kpi tone="purple" icon={<HarinIcon name="link" size={20}/>} label="실상품 매칭" value={`${linkedOther}개`} sub={`원가 입력 ${sellableCosts.length}개`}/></section>{workspace==='catalog'?<>{platform==='all'?<UnifiedProductOperationsCenter center={productOperations}/>:null}<HarinProgressiveDetails className="productSourceCatalogDisclosure" eyebrow="원본 상품 자료" title="Cafe24 상품 분류·전체 목록" description="판매중단·품절·제외 상품까지 원본 상태를 확인할 때만 펼쳐보세요." count={`${products.length}개`} action="원본 목록 열기"><Cafe24Catalog products={products}/></HarinProgressiveDetails></>:null}{workspace==='mappings'?<><ProductMappingWorkbench mapping={mapping} masterProducts={sellableMasterProducts}/>{mappingStatus}</>:null}{workspace==='costs'?<><FinancialReadinessCenter readiness={financialReadiness} showAdTargets={false}/><CostManager masterProducts={sellableMasterProducts} productCosts={sellableCosts} channelCostSettings={channelCostSettings} channelShippingRules={channelShippingRules} shippingRuleEvidence={shippingRuleEvidence}/></>:null}{workspace==='profit'?<UnifiedProductPerformance performance={visibleUnifiedPerformance}/>:null}{workspace==='offers'?<ProductGrowthCenter unifiedPerformance={visibleUnifiedPerformance}/>:null}{workspace==='ad-targets'?<ProductAdTargetsCenter center={visibleTargets}/>:null}</>;
}

function UnifiedProductPerformance({ performance={} }) {
  const summary=performance.summary||{}, items=performance.items||[];
  const trusted=performance.financial_trust?.status==='READY';
  return <article className="panel unifiedPerformancePanel"><PanelTitle tag="MASTER PRODUCT PERFORMANCE" title="플랫폼 통합 상품 실적" right={`${performance.period_start||'-'} ~ ${performance.period_end||'-'}`}/><div className="mappingSummaryGrid"><span><small>통합 매출</small><b>{won(summary.revenue)}</b></span><span><small>귀속 광고비</small><b>{won(summary.ad_spend)}</b></span><span><small>공헌이익</small><b>{trusted?won(summary.contribution_profit):'미산정'}</b></span><span><small>실적 상품</small><b>{count(summary.active_products)}개</b></span></div><div className="unifiedPerformanceTable"><div className="unifiedPerformanceHead"><span>기준상품</span><span>Cafe24 실매출</span><span>네이버 전환매출</span><span>쿠팡 실매출</span><span>광고비 · ROAS</span><span>공헌이익</span></div>{items.slice(0,40).map(item=><div className="unifiedPerformanceRow" key={item.master_product_id}><span><b>{item.name}</b><small>주문 {count(item.orders)}건 · 판매/전환 {count(item.units)}개</small></span><em>{won(item.channels?.CAFE24?.revenue)}</em><em>{won(item.channels?.NAVER?.revenue)}</em><em>{won(item.channels?.COUPANG?.revenue)}</em><span><b>{won(item.ad_spend)}</b><small>{!trusted?'미귀속 광고비 연결 후 ROAS 산정':item.roas==null?'ROAS 계산 대기':`ROAS ${num(item.roas).toFixed(0)}%`}</small></span><strong className={trusted&&item.cost_status==='CALCULATED'&&num(item.contribution_profit)<0?'negative':''}>{trusted&&item.cost_status==='CALCULATED'?won(item.contribution_profit):'미산정'}</strong></div>)}</div>{!items.length&&<Empty>상품 매핑 후 채널별 실적이 이 표에 합쳐집니다.</Empty>}<p className="comparisonNote">Cafe24·쿠팡은 주문 실매출, 네이버는 매핑된 광고그룹의 키워드 전환매출입니다. 쿠팡 키워드 광고비는 상품명이 충분히 일치하는 경우에만 귀속하며, 미귀속 {won(summary.coupang_ad_spend_unassigned)}은 상품 ROAS에서 제외합니다. 기대비용에는 반품 {won(summary.return_reserve)}·도서산간 {won(summary.remote_area_reserve)} 충당금이 포함됩니다.</p></article>;
}

function ProductMappingCandidate({ item, masterProducts, onMutate, working, selected, onSelect }) {
  const [masterId,setMasterId]=useState(item.candidates?.[0]?.master_product_id||masterProducts[0]?.id||'');
  const best=item.candidates?.[0];
  const isNaver=item.platform==='NAVER',platformLabel=isNaver?'네이버 스마트스토어':'쿠팡 실상품';
  const chosen=item.candidates?.find(candidate=>candidate.master_product_id===masterId);
  return <div className={`mappingCandidateRow ${selected?'selected':''}`}><HarinBulkCheckbox checked={selected} onChange={event=>onSelect(event.target.checked)} label={`${item.external_product_name} 선택`}/><div className="mappingSource"><i data-platform={item.platform.toLowerCase()}><HarinIcon name={isNaver?'naver':'coupang'} size={20}/></i><div><span className={`platformPill ${item.platform.toLowerCase()}`}>{platformLabel}</span><b>{item.external_product_name}</b><small>외부 ID {item.external_product_id}{item.auto_eligible?' · 자동연결 가능':' · 확인 후 연결'}</small></div></div><div className="mappingSuggestion"><label><HarinIcon name="link" size={16}/> Cafe24 기준상품 선택</label><select value={masterId} onChange={event=>setMasterId(event.target.value)}>{masterProducts.map(master=><option value={master.id} key={master.id}>{master.name}</option>)}</select><small>{chosen?`추천 ${chosen.confidence}% · ${chosen.reasons.join(' · ')}`:best?`최고 추천 ${best.confidence}%`:'추천 점수 없음 · 기준상품 직접 선택'}</small></div><div className="mappingActions"><button disabled={!masterId||Boolean(working)} onClick={()=>onMutate({action:'LINK',platform:item.platform,external_product_id:item.external_product_id,master_product_id:masterId},`${item.platform}:${item.external_product_id}`)}><HarinIcon name="link" size={15}/>연결</button><button className="secondaryButton" disabled={!masterId||Boolean(working)} onClick={()=>onMutate({action:'REJECT',platform:item.platform,external_product_id:item.external_product_id,master_product_id:masterId},`${item.platform}:${item.external_product_id}`)}>이 추천 제외</button></div></div>;
}

function ProductMappingWorkbench({ mapping={}, masterProducts=[] }) {
  const [currentMapping,setCurrentMapping]=useState(mapping);
  useEffect(()=>setCurrentMapping(mapping),[mapping]);
  const summary=currentMapping.summary||{}, candidates=currentMapping.candidates||[], links=currentMapping.links||[];
  const [view,setView]=useStoredState('filter:product-mapping-view','CANDIDATES',['CANDIDATES','LINKED']);
  const [platform,setPlatform]=useStoredState('filter:product-mapping-platform','NAVER',['NAVER','COUPANG']);
  const [working,setWorking]=useState(''),[message,setMessage]=useState('');
  const [search,setSearch]=useState(''),[showCount,setShowCount]=useState(30);
  const channelRows=(view==='CANDIDATES'?candidates:links).filter(item=>item.platform===platform);
  const needle=search.trim().toLowerCase();
  const filteredRows=channelRows.filter(item=>!needle||`${item.external_product_name||''} ${item.external_product_id||''}`.toLowerCase().includes(needle));
  const visibleRows=filteredRows.slice(0,showCount);
  const rowKey=item=>`${item.platform}:${item.external_product_id}`;
  const selection=useHarinBulkSelection({allIds:channelRows.map(rowKey),filteredIds:filteredRows.map(rowKey),visibleIds:visibleRows.map(rowKey)});
  useEffect(()=>setShowCount(30),[platform,view,search]);
  const platformName=platform==='NAVER'?'네이버 스마트스토어':'쿠팡',platformIcon=platform==='NAVER'?'naver':'coupang';
  const candidateCount=Number(platform==='NAVER'?summary.candidate_naver:summary.candidate_coupang)||0,autoCount=Number(platform==='NAVER'?summary.auto_naver:summary.auto_coupang)||0;
  const masterNames=new Map(masterProducts.map(item=>[item.id,item.name]));
  const selectedRows=channelRows.filter(item=>selection.selectedSet.has(rowKey(item)));
  const selectedAutoCount=selectedRows.filter(item=>item.auto_eligible&&item.candidates?.[0]?.master_product_id).length;
  async function mutate(payload,key){
    if(payload.action==='AUTO_LINK_ALL'&&!window.confirm(`${platformName} 고신뢰 후보 ${autoCount}개를 자동 연결할까요?`))return;
    if(payload.action==='UNLINK'&&!window.confirm('이 채널 상품의 연결을 해제할까요?'))return;
    setWorking(key);setMessage('매핑을 저장하는 중…');
    try{
      const response=await fetch('/api/products/mappings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'매핑 저장 실패');
      const refreshedResponse=await fetch('/api/products/mappings',{cache:'no-store'});
      const refreshed=await refreshedResponse.json();
      if(refreshedResponse.ok&&refreshed.ok)setCurrentMapping({summary:refreshed.summary,candidates:refreshed.candidates,links:refreshed.links});
      const bulk=payload.action.startsWith('BULK_');
      setMessage(bulk?`일괄 작업 ${result.result?.processed||0}개 완료${result.result?.failed?` · 실패 ${result.result.failed}개`:''}${result.result?.skipped?` · 조건 불일치 ${result.result.skipped}개`:''} · 목록에 바로 반영했습니다.`:payload.action==='AUTO_LINK_ALL'?`자동연결 ${result.result?.linked||0}개 완료 · 목록에 바로 반영했습니다.`:'매핑을 저장하고 목록에 바로 반영했습니다.');
      selection.clear();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function runBulk(action){
    const eligible=action==='BULK_AUTO_LINK'?selectedRows.filter(item=>item.auto_eligible&&item.candidates?.[0]?.master_product_id):action==='BULK_REJECT'?selectedRows.filter(item=>item.candidates?.[0]?.master_product_id):selectedRows;
    if(!eligible.length){setMessage('선택 항목 중 이 작업을 적용할 수 있는 상품이 없습니다.');return;}
    const label=action==='BULK_AUTO_LINK'?'자동 연결':action==='BULK_REJECT'?'추천 제외':'연결 해제';
    if(!window.confirm(`${platformName} 선택 상품 ${eligible.length}개를 ${label}할까요? 다른 채널 상품에는 적용되지 않습니다.`))return;
    await mutate({action,platform,external_product_ids:eligible.map(item=>item.external_product_id)},`BULK:${action}`);
  }
  return <article className="panel productMappingWorkbench productMappingRealOnly"><div className="mappingPlatformTabs" aria-label="실상품 연결 채널">{[['NAVER','naver','네이버 스마트스토어'],['COUPANG','coupang','쿠팡']].map(([id,icon,label])=><button type="button" className={platform===id?'active':''} onClick={()=>setPlatform(id)} key={id}><HarinIcon name={icon} size={18}/><span><b>{label}</b><small>{count(id==='NAVER'?summary.source_naver:summary.source_coupang)}개 수집</small></span></button>)}</div><div className="mappingWorkbenchHead"><div className="mappingWorkbenchTitle"><i><HarinIcon name={platformIcon} size={23}/></i><PanelTitle tag={`${platform} COMMERCE PRODUCT`} title={`${platformName} 실상품 연결`} right={`후보 ${count(candidateCount)}개`}/></div><button disabled={!autoCount||Boolean(working)} onClick={()=>mutate({action:'AUTO_LINK_ALL',platform},'AUTO')}><HarinIcon name="sparkles" size={16}/>{working==='AUTO'?'자동연결 중…':`고신뢰 ${count(autoCount)}개 자동연결`}</button></div><div className="mappingSummaryGrid"><span><HarinIcon name={platformIcon} size={18}/><small>{platformName} 수집 상품</small><b>{count(platform==='NAVER'?summary.source_naver:summary.source_coupang)}개</b></span><span><HarinIcon name="link" size={18}/><small>{platformName} 연결 완료</small><b>{count(platform==='NAVER'?summary.linked_naver:summary.linked_coupang)}개</b></span><span><HarinIcon name="checklist" size={18}/><small>검토 후보</small><b>{count(candidateCount)}개</b></span><span><HarinIcon name="sparkles" size={18}/><small>고신뢰 자동후보</small><b>{count(autoCount)}개</b></span></div><div className="mappingToolbar"><div>{[['CANDIDATES','연결 후보'],['LINKED','연결 완료']].map(([id,label])=><button className={view===id?'active':''} onClick={()=>setView(id)} key={id}>{label}</button>)}</div><label className="mappingSearch"><HarinIcon name="search" size={16}/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={`${platformName} 상품명·ID 검색`}/></label><p><HarinIcon name="shield" size={15}/> 네이버 광고그룹 제외</p></div><HarinBulkSelectionBar selectedCount={selection.selectedCount} visibleCount={visibleRows.length} filteredCount={filteredRows.length} visibleState={selection.visibleState} filteredState={selection.filteredState} onToggleVisible={checked=>selection.toggleScope(visibleRows.map(rowKey),checked)} onToggleFiltered={checked=>selection.toggleScope(filteredRows.map(rowKey),checked)} onClear={selection.clear} summary={`${platformName} ${view==='CANDIDATES'?'연결 후보':'연결 완료'}에서만 선택됩니다.`} preview={view==='CANDIDATES'?`선택 중 고신뢰 자동연결 가능 ${selectedAutoCount}개 · 채널 간 상품은 섞이지 않습니다.`:'선택한 연결만 해제하며 다른 채널 매핑은 유지합니다.'}>{view==='CANDIDATES'?<><button type="button" disabled={!selectedAutoCount||Boolean(working)} onClick={()=>runBulk('BULK_AUTO_LINK')}>선택 고신뢰 {selectedAutoCount}개 자동연결</button><button type="button" className="secondary" disabled={!selection.selectedCount||Boolean(working)} onClick={()=>runBulk('BULK_REJECT')}>선택 추천 제외</button></>:<button type="button" className="danger" disabled={!selection.selectedCount||Boolean(working)} onClick={()=>runBulk('BULK_UNLINK')}>선택 연결 해제</button>}</HarinBulkSelectionBar>{message&&<div className="mappingMessage">{message}</div>}{view==='CANDIDATES'?<div className="mappingCandidateList">{visibleRows.map(item=><ProductMappingCandidate item={item} masterProducts={masterProducts} onMutate={mutate} working={working} selected={selection.isSelected(rowKey(item))} onSelect={checked=>selection.toggle(rowKey(item),checked)} key={rowKey(item)}/>)}{!filteredRows.length&&<Empty>검토할 {platformName} 실상품 후보가 없습니다.</Empty>}</div>:<div className="mappingLinkedList">{visibleRows.map(item=><div className={`mappingLinkedRow ${selection.isSelected(rowKey(item))?'selected':''}`} key={item.id}><HarinBulkCheckbox checked={selection.isSelected(rowKey(item))} onChange={event=>selection.toggle(rowKey(item),event.target.checked)} label={`${item.external_product_name} 선택`}/><div><i data-platform={item.platform.toLowerCase()}><HarinIcon name={item.platform==='NAVER'?'naver':'coupang'} size={18}/></i><b>{item.external_product_name}</b><small>→ {masterNames.get(item.master_product_id)||'기준상품 확인 필요'}</small></div><span>{item.match_method==='AUTO'?'자동':'수동'} {item.match_confidence!=null?`${Math.round(num(item.match_confidence)*100)}%`:''}</span><button className="secondaryButton" disabled={Boolean(working)} onClick={()=>mutate({action:'UNLINK',platform:item.platform,external_product_id:item.external_product_id},rowKey(item))}>연결 해제</button></div>)}{!filteredRows.length&&<Empty>연결된 {platformName} 실상품이 없습니다.</Empty>}</div>}{visibleRows.length<filteredRows.length?<button className="opsLoadMore" type="button" onClick={()=>setShowCount(value=>value+30)}>상품 30개 더 보기 <small>{visibleRows.length}/{filteredRows.length}</small></button>:null}<p className="comparisonNote"><HarinIcon name="shield" size={15}/> 네이버 광고그룹은 계속 제외됩니다. 스마트스토어 실상품과 쿠팡 판매상품은 채널별 탭에서 따로 연결합니다.</p></article>;
}

const shippingPlatforms=[['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡']];

function ShippingRuleManager({ rules=[], evidence={} }) {
  const [rows,setRows]=useState(()=>Object.fromEntries(shippingPlatforms.map(([platform])=>{const rule=rules.find(item=>item.platform===platform)||{};return [platform,{return_shipping_cost:num(rule.return_shipping_cost),return_rate:num(rule.return_rate)*100,remote_area_surcharge:num(rule.remote_area_surcharge),remote_area_rate:num(rule.remote_area_rate)*100,notes:rule.notes||''}]})));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  function change(platform,field,value){setRows(current=>({...current,[platform]:{...current[platform],[field]:value}}));}
  async function saveRule(platform){if(!window.confirm(`${platform} 반품·도서산간 비용 규칙을 지금 변경할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.`))return;setSaving(platform);setMessage(`${platform} 변경 전후 확인 후 바로 적용하는 중…`);try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'SHIPPING_RULE',platform,...rows[platform]})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);setMessage(`${platform} 비용 규칙 변경 완료 · 실제 저장값도 확인했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  return <section className="shippingRulePanel"><header><div><span>EXPECTED SHIPPING LOSS</span><b>반품·도서산간 비용 규칙</b><small>주문당 기대비용을 플랫폼별 공헌이익에 자동 배분합니다.</small></div><em>주소정보 저장 안 함</em></header><div className="shippingRuleHead"><span>플랫폼</span><span>반품 택배비</span><span>예상 반품률</span><span>도서산간 추가비</span><span>예상 주문비율</span><span>주문당 충당금</span><span>저장</span></div><div className="shippingRuleRows">{shippingPlatforms.map(([platform,label])=>{const row=rows[platform]||{};const reserve=num(row.return_shipping_cost)*num(row.return_rate)/100+num(row.remote_area_surcharge)*num(row.remote_area_rate)/100;return <div className="shippingRuleRow" key={platform}><b>{label}</b><label><span>반품 택배비</span><input type="number" min="0" step="100" value={row.return_shipping_cost} onChange={event=>change(platform,'return_shipping_cost',event.target.value)}/></label><label><span>예상 반품률</span><input type="number" min="0" max="100" step="0.01" value={row.return_rate} onChange={event=>change(platform,'return_rate',event.target.value)}/><small>%</small></label><label><span>도서산간 추가비</span><input type="number" min="0" step="100" value={row.remote_area_surcharge} onChange={event=>change(platform,'remote_area_surcharge',event.target.value)}/></label><label><span>예상 주문비율</span><input type="number" min="0" max="100" step="0.01" value={row.remote_area_rate} onChange={event=>change(platform,'remote_area_rate',event.target.value)}/><small>%</small></label><strong>{won(reserve)}</strong><button type="button" disabled={saving===platform} onClick={()=>saveRule(platform)}>{saving===platform?'저장 중':'저장'}</button></div>})}</div><div className="shippingEvidence"><div><span>COUPANG ACTUAL SAMPLE</span><b>실데이터 검증 표본</b><small>반품 {count(evidence.return_cases)}건 · 비용 확인 {count(evidence.return_cost_orders)}건 · 실제 반품비 {won(evidence.actual_return_cost)}</small></div><div><small>배송비 주문 {count(evidence.shipping_orders)}건 · 도서산간 추가비 확인 {count(evidence.remote_orders)}건 · 실제 추가비 {won(evidence.actual_remote_cost)}</small><em>신뢰도 {evidence.return_confidence||'LOW'} / {evidence.remote_confidence||'LOW'}</em></div></div>{message&&<small className="costMessage">{message}</small>}<p className="shippingPrivacyNote">개별 배송지나 고객 주소는 이 계산에 저장·사용하지 않습니다. 실비 표본이 충분해질 때까지 입력한 규칙을 유지합니다.</p></section>;
}

const PRODUCT_COST_FILTERS=[['PENDING','확인 필요'],['ALL','전체'],['READY','입력 완료']];
const PRODUCT_COST_LABELS={unit_cost:'상품 원가',packaging_cost:'포장비',other_unit_cost:'기타 단위비'};

function ProductCostQuickGrid({ masterProducts, rows, setRows, saving, onSaveRows }) {
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('PENDING');
  const [page,setPage]=useState(1);
  const [dirtyIds,setDirtyIds]=useState([]);
  const progress=useMemo(()=>summarizeCostProgress(masterProducts,rows),[masterProducts,rows]);
  const searchedProducts=useMemo(()=>filterCostProducts(masterProducts,rows,search),[masterProducts,rows,search]);
  const filteredProducts=useMemo(()=>searchedProducts.filter(product=>{
    if(filter==='READY')return costStatus(rows[product.id]).ready;
    if(filter==='PENDING')return !costStatus(rows[product.id]).ready;
    return true;
  }),[searchedProducts,filter,rows]);
  const pagedProducts=useMemo(()=>paginateCostProducts(filteredProducts,page,COST_PAGE_SIZE),[filteredProducts,page]);
  const dirtyReadyIds=dirtyIds.filter(id=>costStatus(rows[id]).ready);
  const dirtyPendingIds=dirtyIds.filter(id=>!costStatus(rows[id]).ready);

  function changeFilter(next){setFilter(next);setPage(1);}
  function changeSearch(value){setSearch(value);setPage(1);}
  function movePage(next){setPage(paginateCostProducts(filteredProducts,next,COST_PAGE_SIZE).currentPage);}
  function changeCost(productId,field,value){
    setRows(current=>({...current,[productId]:{...(current[productId]||{}),[field]:value}}));
    setDirtyIds(current=>current.includes(productId)?current:[...current,productId]);
  }
  async function saveProducts(products){
    if(!products.length)return;
    const result=await onSaveRows(products);
    if(result?.successIds?.length)setDirtyIds(current=>current.filter(id=>!result.successIds.includes(id)));
  }

  return <section className="productCostWorkbench productCostSpreadsheet">
    <header className="productCostWorkbenchHeader">
      <div><span>빠른 원가 입력</span><h3>판매중 상품을 표에서 바로 입력해요</h3><p>상품 원가 → 포장비 → 기타 비용 순서로 Tab 키를 누르면 다음 칸으로 이동합니다.</p></div>
      <label><HarinIcon name="search" size={18}/><input type="search" value={search} onChange={event=>changeSearch(event.target.value)} placeholder="상품명 검색"/></label>
    </header>
    <div className="productCostProgress" aria-label={`원가 입력 진행률 ${progress.rate}%`}>
      <div><span><b>{progress.ready}</b> / {progress.total}개 입력 완료</span><strong>{progress.rate}%</strong></div>
      <i><em style={{width:`${progress.rate}%`}}/></i>
      <p>{progress.pending?`원가 ${progress.pending}개를 더 확인하면 상품별 실제 이익 계산이 열려요.`:'판매중 상품의 원가 입력이 모두 끝났어요.'}</p>
    </div>
    <div className="productCostQuickToolbar">
      <nav aria-label="원가 입력 상태">{PRODUCT_COST_FILTERS.map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>changeFilter(id)} key={id}>{label}<b>{id==='READY'?progress.ready:id==='PENDING'?progress.pending:progress.total}</b></button>)}</nav>
      <div><span>{dirtyPendingIds.length?`작성 중 ${dirtyPendingIds.length}개 · 빈칸 확인 필요`:dirtyReadyIds.length?'저장할 준비가 됐어요':'바꾼 값이 없습니다.'}</span><button type="button" disabled={!dirtyReadyIds.length||saving==='cost-bulk'} onClick={()=>saveProducts(masterProducts.filter(product=>dirtyReadyIds.includes(product.id)))}><HarinIcon name="checklist" size={16}/>{saving==='cost-bulk'?'저장·검증 중…':`작성한 ${dirtyReadyIds.length}개 저장`}</button></div>
    </div>
    <div className="productCostQuickGrid" role="table" aria-label="판매중 상품 원가 빠른 입력">
      <div className="productCostQuickHead" role="row"><span>판매중 상품</span>{COST_FIELDS.map(field=><span key={field}>{PRODUCT_COST_LABELS[field]}</span>)}<span>입력 상태</span></div>
      <div className="productCostQuickRows">{pagedProducts.items.map(product=>{const row=rows[product.id]||{};const status=costStatus(row);const dirty=dirtyIds.includes(product.id);return <article className={`${dirty?'dirty ':''}${status.ready?'ready':'pending'}`} role="row" key={product.id}>
        <div className="productCostQuickIdentity"><i><HarinIcon name="product" size={18}/></i><span><b>{product.name}</b><small>{product.id}</small></span></div>
        {COST_FIELDS.map(field=><label key={field}><span>{PRODUCT_COST_LABELS[field]}</span><input aria-label={`${product.name} ${PRODUCT_COST_LABELS[field]}`} type="number" min="0" step="100" inputMode="numeric" placeholder="비워두기" value={row[field]??''} onChange={event=>changeCost(product.id,field,event.target.value)}/></label>)}
        <aside><em>{dirty?(status.ready?'저장 대기':status.label):status.label}</em><button type="button" disabled={!dirty||!status.ready||saving==='cost-bulk'} onClick={()=>saveProducts([product])}>{saving==='cost-bulk'?'처리 중':'저장'}</button></aside>
      </article>})}{!pagedProducts.items.length?<Empty>이 조건에 맞는 판매중 상품이 없습니다.</Empty>:null}</div>
      <footer className="productCostPager"><span>{pagedProducts.start}-{pagedProducts.end} / {pagedProducts.total}개</span><div><button type="button" disabled={pagedProducts.currentPage<=1} onClick={()=>movePage(pagedProducts.currentPage-1)}>이전</button><b>{pagedProducts.currentPage} / {pagedProducts.totalPages}</b><button type="button" disabled={pagedProducts.currentPage>=pagedProducts.totalPages} onClick={()=>movePage(pagedProducts.currentPage+1)}>다음</button></div></footer>
    </div>
    <p className="productCostSafety"><HarinIcon name="shield" size={16}/> 모르는 비용은 빈칸으로 두세요. 빈칸은 0원으로 저장하지 않고 수익성 화면에서 ‘판단 보류’로 유지합니다.</p>
  </section>;
}

function CostManager({ masterProducts, productCosts, channelCostSettings, channelShippingRules, shippingRuleEvidence }) {
  const initialChannel=channelCostSettings.find(item=>item.platform==='CAFE24')||{};
  const costCalibration=channelCostSettings.find(item=>item.platform==='COUPANG')?.cost_calibration||{};
  const [channel,setChannel]=useState({commission_rate:num(initialChannel.commission_rate)*100,payment_fee_rate:num(initialChannel.payment_fee_rate)*100,default_shipping_cost:num(initialChannel.default_shipping_cost)});
  const [rows,setRows]=useState(()=>Object.fromEntries(masterProducts.map(item=>{const cost=productCosts.find(row=>row.master_product_id===item.id)||{};return [item.id,Object.fromEntries(COST_FIELDS.map(field=>[field,cost[field]==null?'':num(cost[field])]))]})));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  async function executeFinancialPayload(payload){const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);return result;}
  async function save(payload,key){if(!window.confirm('입력한 비용을 지금 변경할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.'))return;setSaving(key);setMessage('변경 전후 확인 후 바로 적용하는 중…');try{await executeFinancialPayload(payload);setMessage('변경 완료 · 실제 저장값 재확인까지 끝났습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  async function saveCostRows(products){
    if(!products.length)return {successIds:[]};
    if(!window.confirm(`작성한 상품 원가 ${products.length}개를 한 번에 저장할까요?\n상품마다 변경 전후 값과 실행 결과가 기록됩니다.`))return {successIds:[]};
    setSaving('cost-bulk');setMessage(`상품 원가 ${products.length}개를 순서대로 저장·검증하고 있어요…`);
    const successIds=[],failures=[];
    for(const product of products){
      try{await executeFinancialPayload({type:'PRODUCT',master_product_id:product.id,...(rows[product.id]||{})});successIds.push(product.id);}
      catch(error){failures.push(`${product.name}: ${error.message}`);}
    }
    setMessage(failures.length?`원가 ${successIds.length}개 저장 완료 · ${failures.length}개 확인 필요 (${failures[0]})`:`원가 ${successIds.length}개 저장 완료 · 실제 저장값 확인까지 끝났습니다.`);
    setSaving('');return {successIds,failures};
  }
  async function applyCalibration(){if(!window.confirm('쿠팡 실제 정산값을 기본 비용 설정으로 저장할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.'))return;setSaving('calibration');setMessage('실제 정산값을 확인하고 바로 적용하는 중…');try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'COUPANG_CALIBRATION_APPLY'})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'보정 준비 실패');await executeConfirmedFinancialPreview(result);setMessage('쿠팡 실제값 적용 완료 · 실제 저장값도 확인했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  const commission=costCalibration.commission||{},logistics=costCalibration.logistics||{},assumed=costCalibration.assumed_setting||{},effective=costCalibration.effective_setting||{};
  return <article className="panel costPanel"><PanelTitle tag="PROFIT SETTINGS" title="원가·수수료·택배비" right="서버 계산"/><p className="costGuide">수수료는 퍼센트, 상품 비용과 배송비는 원 단위입니다. 모르는 비용은 0원으로 확정하지 말고 비워두세요.</p><div className="channelCostRow"><b>Cafe24 공통비용</b><label>판매수수료 %<input type="number" min="0" max="100" step="0.01" value={channel.commission_rate} onChange={e=>setChannel({...channel,commission_rate:e.target.value})}/></label><label>결제수수료 %<input type="number" min="0" max="100" step="0.01" value={channel.payment_fee_rate} onChange={e=>setChannel({...channel,payment_fee_rate:e.target.value})}/></label><label>주문당 택배비<input type="number" min="0" step="100" value={channel.default_shipping_cost} onChange={e=>setChannel({...channel,default_shipping_cost:e.target.value})}/></label><button disabled={saving==='channel'} onClick={()=>save({type:'CHANNEL',platform:'CAFE24',...channel},'channel')}>공통비용 저장</button></div><section className={`calibrationCard ${String(costCalibration.confidence||'LOW').toLowerCase()}`}><header><div><span>COUPANG ACTUAL COST</span><b>실제 정산 자동 보정</b><small>{costCalibration.period_start||'-'} ~ {costCalibration.period_end||'-'} · 신뢰도 {costCalibration.confidence||'LOW'}</small></div><em>{costCalibration.auto_applied?'통합 손익에 자동 반영':'수동 설정 유지'}</em></header><div className="calibrationMetrics"><span><small>실제 수수료율</small><b>{commission.actualRate==null?'-':`${(num(commission.actualRate)*100).toFixed(2)}%`}</b><em>수동 {((num(assumed.commission_rate)+num(assumed.payment_fee_rate))*100).toFixed(2)}% · {count(commission.orders)}주문</em></span><span><small>실제 주문당 물류비</small><b>{logistics.actualPerOrder==null?'-':won(logistics.actualPerOrder)}</b><em>수동 {won(assumed.default_shipping_cost)} · {count(logistics.orders)}주문</em></span><span><small>현재 계산 적용값</small><b>{((num(effective.commission_rate)+num(effective.payment_fee_rate))*100).toFixed(2)}%</b><em>주문당 {won(effective.default_shipping_cost)}</em></span></div><footer><p>{costCalibration.auto_applied?'확정 정산 API 수수료와 WING 배송·입출고 실비를 사용합니다. 표본이 부족해지면 자동으로 수동 설정으로 돌아갑니다.':(costCalibration.warnings||[]).join(' ')||'정산 데이터 수집 후 자동 계산됩니다.'}</p><button disabled={!costCalibration.auto_applied||saving==='calibration'} onClick={applyCalibration}>{saving==='calibration'?'반영 중…':'실제값을 기본 설정으로 저장'}</button></footer></section><ShippingRuleManager rules={channelShippingRules} evidence={shippingRuleEvidence}/><ProductCostQuickGrid masterProducts={masterProducts} rows={rows} setRows={setRows} saving={saving} onSaveRows={saveCostRows}/>{message&&<small className="costMessage" role="status">{message}</small>}</article>;
}

function SyncTable({ syncs }) { return <div className="syncTable"><div className="syncHeader"><span>실행일시</span><span>상태</span><span>저장 결과</span></div>{syncs.map(log=>{const counts=log.metadata?.counts||{};const detail=log.platform==='NAVER'&&log.job_type==='COMMERCE_SYNC'?`네이버 커머스 · 상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 문의/클레임 ${count(Number(counts.inquiries||0)+Number(counts.claims||0))} · 정산 ${count(counts.settlements)}`:log.platform==='NAVER'?`네이버 광고 · 캠페인 ${count(counts.campaigns)} · 키워드 ${count(counts.keywords)}`:log.platform==='COUPANG'?`쿠팡 · 재고 ${count(counts.rgInventory)} · 품절 ${count(counts.rgOutOfStock??counts.outOfStock)} · 주문 ${count(counts.orders)} · 정산 ${count(counts.settlements)}`:`Cafe24 · 상품 ${count(counts.products)} · 주문 ${count(counts.orders)} · 트래픽 ${count(counts.traffic)}`;return <div className="syncRow" key={log.id}><span>{dateTime(log.started_at)}</span><span className={`status ${String(log.status).toLowerCase()}`}>{log.status}</span><span>{log.metadata?.counts?detail:`${log.platform||'플랫폼'} · ${count(log.rows_received)}건`}</span></div>})}</div>; }
