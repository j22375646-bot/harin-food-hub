'use client';

import './harin-execution-v8.css';
import Link from 'next/link';
import { useState } from 'react';
import { HarinPageAiRegion, HarinPageContent, HarinPageFrame, HarinPageHeader, HarinPageToolbar, HarinProgressiveDetails } from '../_design-system/harin-ui.js';

const STEPS=[
  {id:'reports',href:'/diagnoses',number:'01',label:'진단',description:'근거와 문제 확인'},
  {id:'changes',href:'/approvals',number:'02',label:'변경 기록',description:'확인·실행·복구 기록'},
  {id:'validation',href:'/execution-validation',number:'03',label:'7·14일 검증',description:'매출·이익 결과 비교'},
  {id:'experiments',href:'/ab-tests',number:'04',label:'A/B 학습',description:'검증된 기준 축적'}
];

const META={
  reports:{eyebrow:'진단 근거',title:'진단 근거를 실행 후보로 정리해요',description:'중복된 경고는 묶고, 실제로 결정할 수 있는 근거와 다음 행동만 보여드립니다.',tone:'lavender'},
  changes:{eyebrow:'변경 안전 기록',title:'바꾼 값과 실행 결과를 한곳에서 확인해요',description:'확인 팝업 한 번 뒤 바로 실행하고, 실제 저장값 재조회와 복구 기록까지 남깁니다.',tone:'pink'},
  validation:{eyebrow:'실행 결과 검증',title:'7일과 14일 결과를 나란히 확인해요',description:'실행 전 기대치와 실제 매출·이익을 비교해 유지·복구·추가관찰을 결정합니다.',tone:'blue'},
  experiments:{eyebrow:'실험 학습',title:'검증된 결과만 다음 운영 기준으로 남겨요',description:'표본과 신뢰도를 통과한 실험만 학습하고, 판단이 이른 실험은 그대로 보류합니다.',tone:'mint'}
};

const DETAIL_META={
  reports:['진단 목록·보고서 전체 보기','저장된 보고서의 전체 근거와 인쇄·관리 도구를 확인합니다.'],
  changes:['변경·복구 기록 전체 보기','확인 전 값, 실행·재조회 결과와 복구 기록을 확인합니다.'],
  validation:['실행 결과·기록 전체 보기','실행 전과 7일·14일 결과, 연결된 실험 기록을 자세히 확인합니다.'],
  experiments:['A/B 테스트 등록·전체 기록','새 실험 등록과 진행·종료된 실험의 표본·결과를 자세히 확인합니다.']
};

const number=value=>Number(value||0).toLocaleString('ko-KR');
const won=value=>value==null?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const statusLabel={PLANNED:'실행 예정',ON_HOLD:'판단 보류',EXECUTED:'실행 완료',PREVIEWED:'확인 전',APPROVED:'실행 준비',VERIFIED:'검증 완료',VERIFICATION_FAILED:'검증 불일치',ROLLED_BACK:'복구 완료',FAILED:'실행 실패',STALE:'원본 변경',RUNNING:'진행 중',COMPLETED:'종료',CANCELLED:'취소'};
const outcomeLabel={IMPROVED:'개선',DECLINED:'하락',INCONCLUSIVE:'판단 보류',BASELINE:'기준선',STABLE:'유지',BLOCKED:'계산 잠금',WINNER:'승자 확정',INSUFFICIENT_SAMPLE:'표본 대기',NOT_EVALUATED:'평가 전'};

function FlowIcon({view}){
  if(view==='changes')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.2c0 4.8 3 8.2 7.5 9.8 4.5-1.6 7.5-5 7.5-9.8V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>;
  if(view==='validation')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m6 14v-7m5 7V3"/><path d="m3 15 5-5 5 2 7-7"/></svg>;
  if(view==='experiments')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M8 15h8"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>;
}

