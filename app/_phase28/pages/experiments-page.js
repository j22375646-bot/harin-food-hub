'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './experiments-page.css';

const LOOP=[
  {id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'},
  {id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'},
  {id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'},
  {id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'}
];
const METRICS={CTR:'클릭률',CPC:'클릭당비용',CVR:'전환율',CPA:'전환당비용',ROAS:'ROAS',REVENUE:'매출',ORDERS:'주문수',AOV:'객단가'};
const today=()=>new Date().toISOString().slice(0,10);
const initialForm=selectedProduct=>({
  action:'CREATE_TEST',name:'',hypothesis:'',master_product_id:selectedProduct?.id||'',platform:'NAVER',source_type:'MANUAL',metric:'CVR',
  start_date:today(),end_date:'',minimum_sample_size:100,confidence_level:95,minimum_detectable_lift:10,
  variants:[{name:'기존안',entity_id:''},{name:'실험안',entity_id:''}]
});
const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;

function DecisionLoop(){return <nav className="experimentsLoop" aria-label="진단부터 실험까지 결정 흐름">{LOOP.map((item,index)=><Link href={item.href} key={item.id} data-active={item.id==='experiments'}><i>{item.step}</i><span><small>STEP {item.step}</small><strong>{item.label}</strong><em>{item.description}</em></span>{index<LOOP.length-1?<b aria-hidden="true">›</b>:null}</Link>)}</nav>;}

function Summary({summary}){const rows=[['진행 중',summary.running,'매일 자동 평가'],['승자 판정',summary.winners,'표본·개선폭 충족'],['표본 대기',summary.waiting,'신뢰도 확보 필요'],['기준 미달',summary.risks,'최근 7일 비교']];return <section className="experimentsSummary" aria-label="A/B 테스트 요약">{rows.map(([label,value,copy])=><article key={label}><span>{label}</span><strong>{value==null?'확인 필요':`${value}개`}</strong><small>{copy}</small></article>)}</section>;}

function ExperimentRow({item,selected,onSelect}){return <button className="experimentRow" type="button" data-selected={selected} onClick={onSelect} aria-pressed={selected}><span className="experimentName"><strong>{item.name}</strong><small>{item.productLabel} · {item.platform} · {item.metricLabel}</small><small>{item.periodLabel}</small></span><span className="experimentVariants">{item.variants.slice(0,2).map(variant=><i key={variant.id}><b>{variant.roleLabel}</b><em>{variant.name}</em><small>{variant.metricValue} · 표본 {variant.sample.toLocaleString('ko-KR')}</small></i>)}</span><em className="experimentVerdict" data-state={item.evaluationStatus}>{item.verdictLabel}</em><b className="experimentChevron" aria-hidden="true">›</b></button>;}

function CreateExperiment({model,form,setForm,busy,onClose,onSubmit}){
  const setVariant=(index,key,value)=>setForm(current=>({...current,variants:current.variants.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item)}));
  return <section className="experimentCreate" aria-label="새 A/B 테스트 등록"><header><div><span>새 A/B 테스트</span><h2>한 번에 한 변수만 비교해요.</h2><p>표본과 신뢰도를 통과하기 전에는 승자를 만들지 않습니다.</p></div><button type="button" onClick={onClose}>등록 닫기</button></header><form onSubmit={onSubmit}>
    <label><span>실험 이름</span><input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="예: 상세 상단 정보 순서"/></label>
    <label className="wide"><span>가설</span><input value={form.hypothesis} onChange={event=>setForm({...form,hypothesis:event.target.value})} placeholder="무엇을 바꾸면 어떤 지표가 좋아질지 입력"/></label>
    <label><span>판매상품</span><select value={form.master_product_id} onChange={event=>setForm({...form,master_product_id:event.target.value})}><option value="">모든 상품</option>{model.products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label><span>플랫폼</span><select value={form.platform} onChange={event=>setForm({...form,platform:event.target.value})}>{['NAVER','CAFE24','COUPANG','ALL'].map(value=><option key={value}>{value}</option>)}</select></label>
    <label><span>자료 연결</span><select value={form.source_type} onChange={event=>setForm({...form,source_type:event.target.value})}><option value="MANUAL">수동 실적</option><option value="NAVER_ENTITY">네이버 자동집계</option><option value="CAFE24_PRODUCT">Cafe24 상품</option><option value="COUPANG_PRODUCT">쿠팡 상품</option></select></label>
    <label><span>핵심 KPI</span><select value={form.metric} onChange={event=>setForm({...form,metric:event.target.value})}>{Object.entries(METRICS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label><span>시작일</span><input type="date" required value={form.start_date} onChange={event=>setForm({...form,start_date:event.target.value})}/></label>
    <label><span>종료일</span><input type="date" required value={form.end_date} onChange={event=>setForm({...form,end_date:event.target.value})}/></label>
    <label><span>최소 표본</span><input type="number" min="1" value={form.minimum_sample_size} onChange={event=>setForm({...form,minimum_sample_size:event.target.value})}/></label>
    <label><span>필요 신뢰도</span><input type="number" min="50" max="99" value={form.confidence_level} onChange={event=>setForm({...form,confidence_level:event.target.value})}/></label>
    <label><span>최소 개선폭</span><input type="number" min="0" value={form.minimum_detectable_lift} onChange={event=>setForm({...form,minimum_detectable_lift:event.target.value})}/></label>
    <div className="variantInputs wide">{form.variants.map((variant,index)=><section key={index}><strong>{index===0?'A · 대조군':'B · 실험군'}</strong><input required value={variant.name} onChange={event=>setVariant(index,'name',event.target.value)} placeholder="변형 이름"/><input value={variant.entity_id} onChange={event=>setVariant(index,'entity_id',event.target.value)} placeholder="연결 ID · 선택"/></section>)}</div>
    <button className="submitExperiment wide" type="submit" disabled={busy}>{busy?'실험 등록 중…':'실험 시작'}</button>
  </form></section>;
}

function ManualMetrics({item,rows,setRows,busy,onSave}){return <section className="manualMetrics"><header><span>실적 입력</span><strong>수동 자료를 저장하면 서버가 즉시 다시 계산합니다.</strong></header>{rows.map((variant,index)=><section key={variant.id}><b>{variant.roleLabel} · {variant.name}</b><div>{[['impressions','노출'],['clicks','클릭'],['conversions','전환'],['orders','주문'],['revenue','매출'],['cost','비용']].map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" value={variant[key]??0} onChange={event=>setRows(current=>current.map((row,rowIndex)=>rowIndex===index?{...row,[key]:event.target.value}:row))}/></label>)}</div></section>)}<button type="button" onClick={onSave} disabled={busy}>{busy?'저장·계산 중…':'실적 저장·지금 평가'}</button></section>;}

function ExperimentRail({item,benchmarks,busy,onAction}){
  const [manualOpen,setManualOpen]=useState(false);
  const [rows,setRows]=useState([]);
  useEffect(()=>{setManualOpen(false);setRows(item?.variants?.map(variant=>({...variant}))||[]);},[item?.id]);
  if(!item)return <div className="experimentRailEmpty"><span>⌁</span><strong>선택할 실험이 없어요.</strong><p>새 실험을 등록하면 표본과 신뢰도 판정이 이곳에 표시됩니다.</p></div>;
  return <section className="experimentRail"><header><div><span>EXPERIMENT VERDICT</span><h2>{item.name}</h2><p>{item.productLabel} · {item.platform} · {item.statusLabel}</p></div><em data-state={item.evaluationStatus}>{item.verdictLabel}</em></header>
    <div className="experimentHypothesis"><span>가설</span><p>{item.hypothesis}</p></div>
    <div className="experimentGuardrails"><span><small>최소 표본</small><b>{item.samples.minimum.toLocaleString('ko-KR')}</b></span><span><small>현재 표본</small><b>{Math.min(item.samples.control,item.samples.challenger).toLocaleString('ko-KR')}</b></span><span><small>필요 신뢰도</small><b>{item.confidenceRequired}%</b></span><span><small>현재 신뢰도</small><b>{item.confidence==null?'확인 필요':`${item.confidence.toFixed(1)}%`}</b></span><span><small>최소 개선폭</small><b>{item.minimumDetectableLift}%</b></span><span><small>마지막 평가</small><b>{item.lastEvaluatedAt?String(item.lastEvaluatedAt).slice(0,10):'평가 전'}</b></span></div>
    <div className="experimentDecision"><span>NEXT SAFE ACTION</span><strong>{item.resultSummary}</strong><Link href="/execution-validation">연결 실행검증 보기 →</Link></div>
    <div className="experimentActions"><button type="button" onClick={()=>onAction(item.id,{action:'EVALUATE'})} disabled={busy}>{busy?'계산 중…':'지금 평가'}</button>{item.sourceType==='MANUAL'?<button type="button" onClick={()=>setManualOpen(value=>!value)} aria-expanded={manualOpen}>실적 입력</button>:null}{item.status==='RUNNING'?<button type="button" onClick={()=>onAction(item.id,{action:'UPDATE_STATUS',status:'COMPLETED'})} disabled={busy}>실험 종료</button>:<button type="button" onClick={()=>onAction(item.id,{action:'UPDATE_STATUS',status:'RUNNING'})} disabled={busy}>다시 시작</button>}</div>
    {manualOpen?<ManualMetrics item={item} rows={rows} setRows={setRows} busy={busy} onSave={()=>onAction(item.id,{action:'UPDATE_METRICS',variants:rows})}/>:null}
    <details className="experimentBenchmarks"><summary>연결 기준값 {benchmarks.length}개</summary>{benchmarks.map(benchmark=><p key={benchmark.id}><span>{benchmark.name}</span><b>{benchmark.currentValue} / 목표 {benchmark.targetValue}</b><em data-state={benchmark.status}>{benchmark.statusLabel}</em></p>)}</details>
    <p className="experimentFootnote">표본과 신뢰도 미충족 시 자동 승자 없음 · 상품별 결과 분리</p>
  </section>;
}

export default function Phase28ExperimentsPage({model}){
  const router=useRouter();
  const [filter,setFilter]=useState('all');
  const [activeId,setActiveId]=useState(model.items?.[0]?.id||null);
  const [createOpen,setCreateOpen]=useState(false);
  const [form,setForm]=useState(()=>initialForm(model.selectedProduct));
  const [message,setMessage]=useState('');
  const [pending,startTransition]=useTransition();
  const visible=useMemo(()=>model.items.filter(item=>filter==='all'||filter==='running'&&item.status==='RUNNING'||filter==='winner'&&item.evaluationStatus==='WINNER'||filter==='waiting'&&item.evaluationStatus==='INSUFFICIENT_SAMPLE'),[model.items,filter]);
  const active=model.items.find(item=>item.id===activeId)||visible[0]||model.items[0]||null;
  useEffect(()=>{if(active&&!activeId)setActiveId(active.id);},[active?.id,activeId]);

  function chooseProduct(productId){const query=productId?`?master_product_id=${encodeURIComponent(productId)}`:'';router.push(`/ab-tests${query}`);}
  async function request(url,payload){
    setMessage('서버에서 저장·계산하는 중입니다.');
    try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'처리 실패');setMessage(result.summary||result.result?.summary||'변경 후 실제값을 다시 확인했습니다.');startTransition(()=>router.refresh());return true;}catch(error){setMessage(`확인 필요 · ${error.message}`);return false;}
  }
  async function create(event){event.preventDefault();const saved=await request('/api/experiments',form);if(saved){setCreateOpen(false);setForm(initialForm(model.selectedProduct));}}
  async function action(id,payload){await request(`/api/experiments/${id}`,payload);}

  const rail=<ExperimentRail item={active} benchmarks={model.benchmarks} busy={pending} onAction={action}/>;
  return <section className="experimentsPage" data-phase28-root="true" data-phase28-page="experiments">
    <Phase28PageHeading context={model.dataStatus==='ERROR'?'A/B 테스트 자료 확인 필요':`진행 중 ${model.summary.running??'확인 필요'}개 · 표본 대기 ${model.summary.waiting??'확인 필요'}개`} title="검증된 결과만 남기는 " accent="A/B 테스트예요." summary="상품별 가설과 대조군·실험군을 분리하고, 최소 표본과 신뢰도를 통과한 결과만 다음 운영 기준으로 남겨요."/>
    {model.error?<div className="experimentsNotice"><strong>실험 자료를 불러오지 못했어요.</strong><small>{model.error}</small></div>:null}
    {message?<div className="experimentsMessage" role="status">{message}</div>:null}
    <DecisionLoop/><Summary summary={model.summary}/>
    <Phase28RightRailLayout label="실험 판정석" rail={rail}>
      <section className="experimentsWorkbench">
        <header className="experimentsToolbar"><div><button type="button" data-selected={filter==='all'} onClick={()=>setFilter('all')}>전체 {model.items.length}</button><button type="button" data-selected={filter==='running'} onClick={()=>setFilter('running')}>진행 중 {model.summary.running??'-'}</button><button type="button" data-selected={filter==='winner'} onClick={()=>setFilter('winner')}>승자 {model.summary.winners??'-'}</button><button type="button" data-selected={filter==='waiting'} onClick={()=>setFilter('waiting')}>표본 대기 {model.summary.waiting??'-'}</button></div><label><span>판매상품</span><select value={model.selectedProduct?.id||''} onChange={event=>chooseProduct(event.target.value)}><option value="">모든 실험</option>{model.products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button className="newExperiment" type="button" onClick={()=>setCreateOpen(value=>!value)} aria-expanded={createOpen}>새 A/B 테스트</button></header>
        {createOpen?<CreateExperiment model={model} form={form} setForm={setForm} busy={pending} onClose={()=>setCreateOpen(false)} onSubmit={create}/>:null}
        <div className="experimentList">{visible.map(item=><ExperimentRow key={item.id} item={item} selected={item.id===active?.id} onSelect={()=>setActiveId(item.id)}/>)}{visible.length?null:<div className="experimentsEmpty"><strong>이 조건의 실험이 없어요.</strong><p>필터를 바꾸거나 새 A/B 테스트를 등록해주세요.</p></div>}</div>
      </section>
    </Phase28RightRailLayout>
  </section>;
}
