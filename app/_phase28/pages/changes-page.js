'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './changes-page.css';

const FILTERS=[{id:'ALL',label:'전체'},{id:'WAITING',label:'확인 대기'},{id:'VERIFIED',label:'검증 완료'},{id:'ROLLBACK',label:'복구'}];
const ACTION_LABELS={CONFIRM_EXECUTE:'지금 변경',VERIFY:'실제값 재조회',ROLLBACK:'원래 값으로 복구',REJECT:'변경안 취소'};
const DEFAULT_FLOW=[
  {id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'},
  {id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'},
  {id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'},
  {id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'}
];

function DecisionLoop({flow=[]}){
  return <nav className="changeLoop" aria-label="운영 결정 순환">{flow.map((item,index)=><Link href={item.href} prefetch={false} data-active={item.id==='changes'} aria-current={item.id==='changes'?'step':undefined} key={item.id}><i>{item.step}</i><span><small>DECISION LOOP</small><strong>{item.label}</strong><em>{item.description}</em></span>{index<flow.length-1?<b aria-hidden="true">›</b>:null}</Link>)}</nav>;
}

function SummaryStrip({model,dataUnavailable}){
  const count=value=>dataUnavailable?'확인 필요':`${value}건`;
  return <section className="changeSummary" aria-label="변경 기록 요약">
    <article><span>확인 대기</span><strong>{count(model.summary?.waiting)}</strong><small>아직 실제 반영 안 됨</small></article>
    <article><span>재조회 대기</span><strong>{count(model.summary?.recheck)}</strong><small>실행 후 실제값 대조</small></article>
    <article><span>검증 완료</span><strong>{count(model.summary?.verified)}</strong><small>실제 저장값 일치</small></article>
    <article><span>확인 필요</span><strong>{count(model.summary?.attention)}</strong><small>원본 변경·실패·불일치</small></article>
  </section>;
}

function ChangeCard({item,active,onSelect}){
  const changes=item.changes?.length?item.changes:[{field:'unknown',label:'변경값',beforeLabel:'확인 필요',afterLabel:'확인 필요'}];
  const primaryChange=changes[0];
  const extraChangeCount=Math.max(0,changes.length-1);
  return <button type="button" className="changeCard" data-selected={active} data-state={item.state} onClick={()=>onSelect(item.id)} aria-pressed={active}>
    <span className="changeRecordIdentity"><strong>{item.title}</strong><small>{item.targetLabel} · {item.createdLabel}</small><em>{item.channel} · {item.idempotencyLabel}</em></span>
    <span className="changeRecordDelta"><small>{primaryChange.label}{extraChangeCount?` 외 ${extraChangeCount}개`:''}</small><span><b>{primaryChange.beforeLabel}</b><i aria-hidden="true">→</i><strong>{primaryChange.afterLabel}</strong></span></span>
    <span className="changeRecordAudit"><small>감사 기록</small><strong>{item.writeLocked?'서버 쓰기 잠금':`${item.auditCount}건 · ${item.lastAuditLabel}`}</strong></span>
    <span className="changeRecordState"><em data-state={item.state}>{item.statusLabel}</em><small>{item.rollbackSupported?item.state==='ROLLBACK'?'복구 기록 보존':'롤백 가능':'기록 보존'}</small></span>
    <i className="changeRecordOpen" aria-hidden="true">›</i>
  </button>;
}

function ChangeDetail({item,model,busy,onAction}){
  if(!item)return <div className="changeDetail changeDetailEmpty"><span><HarinIcon name={model.error?'warning':'approvals'} size={27}/></span><strong>{model.error?'변경 기록을 확인할 수 없습니다.':'저장된 변경 기록이 없습니다.'}</strong><p>{model.error?'저장소 연결을 확인한 뒤 다시 열어주세요.':'키워드·상품·정산 작업대에서 변경 미리보기를 만들면 여기에 기록됩니다.'}</p></div>;
  const steps=item.timeline?.length?item.timeline:[{id:'created',label:'변경값 미리보기 생성',createdLabel:item.createdLabel},{id:'waiting',label:item.statusLabel,createdLabel:'현재 상태'}];
  return <div className="changeDetail">
    <header><div><span>CHANGE AUDIT</span><h2>{item.targetLabel}</h2><p>{item.channel} · {item.typeLabel} · {item.idempotencyLabel}</p></div><em data-state={item.state}>{item.writeLocked?'서버 잠금':item.statusLabel}</em></header>
    <section className="changeSafety"><span>변경 전 안전 확인</span><p>{item.safetyCopy}</p></section>
    <dl><div><dt>현재 단계</dt><dd>{item.statusLabel}</dd></div><div><dt>감사 기록</dt><dd>{model.auditsError?'확인 필요':`${item.auditCount}건`}</dd></div><div><dt>실행 후 검증</dt><dd>{item.verificationMatched?'실제값 일치':item.state==='RECHECK'?'재조회 대기':'상태 확인'}</dd></div><div><dt>복구 가능</dt><dd>{item.rollbackSupported?'원본값 보존':'기록만 보존'}</dd></div></dl>
    <ol className="changeTimeline">{steps.map((step,index)=><li key={step.id||`${step.eventType}-${index}`}><i aria-hidden="true"></i><span><b>{step.label}</b><small>{step.createdLabel}</small></span></li>)}</ol>
    {item.error?<div className="changeDetailError" role="alert"><HarinIcon name="warning" size={18}/><span><b>확인 필요</b><small>{item.error}</small></span></div>:null}
    <section className="changeNext"><span>OWNER SAFETY</span><strong>{item.writeLocked?'쓰기 잠금을 유지하고 기록만 확인합니다.':'한 번 확인하면 실행·실제값 재조회까지 이어집니다.'}</strong><div>{item.actions.map(action=><button type="button" className={action==='CONFIRM_EXECUTE'?'primary':''} disabled={Boolean(busy)} onClick={()=>onAction(item,action)} key={action}>{busy===`${item.id}:${action}`?'처리 중…':ACTION_LABELS[action]}</button>)}{!item.actions.length?<small>현재 상태에서 실행할 작업이 없습니다.</small>:null}</div></section>
    <Link className="changeValidationLink" href="/execution-validation" prefetch={false}>7·14일 결과로 이어보기 →</Link>
    <p className="changeFootnote">모든 변경은 멱등키·전후값·재조회·복구 기록을 보존하며, 누락값은 0으로 계산하지 않습니다.</p>
  </div>;
}

export default function Phase28ChangesPage({model={}}){
  const [filter,setFilter]=useState('ALL');
  const [platform,setPlatform]=useState('ALL');
  const [activeId,setActiveId]=useState(model.items?.[0]?.id||'');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const dataUnavailable=model.dataStatus==='ERROR'||Boolean(model.error);
  const counts={ALL:model.items?.length||0,WAITING:(model.items||[]).filter(item=>item.state==='WAITING').length,VERIFIED:(model.items||[]).filter(item=>item.state==='VERIFIED').length,ROLLBACK:(model.items||[]).filter(item=>item.state==='ROLLBACK').length};
  const visible=useMemo(()=>(model.items||[]).filter(item=>(filter==='ALL'||item.state===filter)&&(platform==='ALL'||item.platform===platform)),[model.items,filter,platform]);
  const active=visible.find(item=>item.id===activeId)||visible[0]||null;

  async function runAction(item,action){
    const prompts={CONFIRM_EXECUTE:`${item.targetLabel}의 변경 전후 값을 다시 확인한 뒤 지금 적용할까요?`,VERIFY:`${item.targetLabel}의 실제 저장값을 다시 조회할까요?`,ROLLBACK:`${item.targetLabel}을 실행 전 원래 값으로 복구할까요?`,REJECT:`${item.targetLabel} 변경안을 취소할까요?`};
    if(!window.confirm(prompts[action]))return;
    setBusy(`${item.id}:${action}`);setMessage('');
    try{
      const response=await fetch(`/api/financial-changes/${encodeURIComponent(item.id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,confirm:true,note:'V106 변경 기록에서 사장님 확인 후 실행'})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'변경 작업을 완료하지 못했습니다.');
      if(action==='CONFIRM_EXECUTE'&&(result.blocked||result.applied===false))throw new Error(result.request?.error_message||'자료가 바뀌어 실행을 멈췄습니다.');
      if(action==='CONFIRM_EXECUTE'&&!result.verified)throw new Error(result.request?.error_message||'반영 후 실제값이 일치하지 않습니다.');
      setMessage(action==='CONFIRM_EXECUTE'?'변경과 실제값 재조회를 완료했습니다.':action==='VERIFY'?(result.verified?'실제 저장값이 변경값과 일치합니다.':'실제 저장값 불일치를 기록했습니다.'):action==='ROLLBACK'?'원래 값 복구와 재검증을 완료했습니다.':'변경안을 취소했습니다.');
      setTimeout(()=>window.location.reload(),800);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }

  const rail=<ChangeDetail item={active} model={model} busy={busy} onAction={runAction}/>;
  return <section className="changePage" data-phase28-root="true" data-phase28-page="changes">
    <Phase28PageHeading context={`확인 대기 ${dataUnavailable?'확인 필요':`${model.summary?.waiting}건`} · 검증 완료 ${dataUnavailable?'확인 필요':`${model.summary?.verified}건`} · 복구 기록 ${dataUnavailable?'확인 필요':`${model.summary?.rollback}건`}`} title="바꾼 값과 결과를 남기는 " accent="변경기록" suffix="이에요." summary="한 번 확인한 변경은 실제 저장값 재조회와 복구 가능 여부까지 같은 장부에서 확인합니다."/>
    {model.error?<div className="changeError" role="alert"><HarinIcon name="warning" size={22}/><span><strong>변경 기록을 불러오지 못했습니다.</strong><small>{model.error} · 확인 대기와 검증 완료를 0건으로 표시하지 않습니다.</small></span></div>:null}
    <DecisionLoop flow={model.flow?.length?model.flow:DEFAULT_FLOW}/>
    <SummaryStrip model={model} dataUnavailable={dataUnavailable}/>
    {message?<div className="changeToast" role="status">{message}</div>:null}
    <Phase28RightRailLayout label="변경 감사 기록" rail={rail}>
      <section className="changeWorkbench" aria-label="변경 실행과 복구 기록">
        <header className="changeToolbar"><div role="tablist" aria-label="변경 상태">{FILTERS.map(item=><button type="button" role="tab" aria-selected={filter===item.id} data-selected={filter===item.id} onClick={()=>setFilter(item.id)} key={item.id}>{item.label} {dataUnavailable?'확인 필요':counts[item.id]}</button>)}</div><label>채널 <select value={platform} onChange={event=>setPlatform(event.target.value)}><option value="ALL">전체</option><option value="NAVER">네이버</option><option value="CAFE24">Cafe24</option><option value="COUPANG">쿠팡</option></select></label></header>
        <div className="changeListHeader" aria-hidden="true"><span>변경 대상</span><span>전후 값</span><span>감사 기록</span><span>현재 상태</span><span></span></div>
        <div className="changeList">{visible.map(item=><ChangeCard item={item} active={active?.id===item.id} onSelect={setActiveId} key={item.id}/>)}{!visible.length?<div className="changeEmpty"><HarinIcon name={dataUnavailable?'warning':'approvals'} size={26}/><strong>{dataUnavailable?'변경 기록을 확인할 수 없습니다.':'이 조건의 변경 기록이 없습니다.'}</strong><p>{dataUnavailable?'저장소 연결을 확인한 뒤 다시 열어주세요.':'상태나 채널을 바꾸면 다른 기록을 확인할 수 있습니다.'}</p></div>:null}</div>
      </section>
    </Phase28RightRailLayout>
  </section>;
}