function workflowCounts(data){
  const learning=data.reportLearningHistory?.summary||{};
  const execution=data.retentionValidation?.execution||{},summary=execution.summary||{};
  const experiments=Array.isArray(data.experiments)?data.experiments:[];
  const actions=Array.isArray(data.actions)?data.actions:[];
  return {
    reports:Number(learning.learned||data.reports?.length||0),
    changes:actions.filter(item=>['PLANNED','ON_HOLD'].includes(item.status)).length+(execution.changes||[]).filter(item=>['PREVIEWED','APPROVED'].includes(item.status)).length,
    validation:Number(summary.day7_ready||0)+Number(summary.day14_ready||0),
    experiments:experiments.length
  };
}

function DiagnosisDesk({data,selected,setSelected}){
  const items=data.reportLearningHistory?.items||[];
  const active=items.find(item=>item.id===selected)||items[0];
  return <section className="executionDecisionDesk">
    <div className="executionChoiceList">{items.slice(0,5).map(item=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i/><span><b>{item.title}</b><small>{item.period_start} ~ {item.period_end}</small></span><em>{outcomeLabel[item.outcome]||item.outcome}</em></button>)}{!items.length?<p>저장된 진단이 생기면 이곳에서 실행 후보를 고를 수 있어요.</p>:null}</div>
    <article className="executionDecisionDetail">{active?<><span>{active.platform} · {active.report_type}</span><h2>{active.title}</h2><div className="executionEvidenceGrid"><span><small>운영점수</small><b>{active.score==null?'판단 보류':`${Number(active.score).toFixed(0)}점`}</b></span><span><small>직전 대비</small><b>{active.score_delta==null?'기준선':`${active.score_delta>0?'+':''}${Number(active.score_delta).toFixed(1)}점`}</b></span><span><small>자료 상태</small><b>{active.data_status==='READY'?'분석 가능':'확인 필요'}</b></span></div><p>{active.next_actions?.[0]?.reason||active.observations?.[0]?.body||'진단 근거를 확인하고 실행할 항목만 선택하세요.'}</p><footer><Link href="/approvals">변경 기록으로 이동 <i>→</i></Link><small>보고서를 이동해도 자동 실행되지 않습니다.</small></footer></>:<div className="executionEmpty"><b>진단 자료를 기다리고 있어요</b><p>보고서가 생성되면 근거와 다음 행동을 여기에 보여줍니다.</p></div>}</article>
  </section>;
}

function ApprovalDesk({data,selected,setSelected}){
  const changes=data.retentionValidation?.execution?.changes||[];
  const active=changes.find(item=>item.id===selected)||changes[0];
  const locked=data.naverBidWorkbench?.execution_enabled!==true;
  return <section className="executionDecisionDesk ownerSafetyDesk" id="owner-safety-preview">
    <div className="executionChoiceList">{changes.slice(0,6).map(item=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i/><span><b>{item.target_key}</b><small>{item.change_type} · 변경 기록 {number(item.audit_count)}건</small></span><em>{statusLabel[item.status]||item.status}</em></button>)}{!changes.length?<p>변경값을 만들면 실제 반영 전에 안전 미리보기가 표시됩니다.</p>:null}</div>
    <article className="executionDecisionDetail">{active?<><span>OWNER SAFETY PREVIEW · 확인 전</span><h2>{active.target_key}</h2><div className="executionEvidenceGrid"><span><small>변경 항목</small><b>{number(active.changes?.length)}개</b></span><span><small>쓰기가능 상태</small><b>{locked?'서버 잠금':'확인 후 즉시 실행'}</b></span><span className={active.reversible?'safe':'warning'}><small>되돌리기</small><b>{active.reversible?'복구 가능':'지원 안 함'}</b></span></div><div className="executionDiffPreview">{(active.changes||[]).slice(0,3).map(change=><span key={change.field}><small>{change.field}</small><b>{String(change.before??'없음')}</b><i>→</i><strong>{String(change.after??'없음')}</strong></span>)}</div><footer><Link href="/approvals#approval-work-list">전체 변경 기록 <i>→</i></Link><small>확인 팝업 전에는 값을 비교만 하며 플랫폼을 변경하지 않습니다.</small></footer></>:<div className="executionEmpty"><b>현재 확인할 변경값이 없어요</b><p>원가·예산·입찰 변경값을 만들면 안전 미리보기가 표시됩니다.</p></div>}</article>
  </section>;
}

