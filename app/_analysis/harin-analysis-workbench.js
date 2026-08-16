'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStoredState } from '../use-hub-preference.js';
import { HarinIcon } from '../_design-system/harin-icon.js';
import { HarinPageAiRegion, HarinPageContent, HarinPageFrame, HarinPageHeader, HarinPageToolbar } from '../_design-system/harin-ui.js';
import KeywordOperationsTable from './keyword-operations-table.js';

const PLATFORM_LABELS={all:'전체',naver:'네이버',coupang:'쿠팡',cafe24:'Cafe24'};
const WORKSPACE_META={
  insight:{
    overview:['오늘의 성과판','매출·광고·이익 변화와 이상징후를 한 번에 확인해요.'],
    causes:['왜 달라졌는지 찾기','좋아지거나 나빠진 숫자의 원인과 다음 행동을 연결해요.'],
    channels:['채널별 성과 비교','네이버·쿠팡·Cafe24를 같은 기준으로 나란히 살펴봐요.'],
    profitability:['실제 수익성 분석','매출에서 원가·수수료·배송비·광고비를 빼고 실제 남는 돈을 확인해요.']
  },
  keyword:{
    'search-terms':['고객이 실제로 검색한 말','등록 키워드와 분리해 고객 검색어의 기회와 낭비를 결정해요.'],
    registered:['광고 키워드 운영','네이버와 쿠팡을 나눠 각 플랫폼 키워드의 성과와 변경 초안을 관리해요.'],
    diagnosis:['절감·확대 후보','실제 매출과 원가 안전선을 함께 보고 확장·감액을 판단해요.'],
    history:['변경 기록·성과검증','승인한 입찰 변경과 실행 이후의 결과를 이어서 확인해요.']
  },
  product:{
    catalog:['판매 상품목록','판매 가능한 상품을 중심으로 채널별 상태를 빠르게 확인해요.'],
    mappings:['채널 상품매칭','같은 상품을 네이버·쿠팡·Cafe24 사이에서 정확히 연결해요.'],
    costs:['원가·공통비용','실제 비용을 채워 이익과 광고 안전선 계산을 열어요.'],
    profit:['상품별 실제 이익','채널 매출에서 원가·수수료·배송비·광고비를 뺀 금액을 봐요.'],
    offers:['판매구성 비교','1개·2개·묶음 구성별로 실제 남는 금액을 비교해요.'],
    'ad-targets':['상품별 광고 목표','상품마다 다른 목표 ROAS·CPA·CPC 안전선을 계산해요.']
  }
};

const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const count=value=>Number(value||0).toLocaleString('ko-KR');
const won=value=>value==null?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const percent=value=>value==null?'판단 보류':`${Number(value).toFixed(1)}%`;
const scopePlatform=(value,platform)=>platform==='all'||String(value||'ALL').toLowerCase()===platform||String(value||'ALL').toUpperCase()==='ALL';

function Pictogram({type}){
  if(type==='keyword')return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="m14.5 14.5 5 5M8 10h4M10 8v4"/></svg>;
  if(type==='product')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m6 14v-7m5 7V3"/><path d="m3 15 5-5 5 2 7-7"/></svg>;
}

function reportMetric(report,platform){
  const summary=report?.summary_json||{},profit=summary.profitability||{},naver=summary.naver||{},coupang=summary.coupang||{},cafe=summary.cafe24||{};
  if(platform==='naver')return [
    ['광고비',number(naver.ad_spend??naver.spend??naver.cost),'money'],
    ['전환매출',number(naver.revenue??naver.conversion_revenue),'money'],
    ['ROAS',number(naver.roas??profit.paid_roas),'percent']
  ];
  if(platform==='coupang')return [
    ['매출',number(coupang.revenue??coupang.gross_sales),'money'],
    ['광고비',number(coupang.ad_spend),'money'],
    ['ROAS',number(coupang.ad_roas??coupang.roas),'percent']
  ];
  if(platform==='cafe24')return [
    ['매출',number(cafe.revenue),'money'],
    ['주문',number(cafe.orders),'count'],
    ['전환율',number(cafe.conversion_rate),'percent']
  ];
  return [
    ['통합 순매출',number(profit.net_sales),'money'],
    ['Paid ROAS',number(profit.paid_roas),'percent'],
    ['공헌이익',number(profit.contribution_profit),'money']
  ];
}

