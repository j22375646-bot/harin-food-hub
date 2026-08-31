'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import productAnalysisSaveFlow from '../../../lib/analytics/product-analysis-save-flow.js';
import productAnalysisDeleteState from '../../../lib/analytics/product-analysis-delete-state.js';
import './product-analysis-page.css';

const {deleteProductAnalysisReport,saveProductAnalysisReport}=productAnalysisSaveFlow;
const {removeDeletedAnalysis}=productAnalysisDeleteState;

const SOURCE_LABEL={sales:'자사·채널 판매',profit:'원가·공헌이익',search:'네이버 검색광고',competition:'경쟁 상품 가격',audience:'고객 구성',reviews:'검증 리뷰'};
const STATUS_LABEL={READY:'실제값',CALCULATED:'계산값',NO_DATA:'자료 없음',CHECK_REQUIRED:'확인 필요',SETUP_REQUIRED:'연결 필요',PARTIAL:'일부 준비'};
const PERIOD_LABEL={30:'30일',90:'90일',365:'1년'};
const CHANNELS=['NAVER','CAFE24','COUPANG'];
const money=value=>value==null||!Number.isFinite(Number(value))?'확인 필요':`₩${Math.round(Number(value)).toLocaleString('ko-KR')}`;
const count=(value,suffix='건')=>value==null||!Number.isFinite(Number(value))?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}${suffix}`;
const percent=value=>value==null||!Number.isFinite(Number(value))?'판단 보류':`${Number(value).toFixed(1)}%`;
const time=value=>{if(!value)return '기준시각 확인 필요';const date=new Date(value);return Number.isNaN(date.getTime())?'기준시각 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);};

function normalizeReport(report){
  const summary=report?.summary_json||report?.report||{};
  return {id:String(report?.id||''),title:report?.title||`${summary.product?.name||'상품'} 분석`,product:summary.product||report?.product||{},periodDays:Number(summary.period_days||report?.periodDays||30),periodStart:report?.period_start||report?.periodStart||summary.period_start,periodEnd:report?.period_end||report?.periodEnd||summary.period_end,createdAt:report?.created_at||report?.createdAt||summary.generated_at,metrics:summary.metrics||report?.metrics||{},channels:summary.channels||report?.channels||{},keywords:summary.keywords||report?.keywords||[],sources:summary.sources||report?.sources||{},signals:summary.signals||report?.signals||[]};
}

function AnalysisRunner({products,selectedId,setSelectedId,period,setPeriod,onRun,running}){
  const selected=products.find(item=>item.id===selectedId)||null;
  return <section className="paRunner" data-state={running?'running':selected?'ready':'waiting'} aria-labelledby="paRunnerTitle">
    <header><div><span>ANALYSIS RUNNER</span><h2 id="paRunnerTitle">상품과 기간을 정하면 그 시점의 분석표를 만들어요.</h2><p>다시 열어도 값이 바뀌지 않도록 데이터 기준시각과 계산 버전을 보고서에 함께 저장합니다.</p></div><em><i/>{running?'계산 중':selected?'분석 준비':'선택 대기'}</em></header>
    <div className="paRunFlow">
      <article className="paRunStep"><b>01</b><div><span>상품 선택</span><strong>판매상품 하나</strong><small>기준 상품·채널 매칭 기준</small><label><i>상품을 선택하세요</i><select value={selectedId} onChange={event=>setSelectedId(event.target.value)}><option value="">상품을 선택하세요</option>{products.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div></article>
      <fieldset className="paRunStep"><legend>분석 기간 선택</legend><b>02</b><div><span>기간 선택</span><strong>분석 범위</strong><small>30일·90일·1년</small><div className="paPeriods">{[30,90,365].map(days=><button type="button" aria-pressed={period===days} onClick={()=>setPeriod(days)} key={days}>{PERIOD_LABEL[days]}</button>)}</div></div></fieldset>
      <article className="paRunStep"><b>03</b><div><span>분석 실행</span><strong>보고서 계산</strong><small>선택 순간의 서버 자료로 고정</small><button type="button" className="paRunButton" disabled={!selected||running} onClick={onRun}>{running?'분석표 계산 중':'분석 시작'}<i>→</i></button></div></article>
    </div>
    {selected?<div className="paSelectedProduct"><span className="paProductGlyph">{selected.name.slice(0,1)}</span><div><span className="paBrands">{CHANNELS.map(brand=><Phase28ChannelLogo brand={brand} size="compact" key={brand}/>)}<b>{selected.connectedChannels}/3채널 연결</b></span><strong>{selected.name}</strong><small>최근 수집 매출 {money(selected.metrics?.revenue)} · 검색 노출 {count(selected.metrics?.searchDemand,'회')}</small></div><em>선택 완료<br/><b>{time(selected.sources?.sales?.asOf)}</b></em></div>:null}
    <footer><i><b/></i><span>{selected?`${selected.name} · ${PERIOD_LABEL[period]} 분석을 새 스냅샷으로 저장합니다.`:'판매상품과 분석 기간을 선택해 주세요.'}</span></footer>
  </section>;
}

function AnalysisHistory({history,activeId,onOpen,onDelete,deletingId}){
  return <section className="paHistory" aria-labelledby="paHistoryTitle"><header><div><span>ANALYSIS LEDGER</span><h2 id="paHistoryTitle">저장된 분석</h2><p>분석 당시 상품·기간·데이터 기준시각·계산 버전을 그대로 다시 엽니다.</p></div><strong>{history.length}건</strong></header>{history.length?<div>{history.map(item=><article className="paHistoryRow" data-selected={item.id===activeId} key={item.id}><button type="button" className="paHistoryOpen" onClick={()=>onOpen(item)}><span>{item.product?.name?.slice(0,1)||'분'}</span><div><strong>{item.product?.name||item.title}</strong><small>{PERIOD_LABEL[item.periodDays]||`${item.periodDays}일`} · {item.periodStart} ~ {item.periodEnd}</small></div><em>{item.id===activeId?'열어봄':'저장 완료'}</em></button><button type="button" className="paHistoryDelete" aria-label={`${item.product?.name||item.title} 저장 분석 삭제`} disabled={deletingId===item.id} onClick={()=>onDelete(item)}><HarinIcon name="close" size={17}/>{deletingId===item.id?'삭제 중':'삭제'}</button></article>)}</div>:<p className="paHistoryEmpty">아직 저장된 분석이 없어요. 첫 분석을 실행하면 여기에 기록됩니다.</p>}</section>;
}

function DeleteAnalysisDialog({report,deleting,error,onCancel,onConfirm}){
  if(!report)return null;
  return <div className="paDeleteBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!deleting)onCancel();}}><section className="paDeleteDialog" role="alertdialog" aria-modal="true" aria-labelledby="paDeleteTitle" aria-describedby="paDeleteDescription"><div className="paDeleteIcon"><HarinIcon name="close" size={23}/></div><span>DELETE SAVED ANALYSIS</span><h2 id="paDeleteTitle">이 저장 분석을 삭제할까요?</h2><p id="paDeleteDescription"><strong>{report.product?.name||report.title}</strong><br/>서버 저장 목록과 DB에서 즉시 삭제됩니다. 상품·주문·광고 원본 자료는 바뀌지 않으며 삭제 기록은 복구 확인을 위해 별도로 남습니다.</p>{error?<div className="paDeleteError" role="alert">{error}</div>:null}<footer><button type="button" disabled={deleting} onClick={onCancel}>취소</button><button type="button" className="paDeleteConfirm" disabled={deleting} onClick={onConfirm}>{deleting?'삭제하는 중':'분석 삭제'}</button></footer></section></div>;
}

function EvidenceRadar({report}){
  const sources=report.sources||{};
  const values=[sources.search,sources.sales,sources.profit,{status:Object.values(report.channels||{}).filter(item=>(item.revenue||0)>0).length>=2?'READY':'PARTIAL'},sources.competition,sources.reviews].map(item=>['READY','CALCULATED'].includes(item?.status)?88:item?.status==='PARTIAL'?55:22);
  const points=values.map((value,index)=>{const angle=(-90+index*60)*Math.PI/180;const radius=62*value/100;return `${90+Math.cos(angle)*radius},${90+Math.sin(angle)*radius}`;}).join(' ');
  return <figure className="paRadar"><figcaption><span>근거 준비도</span><strong>여섯 근거의 연결 상태</strong></figcaption><svg viewBox="0 0 180 180" role="img" aria-label="검색, 판매, 이익, 채널, 경쟁, 리뷰 근거 준비도"><g className="paRadarGrid">{[24,43,62].map(radius=><polygon key={radius} points={Array.from({length:6},(_,index)=>{const angle=(-90+index*60)*Math.PI/180;return `${90+Math.cos(angle)*radius},${90+Math.sin(angle)*radius}`;}).join(' ')}/>)}</g><polygon className="paRadarValue" points={points}/>{['검색','판매','이익','채널','경쟁','리뷰'].map((label,index)=>{const angle=(-90+index*60)*Math.PI/180;return <text key={label} x={90+Math.cos(angle)*78} y={93+Math.sin(angle)*75} textAnchor="middle">{label}</text>;})}</svg><p>연결되지 않은 외부 근거는 낮은 준비도로만 표시하고 값은 추정하지 않습니다.</p></figure>;
}

function ReportHero({report}){
  const metrics=report.metrics||{};
  const headline=metrics.search_demand!=null?`${report.product?.name||'선택 상품'}은 검색 수요 ${count(metrics.search_demand,'회')}와 실제 매출 ${money(metrics.revenue)}이 확인됐어요.`:`${report.product?.name||'선택 상품'}의 판매 근거는 확인됐지만 검색 수요 연결이 더 필요해요.`;
  return <section className="paReportHero"><div><span>현재 결론</span><h2>{headline}</h2><p>실제 주문·광고·원가만 계산하고 경쟁·고객·리뷰 근거는 연결 상태를 분리했습니다.</p><div>{(report.signals||[]).slice(0,3).map((item,index)=><em data-tone={item.tone} key={`${item.title}-${index}`}>{item.title}</em>)}</div></div><EvidenceRadar report={report}/><dl><div><dt>근거 연결</dt><dd>{Object.values(report.sources||{}).filter(item=>['READY','CALCULATED'].includes(item.status)).length} / {Object.keys(report.sources||{}).length}</dd></div><div><dt>분석 기간</dt><dd>{PERIOD_LABEL[report.periodDays]||`${report.periodDays}일`}</dd></div><div><dt>계산 시각</dt><dd>{time(report.createdAt)}</dd></div></dl></section>;
}

function Provenance({sources={}}){return <section className="paProvenance"><header><span>DATA PROVENANCE</span><h3>결론에 사용한 데이터의 출처와 성격</h3></header><div>{Object.entries(SOURCE_LABEL).map(([key,label])=>{const item=sources[key]||{status:'SETUP_REQUIRED'},isReady=['READY','CALCULATED'].includes(item.status);return <article key={key}><span>{label}</span><strong>{item.label||label}</strong><small>{item.detail||'연결 상태 확인 필요'}</small><footer><em data-status={item.status}>{STATUS_LABEL[item.status]||item.status}</em>{item.href?<Link className="paProvenanceAction" href={item.href} prefetch={false}>{isReady?'근거 보기':'연결하기'}<i>→</i></Link>:null}</footer></article>;})}</div></section>;}

function MetricBrief({report}){const m=report.metrics||{};return <section className="paMetricBrief"><article><span>선택 기간 검색 수요</span><strong>{count(m.search_demand,'회')}</strong><small>네이버 상품 연결 키워드</small></article><article><span>실제 매출</span><strong>{money(m.revenue)}</strong><small>{count(m.orders)} · {count(m.units,'개')}</small></article><article><span>평균 주문금액</span><strong>{money(m.order_value)}</strong><small>선택 기간 실결제 기준</small></article><article><span>공헌이익</span><strong>{money(m.contribution_profit)}</strong><small>마진 {percent(m.contribution_margin_rate)}</small></article></section>;}

function ChannelChart({channels={}}){const rows=CHANNELS.map(id=>({id,...channels[id]}));const max=Math.max(1,...rows.map(item=>Number(item.revenue)||0));return <figure className="paChannelChart"><figcaption><span>실제 판매</span><strong>채널별 매출 연결</strong><small>선택 기간 주문 기준</small></figcaption><div>{rows.map(item=><article key={item.id}><Phase28ChannelLogo brand={item.id}/><span><b>{item.id==='NAVER'?'네이버':item.id==='CAFE24'?'Cafe24':'쿠팡'}</b><i><em style={{'--value':`${Math.max(item.revenue?8:0,(Number(item.revenue)||0)/max*100)}%`}}/></i></span><strong>{money(item.revenue)}</strong><small>{count(item.orders)}</small></article>)}</div></figure>;}

function KeywordChart({keywords=[]}){const rows=keywords.slice(0,7),max=Math.max(1,...rows.map(item=>Number(item.impressions)||0));return <figure className="paKeywordChart"><figcaption><span>키워드 경쟁</span><strong>상품에 연결된 검색 수요</strong><small>실제 연결 키워드만 표시</small></figcaption>{rows.length?<div>{rows.map(item=><article key={item.keyword}><span><b>{item.keyword}</b><small>클릭 {count(item.clicks,'회')} · 주문 {count(item.orders)}</small></span><i><em style={{'--value':`${Math.max(5,(Number(item.impressions)||0)/max*100)}%`}}/></i><strong>{count(item.impressions,'회')}</strong></article>)}</div>:<p>상품에 직접 연결된 네이버 키워드 자료가 없습니다.</p>}</figure>;}

function AnalysisChapters({report}){return <section className="paChapters"><details open><summary><b>01</b><span><strong>수요와 판매</strong><small>검색 수요와 실제 주문이 같은 기간에 이어지는지 봅니다.</small></span><i>⌄</i></summary><div><ChannelChart channels={report.channels}/><KeywordChart keywords={report.keywords}/></div></details><details><summary><b>02</b><span><strong>시장·가격·고객</strong><small>외부 근거가 연결된 항목만 비교합니다.</small></span><i>⌄</i></summary><div className="paSetupGrid">{['competition','audience','reviews'].map(key=>{const item=report.sources?.[key]||{};return <article key={key}><HarinIcon name="search" size={22}/><span><strong>{SOURCE_LABEL[key]}</strong><small>{item.detail||'근거 연결 필요'}</small></span><span className="paSetupAction"><em>{STATUS_LABEL[item.status]||'연결 필요'}</em>{item.href?<Link href={item.href} prefetch={false}>관리 화면 열기</Link>:null}</span></article>;})}</div></details><details><summary><b>03</b><span><strong>키워드와 다음 행동</strong><small>검색 수요와 판매 실적 사이의 확인할 지점을 정리합니다.</small></span><i>⌄</i></summary><div className="paSignalList">{(report.signals||[]).map((item,index)=><article data-tone={item.tone} key={`${item.title}-${index}`}><b>{String(index+1).padStart(2,'0')}</b><span><strong>{item.title}</strong><small>{item.body}</small></span></article>)}</div></details></section>;}

function DecisionDesk({product,report}){const sources=report?.sources||product?.sources||{};const ready=Object.values(sources).filter(item=>['READY','CALCULATED'].includes(item?.status)).length;const next=Object.entries(sources).find(([,item])=>!['READY','CALCULATED'].includes(item?.status));return <div className="paDecisionDesk"><header><span>PRODUCT DECISION DESK</span><h2>{report?.product?.name||product?.name||'상품을 선택하세요'}</h2><p>{report?`${PERIOD_LABEL[report.periodDays]} · 저장된 분석`:'상품과 기간을 정한 뒤 분석을 시작하세요.'}</p></header><div className="paDeskState"><i/><span><small>근거 준비</small><strong>{ready}/{Object.keys(sources).length||6}개</strong></span></div><div className="paDeskSources">{Object.entries(SOURCE_LABEL).map(([key,label])=>{const item=sources[key]||{status:'SETUP_REQUIRED'},isReady=['READY','CALCULATED'].includes(item.status);return <article key={key}><i data-ready={isReady}/><span><strong>{label}</strong><small>{item.detail||'연결 상태 확인 필요'}</small></span><span className="paDeskSourceAction"><em>{STATUS_LABEL[item.status]||'확인 필요'}</em>{item.href?<Link href={item.href} prefetch={false}>{isReady?'근거 보기':'근거 연결'}</Link>:null}</span></article>;})}</div><section><span>NEXT SAFE ACTION</span><strong>{next?`${SOURCE_LABEL[next[0]]} 근거를 연결한 뒤 다시 분석하세요.`:'확인된 근거로 다음 상품 결정을 검토하세요.'}</strong><p>분석표는 조회·저장만 수행하며 상품이나 광고를 자동 변경하지 않습니다.</p></section></div>;}

function EmptyReport(){return <section className="paEmpty"><div><i/><b>?</b></div><article><span>REPORT WAITING</span><h2>아직 계산된 분석표가 없어요.</h2><p>위에서 판매상품과 분석 기간을 선택한 다음 분석 시작을 눌러주세요. 기존 보고서를 선택해도 같은 계산 스냅샷을 다시 엽니다.</p></article><ol><li><b>1</b> 상품·채널 매칭 확인</li><li><b>2</b> 기간별 주문·검색 근거 계산</li><li><b>3</b> 완료 스냅샷 저장</li></ol></section>;}

export default function Phase28ProductAnalysisPage({model={}}){
  const router=useRouter();
  const products=model.products||[];
  const savedReports=model.history||[];
  const initialActiveReport=savedReports.find(item=>item.id===model.activeReportId)||savedReports[0]||null;
  const [selectedId,setSelectedId]=useState(products[0]?.id||'');
  const [period,setPeriod]=useState(model.defaultPeriod||30);
  const [history,setHistory]=useState(savedReports.map(normalizeReport));
  const [active,setActive]=useState(initialActiveReport?normalizeReport(initialActiveReport):null);
  const [running,setRunning]=useState(false);
  const [message,setMessage]=useState('');
  const [pendingDelete,setPendingDelete]=useState(null);
  const [deletingId,setDeletingId]=useState('');
  const [deleteError,setDeleteError]=useState('');
  const selected=useMemo(()=>products.find(item=>item.id===selectedId)||null,[products,selectedId]);
  async function run(){if(!selected||running)return;setRunning(true);setMessage('');try{const saved=await saveProductAnalysisReport({router,productId:selected.id,periodDays:period});const report=normalizeReport(saved);setActive(report);setHistory(current=>[report,...current.filter(item=>item.id!==report.id)]);setMessage('새 분석표를 계산하고 저장했습니다.');}catch(error){setMessage(error.message||'상품 분석을 만들지 못했습니다.');}finally{setRunning(false);}}
  function requestDelete(report){if(deletingId)return;setDeleteError('');setPendingDelete(report);}
  function cancelDelete(){if(deletingId)return;setDeleteError('');setPendingDelete(null);}
  async function confirmDelete(){if(!pendingDelete||deletingId)return;setDeletingId(pendingDelete.id);setDeleteError('');try{const result=await deleteProductAnalysisReport({router,reportId:pendingDelete.id,expectedCreatedAt:pendingDelete.createdAt});const next=removeDeletedAnalysis({history,active,deletedId:result.deleted_id||pendingDelete.id});setHistory(next.history);setActive(next.active);setPendingDelete(null);setMessage('저장된 분석을 서버와 DB에서 삭제했습니다.');}catch(error){setDeleteError(error.message||'저장된 분석을 삭제하지 못했습니다.');}finally{setDeletingId('');}}
  useEffect(()=>{if(!pendingDelete)return undefined;const onKeyDown=event=>{if(event.key==='Escape'&&!deletingId)cancelDelete();};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);},[pendingDelete,deletingId]);
  const hero=model.hero||{};
  return <section className="p28ProductAnalysis" data-phase28-root="true" data-phase28-page="product-analysis">
    <div className="paIntro"><Phase28PageHeading context={`판매상품 ${hero.productCount??products.length}개 · 저장 분석 ${history.length}건 · 실제 근거와 미연결 근거 분리`} title="상품과 기간을 고르면 " accent="분석표" suffix="를 만들어요." summary={hero.summary||'검색 수요, 고객층, 경쟁 가격과 실제 판매 실적을 같은 분석 시점으로 묶어 봅니다.'}/><div className="paIntroStatus"><HarinIcon name="analysis" size={23}/><span><small>분석 기준</small><strong>{time(model.generatedAt)}</strong><em>선택 실행 · 서버 저장</em></span></div></div>
    <AnalysisRunner products={products} selectedId={selectedId} setSelectedId={setSelectedId} period={period} setPeriod={setPeriod} onRun={run} running={running}/>
    {message?<div className="paMessage" role="status">{message}</div>:null}
    <AnalysisHistory history={history} activeId={active?.id} onOpen={setActive} onDelete={requestDelete} deletingId={deletingId}/>
    <Phase28RightRailLayout label="상품 분석 판단 패널" rail={<DecisionDesk product={selected} report={active}/>}>{active?<div className="paReport"><header><div><span>상품 세부 분석</span><h2>숫자를 나열하지 않고, 팔린 근거를 하나의 이야기로 읽어요.</h2></div><em>{PERIOD_LABEL[active.periodDays]} · {active.periodEnd}</em></header><ReportHero report={active}/><Provenance sources={active.sources}/><section className="paMarketer"><header><span>NAVER MARKETER REPORT</span><h2>지금 꼭 봐야 할 판매·검색 근거부터 한 줄로 확인해요.</h2><small>보고서 기준일 {active.periodStart} ~ {active.periodEnd}</small></header><MetricBrief report={active}/><AnalysisChapters report={active}/></section></div>:<EmptyReport/>}</Phase28RightRailLayout>
    <DeleteAnalysisDialog report={pendingDelete} deleting={Boolean(deletingId)} error={deleteError} onCancel={cancelDelete} onConfirm={confirmDelete}/>
  </section>;
}