function ValidationDesk({data,selected,setSelected}){
  const actions=data.retentionValidation?.execution?.actions||[];
  const active=actions.find(item=>item.id===selected)||actions[0];
  return <section className="executionDecisionDesk validationDesk">
    <div className="executionChoiceList">{actions.slice(0,6).map(item=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i/><span><b>{item.target_name||'대상 이름 없음'}</b><small>{item.platform} · {statusLabel[item.status]||item.status}</small></span><em>{outcomeLabel[item.day14?.status]||item.day14?.label||'추적 중'}</em></button>)}{!actions.length?<p>실행된 결정이 생기면 7일·14일 결과가 자동으로 연결됩니다.</p>:null}</div>
    <article className="executionDecisionDetail">{active?<><span>BEFORE → DAY 7 → DAY 14</span><h2>{active.target_name||'실행 대상'}</h2><div className="executionCheckpointGrid"><span><small>실행 전 기대</small><b>{active.expectation?.metric||'효과 확인'}</b><p>{active.expectation?.effect}</p></span><span className={String(active.day7?.status||'waiting').toLowerCase()}><small>7일 · {active.day7?.due_date||'계산 대기'}</small><b>{active.day7?.label||'자료 수집 중'}</b><p>매출 {won(active.day7?.revenue_change)}</p></span><span className={String(active.day14?.status||'waiting').toLowerCase()}><small>14일 · {active.day14?.due_date||'계산 대기'}</small><b>{active.day14?.label||'자료 수집 중'}</b><p>이익 {won(active.day14?.profit_change)}</p></span></div><footer><Link href={active.experiment?'/ab-tests':'/ab-tests'}>{active.experiment?'연결된 A/B 테스트 보기':'A/B 테스트로 검증 확장'} <i>→</i></Link><small>{active.experiment?active.experiment.name:'한 번에 한 변수만 바꾸는 실험을 권장합니다.'}</small></footer></>:<div className="executionEmpty"><b>아직 검증할 실행이 없어요</b><p>실행이 완료되면 기준일과 결과일을 자동 계산합니다.</p></div>}</article>
  </section>;
}

function ExperimentDesk({data,selected,setSelected}){
  const items=Array.isArray(data.experiments)?data.experiments:[];
  const active=items.find(item=>item.id===selected)||items[0];
  const variants=active?.ab_test_variants||[];
  return <section className="executionDecisionDesk experimentLearningDesk">
    <div className="executionChoiceList">{items.slice(0,6).map(item=><button type="button" className={active?.id===item.id?'active':''} onClick={()=>setSelected(item.id)} key={item.id}><i/><span><b>{item.name}</b><small>{item.platform} · {item.start_date} ~ {item.end_date}</small></span><em>{outcomeLabel[item.evaluation_status]||statusLabel[item.status]||item.status}</em></button>)}{!items.length?<p>첫 A/B 테스트를 등록하면 표본·신뢰도·승자 상태를 보여줍니다.</p>:null}</div>
    <article className="executionDecisionDetail">{active?<><span>EXPERIMENT LEARNING</span><h2>{active.name}</h2><p className="executionHypothesis">{active.hypothesis||'가설을 입력하면 결과를 다음 운영 기준으로 재사용하기 쉬워집니다.'}</p><div className="executionVariantPreview">{variants.slice(0,2).map(item=><span className={item.id===active.winner_variant_id?'winner':''} key={item.id}><small>{item.is_control?'A · 대조군':'B · 실험군'}</small><b>{item.name}</b><em>주문 {number(item.orders||item.conversions)} · 매출 {won(item.revenue)}</em></span>)}</div><footer><Link href="/execution-validation">연결된 실행 결과 보기 <i>→</i></Link><small>{active.evaluation_status==='WINNER'?'신뢰도를 통과한 승자만 운영 기준으로 남깁니다.':'표본이 충분해질 때까지 판단을 보류합니다.'}</small></footer></>:<div className="executionEmpty"><b>아직 등록된 실험이 없어요</b><p>아래에서 가설과 대조군·실험군을 등록해 시작하세요.</p></div>}</article>
  </section>;
}