function displayMetric(value,type){
  if(value==null)return '판단 보류';
  if(type==='money')return won(value);
  if(type==='percent')return percent(value);
  return `${count(value)}건`;
}

function InsightComparison({reports=[],alerts=[],platform}){
  const scoped=useMemo(()=>reports.filter(report=>scopePlatform(report.platform,platform)&&report.summary_json),[reports,platform]);
  const defaults=[scoped[0]?.id||'',scoped[1]?.id||scoped[0]?.id||''];
  const [saved,setSaved]=useStoredState(`analysis:comparison:${platform}`,defaults);
  const savedSelection=Array.isArray(saved)&&saved.length===2?saved:defaults;
  const [selection,setSelection]=useState(savedSelection);
  useEffect(()=>setSelection(savedSelection),[platform,savedSelection[0],savedSelection[1]]);
  const current=scoped.find(item=>item.id===selection[0])||scoped[0];
  const baseline=scoped.find(item=>item.id===selection[1])||scoped[1]||scoped[0];
  const metrics=reportMetric(current,platform), baselineMetrics=reportMetric(baseline,platform);
  const scopedAlerts=alerts.filter(item=>item.source_type==='ANOMALY'&&scopePlatform(item.platform,platform));
  const [selectedAlert,setSelectedAlert]=useState(scopedAlerts[0]?.id||'');
  const activeAlert=scopedAlerts.find(item=>item.id===selectedAlert)||scopedAlerts[0];
  return <section className="analysisDecisionGrid" id="analysis-decision-desk">
    <article className="analysisCompareCard">
      <header><div><span>SAVED COMPARISON</span><h2>보고서 두 개를 같은 기준으로 비교해요</h2></div><em>{saved[0]===selection[0]&&saved[1]===selection[1]?'저장된 비교':'저장 전'}</em></header>
      <div className="analysisCompareSelectors"><label><span>현재 보고서</span><select value={current?.id||''} onChange={event=>setSelection([event.target.value,selection[1]])}>{scoped.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label><i aria-hidden="true">→</i><label><span>비교 기준</span><select value={baseline?.id||''} onChange={event=>setSelection([selection[0],event.target.value])}>{scoped.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label></div>
      <div className="analysisCompareMetrics">{metrics.map(([label,value,type],index)=>{const before=baselineMetrics[index]?.[1],delta=value!=null&&before!=null&&before!==0?(value-before)/Math.abs(before)*100:null;return <span key={label}><small>{label}</small><b>{displayMetric(value,type)}</b><em className={delta!=null&&delta<0?'down':delta!=null&&delta>0?'up':''}>{delta==null?'비교 보류':`${delta>0?'+':''}${delta.toFixed(1)}%`}</em></span>;})}</div>
      <footer><small>선택한 보고서 ID만 이 기기에 저장합니다. 숫자는 서버 보고서 원본을 다시 계산하지 않아요.</small><button type="button" disabled={!current||!baseline} onClick={()=>setSaved(selection)}>이 비교 저장</button></footer>
    </article>
    <article className="analysisAnomalyCard" id="analysis-anomalies">
      <header><div><span>ANOMALY PICKER</span><h2>먼저 확인할 이상징후를 골라봐요</h2></div><em>{scopedAlerts.length}건</em></header>
      {scopedAlerts.length?<><div className="analysisAnomalyTabs">{scopedAlerts.slice(0,6).map(item=><button type="button" className={item.id===activeAlert?.id?'active':''} onClick={()=>setSelectedAlert(item.id)} key={item.id}><i/>{item.title}</button>)}</div><div className={`analysisAnomalyDetail ${String(activeAlert?.severity||'WARNING').toLowerCase()}`}><span>{activeAlert?.platform} · {activeAlert?.severity==='ERROR'?'긴급 확인':'확인 필요'}</span><b>{activeAlert?.title}</b><p>{activeAlert?.message}</p><Link href="/insights/causes">원인 분석으로 이동 <i>→</i></Link></div></>:<div className="analysisEmptyState"><b>현재 열린 이상징후가 없어요</b><p>일일 보고서에서 변화를 감지하면 이곳에 선택 카드가 생깁니다.</p></div>}
    </article>
  </section>;
}

function KeywordStopLoss({data={}}){
  const search=data.naver?.searchTermCenter||{},items=search.items||[],waste=data.naver?.keywordWaste||[];
  const totalWaste=waste.reduce((sum,item)=>sum+Number(item.cost||0),0);
  const [limit,setLimit]=useState(10000);
  const risky=useMemo(()=>[...items,...waste.map(item=>({...item,search_term:item.keyword}))].filter(item=>Number(item.cost||0)>=limit&&Number(item.conversions||0)<=0).sort((a,b)=>Number(b.cost||0)-Number(a.cost||0)).slice(0,5),[items,waste,limit]);
  const targetSummary=data.productAdTargets?.summary||{};
  return <section className="keywordDecisionDesk" id="keyword-stop-loss">
    <header><div><span>STOP-LOSS PREVIEW</span><h2>광고비 손실 중지선을 먼저 정해봐요</h2><p>플랫폼을 자동 변경하지 않고, 선택 금액 이상을 쓴 무전환 검색어만 우선 점검합니다.</p></div><label><span>점검 기준</span><select value={limit} onChange={event=>setLimit(Number(event.target.value))}><option value="5000">5,000원</option><option value="10000">10,000원</option><option value="20000">20,000원</option><option value="30000">30,000원</option><option value="50000">50,000원</option></select></label></header>
    <div className="keywordGuardMetrics"><span><small>무전환 광고비</small><b>{won(totalWaste)}</b><em>{waste.length}개 키워드</em></span><span className={risky.length?'danger':''}><small>중지선 초과</small><b>{risky.length}개</b><em>{won(limit)} 이상</em></span><span><small>상품 목표 준비</small><b>{count(targetSummary.ready_products)}개</b><em>ROAS·CPC 안전선</em></span><span><small>실제 검색어</small><b>{count(search.summary?.total)}개</b><em>최근 30일</em></span></div>
    <div className="keywordStopList">{risky.map((item,index)=><article key={`${item.id||item.ncc_keyword_id||item.search_term}-${index}`}><i>{index+1}</i><span><b>{item.search_term||item.keyword}</b><small>클릭 {count(item.clicks)} · 전환 {count(item.conversions)}</small></span><strong>{won(item.cost)}</strong><em>자동 중지 안 함</em></article>)}{!risky.length?<div className="analysisEmptyState"><b>선택한 중지선을 넘긴 무전환 검색어가 없어요</b><p>기준을 낮추거나 실제 검색어를 새로 수집해 확인해보세요.</p></div>:null}</div>
    <footer><Link href="/keywords/search-terms">실제 검색어 결정</Link><Link href="/keywords/registered">등록 키워드 조치</Link><Link href="/products/ad-targets">상품별 안전선</Link></footer>
  </section>;
}

function ProductDifferenceDesk({data={}}){
  const center=data.productOperations||{},items=center.items||[],summary=center.summary||{};
  const priceGap=items.filter(item=>item.issues?.some(issue=>issue.code==='PRICE_GAP'));
  const unlinked=items.filter(item=>Number(item.connected_channels||0)<3);
  const selling=(data.products||[]).filter(item=>item.catalog_status==='SELLING');
  const productById=new Map((data.products||[]).map(item=>[String(item.id??item.external_product_no),item]));
  const sellableMasterIds=new Set((data.channelProducts||[]).filter(link=>link.platform==='CAFE24'&&link.is_active!==false&&productById.get(String(link.external_product_id))?.is_sellable===true).map(link=>link.master_product_id));
  const costIds=new Set((data.productCosts||[]).filter(item=>Number(item.unit_cost||0)+Number(item.packaging_cost||0)+Number(item.other_unit_cost||0)>0).map(item=>item.master_product_id));
  const missingCost=(data.masterProducts||[]).filter(item=>item.is_active!==false&&sellableMasterIds.has(item.id)&&!costIds.has(item.id));
  return <section className="productDifferenceDesk" id="product-channel-differences">
    <header><div><span>SELLABLE PRODUCT CONTROL</span><h2>판매 가능한 상품과 채널 차이를 먼저 봐요</h2><p>품절·판매중단·이벤트·사은품은 작업 대상에서 빼고, 판매중 상품의 연결·가격·원가만 확인합니다.</p></div><em>{count(selling.length)}개 판매중</em></header>
    <div className="productDifferenceMetrics"><Link href="/products/catalog"><i className="mint"><Pictogram type="product"/></i><span><small>판매중 상품</small><b>{count(selling.length)}개</b><em>목록 확인</em></span></Link><Link href="/products/mappings"><i className="blue"><Pictogram type="insight"/></i><span><small>3채널 미연결</small><b>{count(unlinked.length)}개</b><em>매칭하기</em></span></Link><Link href="/products/catalog"><i className="amber"><Pictogram type="keyword"/></i><span><small>가격 차이</small><b>{count(priceGap.length||summary.price_gap)}개</b><em>10% 이상</em></span></Link><Link href="/products/costs"><i className="pink"><Pictogram type="product"/></i><span><small>원가 확인 필요</small><b>{count(missingCost.length)}개</b><em>이익 보호</em></span></Link></div>
    <div className="productGapPreview">{priceGap.slice(0,4).map(item=><article key={item.master_product_id}><span><b>{item.name}</b><small>{item.issues?.map(issue=>issue.label).join(' · ')}</small></span><em>채널 차이 확인</em></article>)}{!priceGap.length?<div className="analysisEmptyState"><b>현재 큰 가격 차이가 감지되지 않았어요</b><p>상품 동기화 후 10% 이상 차이가 생기면 여기에 표시됩니다.</p></div>:null}</div>
    <footer><Link href="/products/costs">원가 입력</Link><Link href="/products/profit">실제 이익</Link><Link href="/products/offers">판매구성 비교</Link><Link href="/products/ad-targets">광고 목표</Link></footer>
  </section>;
}

export default function HarinAnalysisWorkbench({view,workspace,platform='all',data={},aiPanel,children}){
  const meta=WORKSPACE_META[view]?.[workspace]||['분석 작업대','필요한 숫자와 다음 행동을 한 화면에서 확인해요.'];
  const reportCount=(data.reports||[]).filter(report=>scopePlatform(report.platform,platform)).length;
  const anomalyCount=(data.alerts||[]).filter(item=>item.source_type==='ANOMALY'&&scopePlatform(item.platform,platform)).length;
  const actualTerms=data.naver?.searchTermCenter?.summary?.total||0;
  const coupangTerms=(data.coupang?.adKeywordTop?.length||0)+(data.coupang?.adKeywordWaste?.length||0);
  const keywordMetrics=platform==='coupang'
    ? [['쿠팡 키워드',`${count(coupangTerms)}개`],['무전환 키워드',`${count(data.coupang?.adKeywordWaste?.length)}개`],['선택 범위','쿠팡 전용']]
    : [['실제 검색어',`${count(actualTerms)}개`],['무전환 키워드',`${count(data.naver?.keywordWaste?.length)}개`],['선택 범위','네이버 전용']];
  const sellable=(data.products||[]).filter(item=>item.catalog_status==='SELLING').length;
  const profitReady=data.financialTrust?.allowed?.contribution_profit===true;
  const insightMetrics=workspace==='profitability'?[['실제 이익',profitReady?won(data.liveProfitability?.contribution_profit):'판단 보류'],['원가 준비율',percent(data.liveProfitability?.cost_coverage_rate)],['선택 범위',PLATFORM_LABELS[platform]]]:[['저장 보고서',`${count(reportCount)}건`],['열린 이상징후',`${count(anomalyCount)}건`],['선택 범위',PLATFORM_LABELS[platform]]];
  const heroMetrics=view==='insight'?insightMetrics:view==='keyword'?keywordMetrics:[['판매중 상품',`${count(sellable)}개`],['채널 연결',`${count(data.productOperations?.summary?.all_channels_connected)}개`],['선택 범위',PLATFORM_LABELS[platform]]];
  const pageLabel=view==='insight'?'성과 분석':view==='keyword'?'광고 키워드 운영':'상품 성장 운영';
  return <HarinPageFrame kind="analysis" className={`analysisV8 analysisV8-${view}`}>
    <HarinPageHeader className="analysisHero" eyebrow={pageLabel} title={meta[0]} description={meta[1]} icon={view} tone={view==='keyword'?'mint':view==='product'?'amber':'lavender'} note="숫자는 서버 계산 · 자료 부족은 판단 보류 · 플랫폼 변경은 승인 전 실행 안 함" metrics={heroMetrics}/>
    <HarinPageToolbar className="analysisFocusToolbar" label="빠른 작업" description="지금 필요한 분석 위치로 바로 이동해요.">
      <nav className="analysisFocusRail" aria-label="이 화면의 빠른 작업">
        {view==='insight'?<>{INSIGHT_ROUTES.map(([id,label,description,icon,tone])=>{const query=platform==='all'?'':`?platform=${platform}`;return <Link className={`${workspace===id?'active ':''}tone-${tone}`.trim()} href={`/insights/${id}${query}`} key={id}><QuickActionIcon name={icon}/><span><small>{label}</small><b>{description}</b></span></Link>;})}</>:null}
        {view==='keyword'?<>{KEYWORD_QUICK_ACTIONS.map(([id,href,label,description,icon,tone])=><Link className={`${workspace===id?'active ':''}tone-${tone}`.trim()} href={href} key={id}><QuickActionIcon name={icon}/><span><small>{label}</small><b>{description}</b></span></Link>)}</>:null}
        {view==='product'?<><Link className={`${workspace==='catalog'?'active ':''}tone-amber`.trim()} href="/products/catalog"><QuickActionIcon name="product"/><span><small>상품</small><b>판매 가능 목록</b></span></Link><a className="tone-blue" href="#product-channel-differences"><QuickActionIcon name="link"/><span><small>비교</small><b>채널 차이 확인</b></span></a><a className="tone-lavender" href="#page-ai-analysis"><QuickActionIcon name="ai"/><span><small>설명</small><b>상품 AI 분석</b></span></a></>:null}
      </nav>
    </HarinPageToolbar>
    <HarinPageContent className="analysisPageContent">
      {view==='insight'&&workspace==='overview'?<><InsightOverviewDesk data={data} platform={platform}/><InsightComparison reports={data.reports||[]} alerts={data.alerts||[]} platform={platform}/></>:null}
      {view==='insight'&&workspace==='causes'?<InsightCauseDesk data={data} platform={platform}/>:null}
      {view==='insight'&&workspace==='channels'?<InsightChannelDesk data={data}/>:null}
      {view==='insight'&&workspace==='profitability'?<InsightProfitabilityDesk data={data}/>:null}
      {view==='keyword'?<KeywordOperationsTable workspace={workspace} platform={platform} data={data}/>:null}
      {view==='keyword'&&workspace==='diagnosis'&&platform==='naver'?<KeywordStopLoss data={data}/>:null}
      {view==='product'?<ProductDifferenceDesk data={data}/>:null}
      {view==='insight'&&children?<details className="analysisDetailDisclosure"><summary><span><b>{workspace==='overview'?'목표·변경 이벤트 상세':workspace==='causes'?'상세 보고서·권고사항':'채널별 상세 보고서'}</b><small>기존 분석 기능은 필요할 때만 펼쳐보세요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
      {view==='keyword'&&children?<details className="analysisDetailDisclosure keywordLegacyDisclosure"><summary><span><b>{workspace==='search-terms'?'검색어 분류·수집 상세':workspace==='registered'?'기존 키워드 갱신·조치 도구':workspace==='diagnosis'?'진단 근거·실행계획 도구':'기존 변경 기록 상세'}</b><small>기존 운영 기능은 삭제하지 않고 필요할 때만 펼치도록 정리했어요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
      {view==='product'?children:null}
    </HarinPageContent>
    <HarinPageAiRegion className="analysisAiSlot" id="page-ai-analysis" title={`${pageLabel} AI 분석`}>{aiPanel}</HarinPageAiRegion>
  </HarinPageFrame>;
}

function QuickActionIcon({name}){
  return <i aria-hidden="true"><HarinIcon name={name} size={22}/></i>;
}

const INSIGHT_ROUTES=[
  ['overview','요약','오늘의 변화','growth','lavender'],
  ['causes','원인','왜 달라졌는지','search','blue'],
  ['channels','채널','플랫폼 비교','store','mint'],
  ['profitability','수익','실제로 남는 돈','settlement','amber']
];

const KEYWORD_QUICK_ACTIONS=[
  ['registered','/keywords/registered','운영','플랫폼별 키워드 표','keyword','blue'],
  ['search-terms','/keywords/search-terms','탐색','실제 검색어 결정','search','mint'],
  ['diagnosis','/keywords/diagnosis','보호','절감·확대 후보','shield','amber'],
  ['history','/keywords/history','검증','변경 기록 보기','growth','lavender']
];

function latestReport(reports=[],platform='all'){
  return reports.find(report=>scopePlatform(report.platform,platform)&&report.summary_json)||null;
}

function reportPeriodLabel(report,index){
  const label=String(report?.period_type||report?.period||'').toUpperCase();
  if(label==='DAY')return '오늘';
  if(label==='WEEK')return '최근 7일';
  if(label==='MONTH')return '최근 30일';
  return ['오늘','최근 7일','최근 30일'][index]||'저장 기간';
}

function InsightOverviewDesk({data={},platform='all'}){
  const reports=(data.reports||[]).filter(report=>scopePlatform(report.platform,platform)&&report.summary_json);
  const periodReports=['DAY','WEEK','MONTH'].map((period,index)=>reports.find(report=>String(report.period_type||report.period||'').toUpperCase()===period)||reports[index]||null);
  const alerts=(data.alerts||[]).filter(item=>item.source_type==='ANOMALY'&&scopePlatform(item.platform,platform)).slice(0,3);
  const items=data.unifiedProductPerformance?.items||[];
  const ranked=[...items].filter(item=>number(item.revenue)!=null).sort((a,b)=>Number(b.revenue||0)-Number(a.revenue||0));
  const growth=ranked[0], risk=ranked.find(item=>String(item.cost_status||'').toUpperCase()!=='CALCULATED')||ranked.at(-1);
  return <section className="insightOverviewDesk" id="insight-overview">
    <header><div><span>PERFORMANCE SNAPSHOT</span><h2>기간별 흐름과 지금 볼 신호를 함께 봐요</h2><p>보고서가 없는 기간은 다른 숫자로 채우지 않고 판단 보류로 표시합니다.</p></div><Link href="/insights/causes">원인 분석하기 <i>→</i></Link></header>
    <div className="insightPeriodGrid">{periodReports.map((report,index)=>{const metric=reportMetric(report,platform)[0];return <article key={`${report?.id||'empty'}-${index}`}><i>{index+1}</i><span><small>{reportPeriodLabel(report,index)}</small><b>{displayMetric(metric?.[1],metric?.[2])}</b><em>{metric?.[0]||'자료 없음'} · {report?.title||'저장 보고서 없음'}</em></span>{index<2?<strong aria-hidden="true">→</strong>:null}</article>;})}</div>
    <div className="insightSignalGrid">
      <article><header><b>먼저 볼 이상징후</b><em>{alerts.length}건</em></header>{alerts.length?<ul>{alerts.map(item=><li key={item.id}><i className={String(item.severity||'').toLowerCase()}/><span><b>{item.title}</b><small>{item.message}</small></span></li>)}</ul>:<div className="analysisEmptyState"><b>열린 이상징후가 없어요</b><p>새 변화가 감지되면 이곳에 먼저 표시됩니다.</p></div>}</article>
      <article><header><b>상품 신호</b><Link href="/products/profit">상품 이익 보기</Link></header><div className="insightProductSignals"><span className="good"><small>성장 후보</small><b>{growth?.name||growth?.product_name||'판단 보류'}</b><em>{growth?won(growth.revenue):'자료 부족'}</em></span><span className="risk"><small>확인 후보</small><b>{risk?.name||risk?.product_name||'판단 보류'}</b><em>{risk?String(risk.cost_status||'성과 확인 필요'):'자료 부족'}</em></span></div></article>
    </div>
  </section>;
}

function InsightCauseDesk({data={},platform='all'}){
  const report=latestReport(data.reports||[],platform), summary=report?.summary_json||{}, profit=summary.profitability||{};
  const channel=platform==='all'?summary:summary[platform]||{};
  const steps=[
    ['노출',number(channel.impressions??summary.naver?.impressions),'회'],
    ['방문',number(channel.visitors??channel.clicks??summary.cafe24?.visitors),'명'],
    ['주문',number(channel.orders??channel.conversions),'건'],
    ['매출',number(channel.revenue??channel.conversion_revenue??profit.net_sales),'money'],
    ['실제 이익',number(profit.contribution_profit),'money']
  ];
  const evidence=JSON.stringify(summary).toLowerCase();
  const factors=[['가격','price','가격 변경·할인'],['재고','stock','품절·재고 부족'],['리뷰','review','리뷰·평점'],['광고','ad_','광고비·입찰'],['상세페이지','conversion','방문 후 전환']];
  const events=(data.platformEvents||[]).filter(item=>scopePlatform(item.platform,platform)).slice(0,4);
  const insight=Array.isArray(summary.insights)?summary.insights[0]:summary.insights;
  return <section className="insightCauseDesk" id="insight-causes">
    <header><div><span>CAUSE PATH</span><h2>매출이 달라진 길을 순서대로 확인해요</h2><p>관찰 → 영향 → 근거 → 다음 행동 순서로 읽으면 됩니다.</p></div><em>{report?.title||'저장 보고서 없음'}</em></header>
    <div className="insightCauseFlow">{steps.map(([label,value,unit],index)=><article className={value==null?'blocked':''} key={label}><small>{index+1}. {label}</small><b>{unit==='money'?won(value):value==null?'판단 보류':`${count(value)}${unit}`}</b><em>{value==null?'자료 확인 필요':'서버 보고서 기준'}</em>{index<steps.length-1?<i aria-hidden="true">→</i>:null}</article>)}</div>
    <div className="insightCauseColumns"><article><h3>원인별 근거 준비 상태</h3><div className="insightCauseFactors">{factors.map(([label,key,hint])=>{const ready=evidence.includes(key);return <span className={ready?'ready':'blocked'} key={label}><i>{ready?'✓':'?'}</i><b>{label}</b><small>{ready?hint:'직접 근거 없음'}</small></span>;})}</div></article><article><h3>관찰과 다음 행동</h3><div className="insightObservation"><span><small>관찰</small><b>{typeof insight==='string'?insight:insight?.title||report?.title||'비교할 보고서를 먼저 저장해 주세요.'}</b></span><span><small>영향</small><b>{profit.contribution_profit==null?'이익 영향 판단 보류':`공헌이익 ${won(profit.contribution_profit)}`}</b></span><span><small>추천</small><b>{alertsToRecommendation(data.alerts,platform)}</b></span></div></article></div>
    <div className="insightEventTimeline"><header><b>변경·행사 시점</b><small>가격·광고 변경과 성과 변화를 같이 확인해요.</small></header>{events.length?<div>{events.map(item=><span key={item.id||`${item.event_type}-${item.occurred_at}`}><i/><small>{item.occurred_at||item.created_at||'시각 미기록'}</small><b>{item.title||item.event_type||'운영 변경'}</b></span>)}</div>:<div className="analysisEmptyState"><b>연결된 변경 기록이 없어요</b><p>가격·입찰·행사 변경을 기록하면 원인 분석 근거로 표시됩니다.</p></div>}</div>
  </section>;
}

function alertsToRecommendation(alerts=[],platform='all'){
  const alert=alerts.find(item=>item.source_type==='ANOMALY'&&scopePlatform(item.platform,platform));
  return alert?`${alert.title}부터 확인하고 변경 전 수치를 저장해 주세요.`:'급한 이상징후가 없으니 현재 추세를 더 지켜보세요.';
}

function channelSnapshot(data={},platform){
  const report=latestReport(data.reports||[],platform), summary=report?.summary_json||{}, channel=summary[platform]||{};
  const health=(data.dataHealth?.channels||[]).find(item=>String(item.platform||'').toLowerCase()===platform);
  return {
    label:PLATFORM_LABELS[platform],
    revenue:number(channel.revenue??channel.conversion_revenue??channel.gross_sales),
    orders:number(channel.orders??channel.conversions),
    adSpend:number(channel.ad_spend??channel.spend??channel.cost),
    roas:number(channel.roas??channel.ad_roas),
    status:health?.status||health?.state||(report?'REPORT':'NO_DATA'),
    updated:health?.last_success_at||health?.updated_at||report?.created_at||null
  };
}

function InsightChannelDesk({data={}}){
  const channels=['naver','coupang','cafe24'].map(platform=>channelSnapshot(data,platform));
  return <section className="insightChannelDesk" id="insight-channels">
    <header><div><span>CHANNEL MATRIX</span><h2>세 채널을 같은 기준으로 비교해요</h2><p>한 채널 자료가 없어도 나머지 채널은 그대로 보여줍니다.</p></div><Link href="/data-collection">데이터 상태 확인</Link></header>
    <div className="insightChannelTable" role="table" aria-label="채널별 성과 비교"><div className="head" role="row"><span>채널</span><span>매출</span><span>주문</span><span>광고비</span><span>ROAS</span><span>자료 상태</span></div>{channels.map(item=><div className="row" role="row" key={item.label}><span><i className={item.label.toLowerCase()}/><b>{item.label}</b></span><strong>{won(item.revenue)}</strong><strong>{item.orders==null?'판단 보류':`${count(item.orders)}건`}</strong><strong>{won(item.adSpend)}</strong><strong>{percent(item.roas)}</strong><span className="channelDataState"><em>{item.status}</em><small>{item.updated||'갱신 시각 없음'}</small></span></div>)}</div>
    <footer><small>실제 이익은 원가·수수료·배송비가 모두 준비된 경우에만 수익성 분석에서 표시합니다.</small><Link href="/insights/profitability">수익성 분석으로 이동 <i>→</i></Link></footer>
  </section>;
}

function InsightProfitabilityDesk({data={}}){
  const profit=data.liveProfitability||{}, trust=data.financialTrust||{};
  const ready=trust.allowed?.contribution_profit===true&&String(profit.cost_status||'').toUpperCase()!=='BLOCKED';
  const values=[['매출',number(profit.revenue),false],['수수료',number(profit.fees),true],['배송비',number(profit.shipping_cost),true],['상품 원가',number(profit.product_cost),true],['광고비',number(profit.ad_spend),true],['실제 이익',ready?number(profit.contribution_profit):null,false]];
  const scale=Math.max(1,number(profit.revenue)||0,...values.map(item=>Math.abs(item[1]||0)));
  const products=(data.unifiedProductPerformance?.items||[]).slice(0,8);
  return <section className="insightProfitDesk" id="insight-profitability">
    <header><div><span>PROFIT WATERFALL</span><h2>매출에서 모든 비용을 빼고 실제 남는 돈을 봐요</h2><p>원가나 자료가 부족하면 0원이 아니라 판단 보류로 잠급니다.</p></div><em className={ready?'ready':'blocked'}>{ready?'계산 가능':'판단 보류'}</em></header>
    <div className="profitGuardMetrics"><span><small>실제 이익</small><b>{ready?won(profit.contribution_profit):'판단 보류'}</b><em>{ready?percent(profit.contribution_margin_rate):'비용 자료 확인'}</em></span><span><small>손익분기 ROAS</small><b>{ready?percent(profit.break_even_roas):'판단 보류'}</b><em>이보다 높아야 안전</em></span><span><small>원가 준비율</small><b>{percent(profit.cost_coverage_rate)}</b><em>{count(profit.missing_cost_products)}개 확인 필요</em></span><span><small>광고비</small><b>{won(profit.ad_spend)}</b><em>서버 수집 기준</em></span></div>
    <div className="profitWaterfall">{values.map(([label,value,isCost])=><article className={`${isCost?'cost':'value'} ${value==null?'blocked':''}`} key={label}><span><b>{label}</b><small>{value==null?'자료 부족':isCost?'차감 비용':'계산 결과'}</small></span><div><i style={{width:`${value==null?8:Math.max(8,Math.abs(value)/scale*100)}%`}}/></div><strong>{value==null?'판단 보류':`${isCost?'− ':''}${won(Math.abs(value))}`}</strong></article>)}</div>
    <div className="profitProductTable"><header><div><h3>상품별 이익 준비 상태</h3><p>판매액이 커도 원가가 없으면 이익 순위를 만들지 않아요.</p></div><Link href="/products/costs">원가 입력</Link></header>{products.length?<div role="table"><div className="head" role="row"><span>상품</span><span>매출</span><span>광고비</span><span>실제 이익</span><span>상태</span></div>{products.map((item,index)=>{const itemReady=ready&&String(item.cost_status||'').toUpperCase()==='CALCULATED'&&number(item.contribution_profit)!=null;return <div className="row" role="row" key={item.id||item.master_product_id||index}><span><b>{item.name||item.product_name||`상품 ${index+1}`}</b></span><strong>{won(item.revenue)}</strong><strong>{won(item.ad_spend)}</strong><strong>{itemReady?won(item.contribution_profit):'판단 보류'}</strong><em className={itemReady?'ready':'blocked'}>{itemReady?'계산됨':'비용 확인'}</em></div>;})}</div>:<div className="analysisEmptyState"><b>비교할 상품 성과가 없어요</b><p>상품 매칭과 원가 입력 후 채널 데이터를 수집해 주세요.</p></div>}</div>
    <footer><Link href="/products/profit">상품별 실제 이익</Link><Link href="/products/costs">원가 입력</Link><Link href="/settlement-costs">정산·비용 대조</Link></footer>
  </section>;
}
