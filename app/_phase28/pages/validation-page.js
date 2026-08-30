'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './validation-page.css';

const DEFAULT_FLOW=[
  {id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'},
  {id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'},
  {id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'},
  {id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'}
];

const safe=value=>String(value==null?'':value).trim();
const count=(value,unavailable)=>unavailable?'확인 필요':`${Number(value||0).toLocaleString('ko-KR')}건`;
const TIMELINE_LABELS=['실행 전 예상','DAY 0','DAY 7','DAY 14'];

function DecisionLoop({flow=[]}){
  return <nav className="validationLoop" aria-label="운영 결정 순환">{flow.map((item,index)=><Link href={item.href} prefetch={false} data-active={item.id==='validation'} aria-current={item.id==='validation'?'step':undefined} key={item.id}><i>{item.step}</i><span><small>DECISION LOOP</small><strong>{item.label}</strong><em>{item.description}</em></span>{index<flow.length-1?<b aria-hidden="true">›</b>:null}</Link>)}</nav>;
}

function SummaryStrip({model,unavailable}){
  return <section className="validationSummary" aria-label="실행검증 요약">
    <article><span>실행 완료</span><strong>{count(model.summary?.executed,unavailable)}</strong><small>7·14일 추적 대상</small></article>
    <article><span>7일 결과</span><strong>{count(model.summary?.day7Ready,unavailable)}</strong><small>초기 변화 확인</small></article>
    <article><span>14일 결과</span><strong>{count(model.summary?.day14Ready,unavailable)}</strong><small>매출과 이익 함께 판단</small></article>
    <article><span>실험 연결</span><strong>{count(model.summary?.linkedExperiments,unavailable)}</strong><small>A/B 결과와 연결</small></article>
  </section>;
}

function ActionChooser({items,activeId,onSelect}){
  if(!items.length)return <div className="validationEmpty"><HarinIcon name="validation" size={27}/><strong>추적할 실행 기록이 없습니다.</strong><p>진단에서 실행 후보를 만들고 변경기록에서 실제 반영하면 7·14일 결과가 이어집니다.</p></div>;
  return <section className="validationPicker" aria-label="검증할 실행 선택">
    <header className="validationPickerHeader"><span><small>OUTCOME QUEUE</small><strong>검증할 실행 고르기</strong></span><em>{items.length}건 · 전체 펼침</em></header>
    <div className="validationActions">{items.map(item=>{const selected=activeId===item.id;return <button type="button" className="validationAction" data-selected={selected} aria-pressed={selected} onClick={()=>onSelect(item.id)} key={item.id}><span className="validationActionMain"><i><HarinIcon name="validation" size={20}/></i><span><strong>{item.targetLabel}</strong><small>{item.channel} · {item.executedLabel}</small></span></span><span className="validationActionState"><em data-state={item.decisionState}>{item.decisionLabel}</em><small>{selected?'선택됨':'결과 보기'} <b aria-hidden="true">›</b></small></span></button>;})}</div>
  </section>;
}

function ExecutionPanel({item}){
  if(!item)return <div className="validationEmpty validationPanelEmpty"><HarinIcon name="clock" size={27}/><strong>실행 결과를 선택할 수 없습니다.</strong><p>저장된 실행 기록이 생기면 기대값과 실제 결과를 나란히 표시합니다.</p></div>;
  return <section className="validationExecution" aria-label={`${item.targetLabel} 실행 결과`}>
    <div className="validationTimeline" aria-label={TIMELINE_LABELS.join(' · ')}>{item.timeline.map(stage=><article data-stage={stage.id} key={stage.id}><span>{stage.kicker}</span><strong>{stage.title}</strong><b>{stage.value}</b><small>{stage.detail}</small></article>)}</div>
    <div className="validationEvidence">
      <article><span>실제 매출 변화</span><strong>{item.day14.revenueLabel}</strong><p>저장된 전후 기간 평가 기준</p></article>
      <article><span>실제 이익 변화</span><strong>{item.day14.profitLabel}</strong><p>평가에 이익 자료가 있을 때만 표시</p></article>
      <article><span>자료 상태</span><strong>{item.day14.ready?'READY':'확인 필요'}</strong><p>누락값은 0으로 계산하지 않음</p></article>
      <article><span>현재 판단</span><strong>{item.decisionLabel}</strong><p>{item.decisionCopy}</p></article>
    </div>
  </section>;
}

function CustomerPanel({customer={}}){
  const failed=customer.status==='ERROR';
  const days=failed||customer.period?.days==null?'확인 필요':`${customer.period.days}/90일`;
  const products=customer.products||[];
  return <section className="validationCustomer" aria-label="고객 재구매 검증">
    <div className="customerCoverage" data-ready={!failed&&customer.summary?.lifecycle_status==='READY'}><strong>{days}</strong><span><b>{failed?'고객 자료 확인 필요':customer.summary?.lifecycle_status==='READY'?'고객 재구매 판단 준비':'고객 이력 수집 중'}</b><small>개인 식별정보를 화면에 노출하지 않고 상품별 구매 간격만 계산해요.</small></span></div>
    {failed?<div className="validationNotice" role="alert"><HarinIcon name="warning" size={21}/><span><strong>고객·재구매 자료를 불러오지 못했습니다.</strong><small>{customer.error} · 주문 수를 0건으로 표시하지 않습니다.</small></span></div>:null}
    <div className="customerCycles">{products.slice(0,6).map(product=><article key={product.name}><span>{product.name}</span><strong>{product.cycle_days?`대표 주기 ${product.cycle_days}일`:'계산 대기'}</strong><p>{product.cycle_days?`재구매 고객 ${product.repeat_customers}명 · 예정 고객 ${product.due_customers??'판단 보류'}명`:`반복 간격 ${product.interval_samples}개 · 최소 3개 필요`}</p></article>)}{!products.length&&!failed?<article><span>상품별 재구매 주기</span><strong>판단 보류</strong><p>90일 주문 이력과 반복 구매 간격이 쌓이면 자동 계산합니다.</p></article>:null}</div>
    <p className="validationPrivacy"><HarinIcon name="shield" size={18}/>고객 식별자 없음 · 집계 결과만 표시 · 부족한 자료는 판단 보류</p>
  </section>;
}

function ValidationRail({item,model}){
  if(!item)return <div className="validationRail validationRailEmpty"><span><HarinIcon name={model.error?'warning':'validation'} size={28}/></span><strong>{model.error?'실행검증을 확인할 수 없습니다.':'선택할 실행 결과가 없습니다.'}</strong><p>{model.error||'실행 완료 기록이 생기면 기대와 실제를 같은 자리에서 비교합니다.'}</p></div>;
  return <div className="validationRail">
    <header><div><span>OUTCOME CHECK</span><h2>{item.targetLabel}</h2><p>{item.channel} · {item.executedLabel} · DAY 14</p></div><em data-state={item.decisionState}>{item.decisionLabel}</em></header>
    <section className="validationRailCopy"><span>예상과 실제</span><p>{item.decisionCopy}</p></section>
    <dl><div><dt>예상 효과</dt><dd>{item.expectation.metric}</dd></div><div><dt>7일 결과</dt><dd>{item.day7.valueLabel}</dd></div><div><dt>14일 이익</dt><dd>{item.day14.profitLabel}</dd></div><div><dt>연결 실험</dt><dd>{item.experimentLabel}</dd></div></dl>
    <section className="validationNext"><span>NEXT DECISION</span><strong>{item.decisionCopy}</strong><Link href="/ab-tests" prefetch={false}>연결 실험 보기 →</Link></section>
    {(model.reportsError||model.experimentsError)?<p className="validationPartial">일부 연결 자료 확인 필요 · {model.reportsError||model.experimentsError}</p>:null}
    <p className="validationFootnote">실제 저장 자료 · 고객 식별자 없음 · 부족한 자료는 판단 보류</p>
  </div>;
}

export default function Phase28ValidationPage({model={}}){
  const [tab,setTab]=useState('execution');
  const [activeId,setActiveId]=useState(model.items?.[0]?.id||'');
  const item=useMemo(()=>(model.items||[]).find(row=>row.id===activeId)||model.items?.[0]||null,[activeId,model.items]);
  const unavailable=model.dataStatus==='ERROR'||Boolean(model.error);
  const context=unavailable?'7일 결과 확인 필요 · 14일 결과 확인 필요 · 고객 이력 확인 필요':`7일 결과 ${model.summary?.day7Ready||0}건 · 14일 결과 ${model.summary?.day14Ready||0}건 · 고객 이력 ${model.customer?.period?.days??'확인 필요'}일`;
  return <section className="validationPage" data-phase28-root="true" data-phase28-page="validation">
    <Phase28PageHeading context={context} title="기대와 실제를 비교하는 " accent="실행검증" suffix="이에요." summary="실행 전 예상과 7일·14일 실제 매출·이익을 나란히 보고 유지·복구·추가 관찰을 결정해요."/>
    {model.error?<div className="validationNotice" role="alert"><HarinIcon name="warning" size={22}/><span><strong>실행검증을 불러오지 못했습니다.</strong><small>{safe(model.error)} · 결과 건수를 0건으로 표시하지 않습니다.</small></span></div>:null}
    <DecisionLoop flow={model.flow?.length?model.flow:DEFAULT_FLOW}/>
    <SummaryStrip model={model} unavailable={unavailable}/>
    <Phase28RightRailLayout label="실행검증 판단석" rail={<ValidationRail item={item} model={model}/> }>
      <section className="validationWorkbench">
        <header className="validationToolbar"><div role="tablist" aria-label="실행검증 보기"><button type="button" role="tab" aria-selected={tab==='execution'} data-selected={tab==='execution'} onClick={()=>setTab('execution')}>실행 결과</button><button type="button" role="tab" aria-selected={tab==='customer'} data-selected={tab==='customer'} onClick={()=>setTab('customer')}>고객·재구매</button></div><span>{tab==='execution'?'실행을 고르면 타임라인이 바뀝니다.':'고객 식별자는 화면에 표시하지 않습니다.'}</span></header>
        {tab==='execution'?<><ActionChooser items={model.items||[]} activeId={item?.id} onSelect={setActiveId}/><ExecutionPanel item={item}/></>:<CustomerPanel customer={model.customer}/>} 
      </section>
    </Phase28RightRailLayout>
  </section>;
}