export default function HarinExecutionWorkbench({view,data={},aiPanel,children}){
  const meta=META[view]||META.reports,counts=workflowCounts(data);
  const [selectedByView,setSelectedByView]=useState({});
  const selected=selectedByView[view]||'';
  const setSelected=id=>setSelectedByView(current=>({...current,[view]:id}));
  const summary=data.retentionValidation?.execution?.summary||{};
  const detailMeta=DETAIL_META[view]||DETAIL_META.reports;
  const heroMetrics=view==='reports'?[['저장 진단',`${number(counts.reports)}건`],['개선 신호',`${number(data.reportLearningHistory?.summary?.improved)}건`],['계산 잠금',`${number(data.reportLearningHistory?.summary?.blocked)}건`]]:view==='changes'?[['확인 대기',`${number(counts.changes)}건`],['검증 완료',`${number(summary.verified_changes)}건`],['서버 쓰기',data.naverBidWorkbench?.execution_enabled?'확인 후 실행':'잠금']]:view==='validation'?[['7일 결과',`${number(summary.day7_ready)}건`],['14일 결과',`${number(summary.day14_ready)}건`],['실험 연결',`${number(summary.linked_experiments)}건`]]:[['등록 실험',`${number(counts.experiments)}개`],['진행 중',`${number((data.experiments||[]).filter(item=>item.status==='RUNNING').length)}개`],['승자 확정',`${number((data.experiments||[]).filter(item=>item.evaluation_status==='WINNER').length)}개`]];
  return <HarinPageFrame kind="execution" className={`executionV8 executionV8-${meta.tone}`}>
    <HarinPageHeader className="executionHero" eyebrow={meta.eyebrow} title={meta.title} description={meta.description} icon={view} tone={meta.tone} note="AI는 설명만 · 실제 플랫폼 변경은 사장님 확인 팝업 뒤 · 자료가 부족하면 판단 보류" metrics={heroMetrics}/>
    <HarinPageToolbar className="executionStageToolbar" label="결정에서 학습까지" description="페이지는 나누고, 현재 단계와 다음 단계는 한 줄로 이어서 보여드려요.">
      <nav className="executionStageRail" aria-label="진단부터 학습까지 운영 흐름">{STEPS.map((step,index)=><Link href={step.href} className={view===step.id?'active':''} aria-current={view===step.id?'step':undefined} key={step.id}><i>{step.number}</i><span><b>{step.label}</b><small>{step.description}</small></span><em>{number(counts[step.id])}</em>{index<STEPS.length-1?<strong aria-hidden="true">→</strong>:null}</Link>)}</nav>
    </HarinPageToolbar>
    <HarinPageContent className="executionPageContent">
      {view==='reports'?<DiagnosisDesk data={data} selected={selected} setSelected={setSelected}/>:null}
      {view==='changes'?<ApprovalDesk data={data} selected={selected} setSelected={setSelected}/>:null}
      {view==='validation'?<ValidationDesk data={data} selected={selected} setSelected={setSelected}/>:null}
      {view==='experiments'?<ExperimentDesk data={data} selected={selected} setSelected={setSelected}/>:null}
      <HarinProgressiveDetails id="execution-full-workbench" className="executionFullWorkbench" eyebrow="상세 운영·기록" title={detailMeta[0]} description={detailMeta[1]} count={`${number(counts[view])}건`} action="상세 열기">
        {children}
      </HarinProgressiveDetails>
    </HarinPageContent>
    <HarinPageAiRegion className="executionAiSlot" id="page-ai-analysis" title={`${meta.title} · AI 분석`}>{aiPanel}</HarinPageAiRegion>
  </HarinPageFrame>;
}
