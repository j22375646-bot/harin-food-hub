'use client';

import { useMemo, useState } from 'react';
import { HarinIcon } from './_design-system/harin-icon.js';
import { useStoredState } from './use-hub-preference.js';

const won = value => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;
const count = value => Math.round(Number(value || 0)).toLocaleString('ko-KR');
const INTENT_ORDER = ['ALL','INFORMATION','PURCHASE','PROBLEM','SITUATION','PRODUCT'];
const ACTION_ORDER = ['ALL','EXPAND','MAINTAIN','REDUCE','STOP_REVIEW','WATCH'];
const ACTION_LABELS = { ALL:'전체 판단', EXPAND:'확대 후보', MAINTAIN:'유지', REDUCE:'감액 후보', STOP_REVIEW:'중지 검토', WATCH:'더 지켜보기' };

function periodLabel(period) {
  return period?.period_start && period?.period_end ? `${period.period_start} ~ ${period.period_end}` : '최근 수집 기간';
}

function Confidence({ value }) {
  const label = value === 'HIGH' ? '근거 높음' : value === 'MEDIUM' ? '근거 보통' : '표본 부족';
  return <span className={`marketingConfidence ${String(value || '').toLowerCase()}`}>{label}</span>;
}

function CheckPill({ item }) {
  return <span className={`marketingCheck ${String(item?.status || 'NO_DATA').toLowerCase()}`} title={item?.detail}>{item?.label || '확인 필요'}</span>;
}

function DiagnosisSequence({ item, compact = false }) {
  return <div className={`diagnosisSequence${compact ? ' compact' : ''}`}>
    <section><small>1. 관찰</small><p>{item.observation}</p></section>
    <section><small>2. 영향</small><p>{item.impact}</p></section>
    <section><small>3. 근거</small><ul>{(item.evidence || []).slice(0, compact ? 3 : 6).map((line,index)=><li key={index}>{line}</li>)}</ul></section>
    <section><small>4. 추천</small><p>{item.recommendation}</p></section>
  </div>;
}

export function MarketingInsightSummary({ diagnosis }) {
  if (!diagnosis?.items?.length) return null;
  const items = diagnosis.items.slice(0, 3);
  return <article className="panel marketingInsightSummary">
    <header><div><span>광고 판단 근거</span><h2>광고 판단을 이렇게 내렸어요</h2><p>ROAS 숫자만 보지 않고 관찰 → 영향 → 근거 → 추천 순서로 설명합니다.</p></div><b>{periodLabel(diagnosis.period)}</b></header>
    <div className="marketingSummaryRows">{items.map(item=><section key={item.ncc_keyword_id}><div className="marketingSummaryTitle"><strong>{item.keyword}</strong><span className={`marketingAction ${item.action_tone}`}>{item.action_label}</span><Confidence value={item.confidence}/></div><DiagnosisSequence item={item} compact/></section>)}</div>
  </article>;
}

