'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStoredState } from '../use-hub-preference.js';

const PLATFORM_LABELS={all:'전체',naver:'네이버',coupang:'쿠팡',cafe24:'Cafe24'};
const WORKSPACE_META={
  insight:{
    overview:['오늘의 성과판','매출·광고·이익 변화와 이상징후를 한 번에 확인해요.'],
    causes:['왜 달라졌는지 찾기','좋아지거나 나빠진 숫자의 원인과 다음 행동을 연결해요.'],
    channels:['채널별 성과 비교','네이버·쿠팡·Cafe24를 같은 기준으로 나란히 살펴봐요.']
  },
  keyword:{
    'search-terms':['고객이 실제로 검색한 말','등록 키워드와 분리해 고객 검색어의 기회와 낭비를 결정해요.'],
    registered:['등록 키워드 운영','광고 계정에 등록된 키워드의 성과와 조치 후보를 확인해요.'],
    diagnosis:['기회·낭비 진단','실제 매출과 원가 안전선을 함께 보고 확장·감액을 판단해요.']
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
  const sellable=(data.products||[]).filter(item=>item.catalog_status==='SELLING').length;
  const heroMetrics=view==='insight'?[['저장 보고서',`${count(reportCount)}건`],['열린 이상징후',`${count(anomalyCount)}건`],['선택 범위',PLATFORM_LABELS[platform]]]:view==='keyword'?[['실제 검색어',`${count(actualTerms)}개`],['무전환 키워드',`${count(data.naver?.keywordWaste?.length)}개`],['선택 범위',PLATFORM_LABELS[platform]]]:[['판매중 상품',`${count(sellable)}개`],['채널 연결',`${count(data.productOperations?.summary?.all_channels_connected)}개`],['선택 범위',PLATFORM_LABELS[platform]]];
  return <section className={`analysisV8 analysisV8-${view}`}>
    <section className="analysisHero">
      <div className="analysisHeroCopy"><span>{view==='insight'?'성과 분석':view==='keyword'?'광고 키워드 운영':'상품 성장 운영'}</span><div><i><Pictogram type={view}/></i><section><h1>{meta[0]}</h1><p>{meta[1]}</p></section></div><small>숫자는 서버 계산 · 자료 부족은 판단 보류 · 플랫폼 변경은 승인 전 실행 안 함</small></div>
      <div className="analysisHeroMetrics">{heroMetrics.map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
    </section>
    <nav className="analysisFocusRail" aria-label="이 화면의 빠른 작업">
      {view==='insight'?<><a href="#analysis-decision-desk"><i>↔</i><span><small>비교</small><b>저장한 기준과 비교</b></span></a><a href="#analysis-anomalies"><i>!</i><span><small>선택</small><b>이상징후 먼저 보기</b></span></a><a href="#page-ai-analysis"><i>AI</i><span><small>설명</small><b>인사이트 AI 분석</b></span></a></>:null}
      {view==='keyword'?<><Link href="/keywords/search-terms"><i>⌕</i><span><small>탐색</small><b>실제 검색어 결정</b></span></Link><a href="#keyword-stop-loss"><i>₩</i><span><small>보호</small><b>손실 중지선 확인</b></span></a><a href="#page-ai-analysis"><i>AI</i><span><small>설명</small><b>키워드 AI 분석</b></span></a></>:null}
      {view==='product'?<><Link href="/products/catalog"><i>□</i><span><small>상품</small><b>판매 가능 목록</b></span></Link><a href="#product-channel-differences"><i>≠</i><span><small>비교</small><b>채널 차이 확인</b></span></a><a href="#page-ai-analysis"><i>AI</i><span><small>설명</small><b>상품 AI 분석</b></span></a></>:null}
    </nav>
    {view==='insight'?<InsightComparison reports={data.reports||[]} alerts={data.alerts||[]} platform={platform}/>:null}
    {view==='keyword'?<KeywordStopLoss data={data}/>:null}
    {view==='product'?<ProductDifferenceDesk data={data}/>:null}
    {aiPanel?<div className="analysisAiSlot" id="page-ai-analysis">{aiPanel}</div>:null}
    <div className="analysisPageContent">{children}</div>
  </section>;
}