export default function MarketingDiagnosisCenter({ diagnosis, actioning, onAction }) {
  const [intent,setIntent] = useStoredState('filter:keyword-intent','ALL',INTENT_ORDER);
  const [action,setAction] = useStoredState('filter:keyword-action','ALL',ACTION_ORDER);
  const [visible,setVisible] = useState(20);
  const [working,setWorking] = useState('');
  const [message,setMessage] = useState('');
  const definitions = diagnosis?.intent_definitions || {};
  const items = useMemo(() => (diagnosis?.items || []).filter(item => (intent === 'ALL' || item.intent === intent) && (action === 'ALL' || item.action === action)), [diagnosis, intent, action]);
  async function register(item, actionType) {
    if (onAction) return onAction(item, actionType);
    const key = `${item.ncc_keyword_id}:${actionType}`;
    setWorking(key); setMessage('실행계획을 등록하는 중이에요…');
    try {
      const response = await fetch('/api/naver/keyword-actions', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ keyword_id:item.ncc_keyword_id, keyword:item.keyword, action_type:actionType, cost:item.cost, conversion_revenue:item.conversion_revenue, clicks:item.clicks, conversions:item.conversions }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '등록 실패');
      setMessage(result.created ? `등록 완료 · ${item.keyword} · 진단목록에서 확인하세요` : `이미 같은 실행계획이 대기 중입니다 · ${item.keyword}`);
    } catch (error) { setMessage(`확인 필요 · ${error.message}`); }
    finally { setWorking(''); }
  }
  const effectiveActioning = actioning || working;
  if (!diagnosis?.items?.length) return <article className="panel marketingEmpty"><h2>마케팅 진단 자료를 준비 중입니다</h2><p>키워드 성과를 한 번 갱신하면 검색 노출부터 매출까지 연결해 보여드립니다.</p></article>;
  const totals = diagnosis.totals || {}, summary = diagnosis.summary || {};
  const funnelSteps=[
    {label:'검색 노출',value:`${count(totals.impressions)}회`,note:'검색량 대용 수요 신호',icon:'search'},
    {label:'방문',value:`${count(totals.visits)}회`,note:`클릭률 ${Number(totals.ctr || 0).toFixed(1)}%`,icon:'target'},
    {label:'주문',value:`${count(totals.orders)}건`,note:`주문전환율 ${Number(totals.cvr || 0).toFixed(1)}%`,icon:'orders'},
    {label:'매출',value:won(totals.revenue),note:`광고비 ${won(totals.cost)}`,icon:'growth'}
  ];
  return <section className="marketingDiagnosisCenter">{message&&<div className="syncToast">{message}</div>}
    <article className="panel marketingCenterHead">
      <header><div><span>키워드 성과 흐름</span><h2>키워드에서 주문까지 한눈에 보기</h2><p>검색량 자료가 아직 없어 실제 검색 노출을 수요 신호로 사용합니다. 방문·주문·매출은 수집된 실제 성과입니다.</p></div><b>{periodLabel(diagnosis.period)}</b></header>
      <details className="marketingHelp"><summary>이 진단은 어떻게 보면 되나요?</summary><div><p><b>예시</b> “작두콩차효능”이 493회 노출되고 9번 방문했지만 주문이 없다면, 바로 광고를 끄지 않습니다. 방문 표본이 작으므로 더 지켜보되 건강 효능 표현은 광고문구에 그대로 쓰지 않도록 경고합니다.</p><p><b>판단 순서</b> 노출 → 방문 → 주문 → 매출을 먼저 보고, 가격·재고·리뷰·상세페이지가 주문을 막았는지 함께 확인합니다.</p><p><b>주의</b> “표본 부족”은 나쁜 결과가 아니라 아직 확실한 결론을 내릴 자료가 적다는 뜻입니다.</p></div></details>
      <div className="marketingFunnel" aria-label="검색 노출에서 매출까지 흐름">
        {funnelSteps.map((step,index)=><div className="marketingFunnelStage" key={step.label}><section><span className="marketingFunnelTitle"><i><HarinIcon name={step.icon} size={17}/></i><span><small>{String(index+1).padStart(2,'0')}</small><b>{step.label}</b></span></span><strong>{step.value}</strong><small>{step.note}</small></section>{index<funnelSteps.length-1?<i aria-hidden="true"><HarinIcon name="chevron" size={17}/></i>:null}</div>)}
      </div>
      <div className="marketingWarnings"><span>주의 표현 {count(summary.risky_expressions)}개</span><span>표본 부족 {count(summary.low_confidence)}개</span><span>노출 300회 이상·주문 0 {count(summary.high_exposure_no_order)}개</span></div>
    </article>

    <article className="panel marketingFilters">
      <header><div><span>SEARCH INTENT</span><h2>고객이 왜 검색했는지 나눠보기</h2></div><small>{items.length}개 표시</small></header>
      <div className="marketingFilterRow" aria-label="검색 의도 필터">{INTENT_ORDER.map(key=><button className={intent===key?'active':''} onClick={()=>{setIntent(key);setVisible(20);}} key={key}>{key==='ALL'?'전체 의도':definitions[key]?.label || key}{key!=='ALL'&&<small>{count(summary.intent_counts?.[key])}</small>}</button>)}</div>
      <div className="marketingFilterRow secondary" aria-label="광고 판단 필터">{ACTION_ORDER.map(key=><button className={action===key?'active':''} onClick={()=>{setAction(key);setVisible(20);}} key={key}>{ACTION_LABELS[key]}{key!=='ALL'&&<small>{count(summary.action_counts?.[key])}</small>}</button>)}</div>
    </article>

    <div className="marketingDiagnosisList">{items.slice(0,visible).map(item=><article className="panel marketingDiagnosisCard" key={item.ncc_keyword_id}>
      <header><div><span className="marketingIntent">{item.intent_label}</span>{item.compliance?.status==='WARNING'&&<span className="marketingCompliance">건강 표현 주의 · {item.compliance.matches.slice(0,3).join('·')}</span>}<h3>{item.keyword}</h3><p>{item.product ? `연결 상품 · ${item.product.name}` : '연결 상품 확인 필요'}</p></div><aside><span className={`marketingAction ${item.action_tone}`}>{item.action_label}</span><Confidence value={item.confidence}/></aside></header>
      <div className="keywordMiniFunnel"><span>노출 <b>{count(item.impressions)}</b></span><i>→</i><span>방문 <b>{count(item.clicks)}</b></span><i>→</i><span>주문 <b>{count(item.conversions)}</b></span><i>→</i><span>매출 <b>{won(item.conversion_revenue)}</b></span></div>
      <DiagnosisSequence item={item}/>
      <footer><div className="marketingChecks"><CheckPill item={item.checks?.price}/><CheckPill item={item.checks?.inventory}/><CheckPill item={item.checks?.review}/><CheckPill item={item.checks?.detail}/></div><button disabled={Boolean(effectiveActioning)} onClick={()=>register(item,item.api_action)}>{effectiveActioning===`${item.ncc_keyword_id}:${item.api_action}`?'등록 중…':item.api_action==='PAUSE'?'중지 검토 등록':item.api_action==='LOWER_BID'?'감액 검토 등록':'7일 관찰 등록'}</button></footer>
    </article>)}</div>
    {visible<items.length&&<button className="marketingMore" onClick={()=>setVisible(value=>value+20)}>20개 더 보기</button>}
    <p className="marketingLegalNote">건강 관련 검색어 경고는 고객의 표현을 광고나 상세페이지에 그대로 복사하지 않도록 돕는 사전 점검입니다. 실제 문구 사용 전 <a href="https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20250919&lsiSeq=269957&urlMode=lsInfoP" target="_blank" rel="noreferrer">식품 등의 표시·광고에 관한 법률 제8조</a>와 최신 심의기준을 확인하세요.</p>
  </section>;
}
