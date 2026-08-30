'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './diagnoses-page.css';

const FILTERS=[{id:'ALL',label:'전체'},{id:'READY',label:'분석 가능'},{id:'BLOCKED',label:'판단 보류'}];
const DEFAULT_FLOW=[
  {id:'diagnoses',href:'/diagnoses',step:'01',label:'진단 근거',description:'문제와 근거를 확인'},
  {id:'changes',href:'/approvals',step:'02',label:'변경 기록',description:'바꾸기 전후를 기록'},
  {id:'validation',href:'/execution-validation',step:'03',label:'7·14일 결과',description:'매출과 이익을 검증'},
  {id:'experiments',href:'/ab-tests',step:'04',label:'다음 실험',description:'검증된 기준을 축적'}
];

function asDate(value){const date=new Date(value||0);return Number.isNaN(date.getTime())?null:date;}
function isoDate(value){const date=asDate(value)||new Date();return date.toISOString().slice(0,10);}
function initialGenerator(generatedAt){const end=asDate(generatedAt)||new Date();const start=new Date(end);start.setUTCDate(end.getUTCDate()-6);return {platform:'ALL',report_type:'WEEKLY',period_start:isoDate(start),period_end:isoDate(end)};}
function scoreLabel(value){return value==null?'판단 보류':`${Math.round(Number(value))}점`;}
function deltaLabel(value){return value==null?'비교 기준 부족':`${value>0?'+':''}${Number(value).toFixed(1)}`;}

function DecisionLoop({flow=[]}){
  return <nav className="diagLoop" aria-label="운영 결정 순환">{flow.map((item,index)=><Link href={item.href} prefetch={false} data-active={item.id==='diagnoses'} aria-current={item.id==='diagnoses'?'step':undefined} key={item.id}><i>{item.step}</i><span><small>DECISION LOOP</small><strong>{item.label}</strong><em>{item.description}</em></span>{index<flow.length-1?<b aria-hidden="true">›</b>:null}</Link>)}</nav>;
}

function SummaryStrip({model,dataUnavailable}){
  const value=number=>dataUnavailable?'확인 필요':`${number}건`;
  return <section className="diagSummary" aria-label="저장 진단 요약">
    <article><span>저장 진단</span><strong>{value(model.summary?.stored)}</strong><small>{dataUnavailable?'저장소 확인 필요':model.summary?.versions==null?'전체 버전 확인 필요':`전체 버전 ${model.summary.versions}개`}</small></article>
    <article><span>자료 준비</span><strong>{value(model.summary?.ready)}</strong><small>READY 근거만 실행 후보</small></article>
    <article><span>계산 잠금</span><strong>{value(model.summary?.blocked)}</strong><small>누락값은 0으로 계산하지 않음</small></article>
    <article><span>최신 버전</span><strong>{dataUnavailable?'확인 필요':model.latestLabel}</strong><small>{dataUnavailable?'기준시각 확인 필요':model.latestMeta}</small></article>
  </section>;
}

function DiagnosisRow({item,active,onSelect}){
  return <button type="button" className="diagRow" data-selected={active} data-state={item.state} onClick={()=>onSelect(item.id)} aria-pressed={active}>
    <span className="diagRowTitle"><strong>{item.title}</strong><small>{item.reportTypeLabel} · {item.periodLabel} · v{item.version}</small></span>
    <span className="diagRowFinding"><strong>{item.headline}</strong><small>{item.evidenceLabel}</small></span>
    {item.state==='READY'?<span className="diagScore"><b>{scoreLabel(item.score)}</b><i>{deltaLabel(item.scoreDelta)}</i></span>:<em>{item.stateLabel}</em>}
    <i aria-hidden="true">›</i>
  </button>;
}

function GeneratorTools({generatedAt,busy,onGenerate,onDaily}){
  const [form,setForm]=useState(()=>initialGenerator(generatedAt));
  function change(event){const {name,value}=event.target;setForm(current=>({...current,[name]:value}));}
  function typeChange(event){const type=event.target.value;const end=asDate(generatedAt)||new Date();const start=new Date(end);start.setUTCDate(end.getUTCDate()-(type==='MONTHLY'?29:6));setForm(current=>({...current,report_type:type,period_start:isoDate(start),period_end:isoDate(end)}));}
  return <div className="diagGenerator">
    <form onSubmit={event=>{event.preventDefault();onGenerate(form);}}>
      <label><span>채널</span><select name="platform" value={form.platform} onChange={change}><option value="ALL">전체 통합</option><option value="NAVER">네이버</option><option value="CAFE24">Cafe24</option><option value="COUPANG">쿠팡</option></select></label>
      <label><span>종류</span><select name="report_type" value={form.report_type} onChange={typeChange}><option value="WEEKLY">주간 보고서</option><option value="MONTHLY">월간 보고서</option><option value="ADHOC">수시 보고서</option></select></label>
      <label><span>시작일</span><input name="period_start" type="date" value={form.period_start} onChange={change}/></label>
      <label><span>종료일</span><input name="period_end" type="date" value={form.period_end} onChange={change}/></label>
      <button type="submit" disabled={Boolean(busy)}>{busy==='GENERATE'?'분석 중…':'선택 기간 진단 생성'}</button>
    </form>
    <button type="button" className="diagDailyButton" disabled={Boolean(busy)} onClick={onDaily}>{busy==='DAILY'?'재계산 중…':'일일 보고서·이상징후 재계산'}</button>
    <p>실제 주문·광고·원가 근거로 서버에서 계산하며, 플랫폼 값은 자동 변경하지 않습니다.</p>
  </div>;
}

function DiagnosisDetail({item,model,busy,onReportAction,onSend,onGenerate,onDaily}){
  if(!item)return <div className="diagDetail diagDetailEmpty"><span><HarinIcon name={model.error?'warning':'reports'} size={27}/></span><strong>{model.error?'진단 목록을 확인할 수 없습니다.':'저장된 진단이 없습니다.'}</strong><p>{model.error?'저장소 연결을 확인한 뒤 다시 열어주세요.':'첫 보고서를 생성하면 근거와 버전이 여기에 쌓입니다.'}</p></div>;
  return <div className="diagDetail">
    <header><div><span>EVIDENCE REPORT</span><h2>{item.title}</h2><p>{item.channel} · {item.reportTypeLabel} · {item.periodLabel} · v{item.version}</p></div><em data-state={item.state}>{item.stateLabel}</em></header>
    <section className="diagJudgement"><span>핵심 판단</span><p>{item.detailCopy}</p></section>
    <dl><div><dt>운영 점수</dt><dd>{scoreLabel(item.score)} · {deltaLabel(item.scoreDelta)}</dd></div><div><dt>근거 구성</dt><dd>{item.evidenceLabel}</dd></div><div><dt>마지막 계산</dt><dd>{item.lastCalculatedLabel}</dd></div><div><dt>AI 역할</dt><dd>{item.aiRole}</dd></div></dl>
    <section className="diagNext"><span>NEXT SAFE ACTION</span><strong>{item.nextAction}</strong><p>{item.nextActionNote}</p><Link href="/approvals" prefetch={false}>변경 기록으로 이어보기 →</Link></section>
    <div className="diagReportActions">
      <a href={`/api/reports/${encodeURIComponent(item.id)}/print`} target="_blank" rel="noreferrer">상세 보고서</a>
      <a href={`/api/reports/${encodeURIComponent(item.id)}/print?mode=owner`} target="_blank" rel="noreferrer">사장님 1페이지</a>
      <a href={`/api/reports/${encodeURIComponent(item.id)}/download`}>HTML 저장</a>
      <button type="button" disabled={Boolean(busy)} onClick={()=>onSend(item)}>이메일 발송</button>
      {!item.approvedAt?<button type="button" disabled={Boolean(busy)} onClick={()=>onReportAction(item,'APPROVE')}>최신본 승인</button>:<span>승인됨 · {item.approvedBy||'관리자'}</span>}
    </div>
    <div className="diagDetailSections">
      <details><summary><span><small>VERSION ARCHIVE</small><strong>버전 기록</strong></span><b>{model.versionsError?'확인 필요':`${item.versions.length}개`}</b></summary><div className="diagVersions">{model.versionsError?<p>버전 목록 확인 필요 · {model.versionsError}</p>:item.versions.map(version=><article key={version.id}><span><strong>v{version.version} · {version.isLatest?'현재 최신본':version.approvedAt?'당시 승인본':'보관본'}</strong><small>{version.createdLabel} · {version.revisionNote}</small></span><div><a href={`/api/reports/${encodeURIComponent(version.id)}/print`} target="_blank" rel="noreferrer">열기</a>{!version.isLatest?<button type="button" disabled={Boolean(busy)} onClick={()=>onReportAction(version,'RESTORE')}>복원</button>:null}</div></article>)}</div></details>
      <details><summary><span><small>REPORT RUNNER</small><strong>새 진단 생성</strong></span><b>필요할 때 열기</b></summary><GeneratorTools generatedAt={model.generatedAt} busy={busy} onGenerate={onGenerate} onDaily={onDaily}/></details>
      <details><summary><span><small>AUTO SCHEDULE</small><strong>자동 보고서 일정</strong></span><b>서버 예약</b></summary><div className="diagSchedule"><span><b>일간</b><small>{model.schedule?.daily}</small></span><span><b>주간</b><small>{model.schedule?.weekly}</small></span><span><b>월간 잠정</b><small>{model.schedule?.monthlyProvisional}</small></span><span><b>월간 확정</b><small>{model.schedule?.monthlyFinal}</small></span></div></details>
    </div>
    <p className="diagFootnote">보고서를 열거나 변경 기록으로 이동해도 실제 플랫폼 값은 자동 변경되지 않습니다.</p>
  </div>;
}

export default function Phase28DiagnosesPage({model={}}){
  const [filter,setFilter]=useState('ALL');
  const [period,setPeriod]=useState('30');
  const [activeId,setActiveId]=useState(model.items?.[0]?.id||'');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const dataUnavailable=model.dataStatus==='ERROR'||Boolean(model.error);
  const counts={ALL:model.items?.length||0,READY:(model.items||[]).filter(item=>item.state==='READY').length,BLOCKED:(model.items||[]).filter(item=>item.state!=='READY').length};
  const visible=useMemo(()=>{
    const reference=asDate(model.generatedAt)?.getTime()||Date.now();
    return (model.items||[]).filter(item=>{
      const stateMatches=filter==='ALL'||filter==='READY'&&item.state==='READY'||filter==='BLOCKED'&&item.state!=='READY';
      if(!stateMatches||period==='ALL')return stateMatches;
      const at=asDate(item.periodEnd||item.lastCalculatedAt)?.getTime();
      return at?reference-at<=Number(period)*86400000:true;
    });
  },[model.items,model.generatedAt,filter,period]);
  const active=visible.find(item=>item.id===activeId)||visible[0]||null;

  async function responseJson(response){const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||payload.delivery?.reason||payload.delivery?.error||'요청을 완료하지 못했습니다.');return payload;}
  async function runReportAction(report,action){
    const label=action==='APPROVE'?'최신 보고서를 승인':'선택 버전을 새 최신본으로 복원';
    if(!window.confirm(`${label}할까요? 기존 버전 기록은 그대로 보존됩니다.`))return;
    setBusy(`${report.id}-${action}`);setMessage('');
    try{await responseJson(await fetch(`/api/reports/${encodeURIComponent(report.id)}/action`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})}));setMessage(`${label}했습니다.`);setTimeout(()=>window.location.reload(),700);}catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }
  async function sendReport(report){
    if(!window.confirm(`'${report.title}' 보고서를 설정된 이메일로 발송할까요?`))return;
    setBusy('SEND');setMessage('');
    try{await responseJson(await fetch('/api/notifications/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'REPORT',report_id:report.id})}));setMessage('보고서 발송 결과를 기록했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}
  }
  async function generateReport(form){
    if(!window.confirm(`${form.period_start}부터 ${form.period_end}까지 새 진단을 생성할까요?`))return;
    setBusy('GENERATE');setMessage('');
    try{await responseJson(await fetch('/api/reports/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)}));setMessage('새 진단을 생성했습니다.');setTimeout(()=>window.location.reload(),800);}catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }
  async function runDaily(){
    if(!window.confirm('일일 보고서와 이상징후를 현재 자료로 다시 계산할까요?'))return;
    setBusy('DAILY');setMessage('');
    try{await responseJson(await fetch('/api/reports/daily',{method:'POST'}));setMessage('일일 진단 재계산을 완료했습니다.');setTimeout(()=>window.location.reload(),800);}catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }

  const rail=<DiagnosisDetail item={active} model={model} busy={busy} onReportAction={runReportAction} onSend={sendReport} onGenerate={generateReport} onDaily={runDaily}/>;
  return <section className="diagPage" data-phase28-root="true" data-phase28-page="diagnoses">
    <Phase28PageHeading context={`저장 진단 ${dataUnavailable?'확인 필요':`${model.summary?.stored}건`} · 분석 가능 ${dataUnavailable?'확인 필요':`${model.summary?.ready}건`} · 최신 ${dataUnavailable?'확인 필요':model.latestLabel}`} title="근거가 준비된 " accent={`진단은 ${dataUnavailable?'확인 필요':`${model.summary?.ready}건`}`} suffix="이에요." summary="인사이트와 상품분석에서 저장한 결과를 버전별로 다시 열고, 실제 실행 후보로 넘길 근거만 고릅니다."/>
    {model.error?<div className="diagError" role="alert"><HarinIcon name="warning" size={22}/><span><strong>진단 목록을 불러오지 못했습니다.</strong><small>{model.error} · 저장 진단 수를 0건으로 표시하지 않습니다.</small></span></div>:null}
    <DecisionLoop flow={model.flow?.length?model.flow:DEFAULT_FLOW}/>
    <SummaryStrip model={model} dataUnavailable={dataUnavailable}/>
    {message?<div className="diagToast" role="status">{message}</div>:null}
    <Phase28RightRailLayout label="진단 상세" rail={rail}>
      <section className="diagWorkbench" aria-label="저장 진단 목록">
        <header className="diagToolbar"><div role="tablist" aria-label="진단 자료 상태">{FILTERS.map(item=><button type="button" role="tab" aria-selected={filter===item.id} data-selected={filter===item.id} onClick={()=>setFilter(item.id)} key={item.id}>{item.label} {dataUnavailable?'확인 필요':counts[item.id]}</button>)}</div><label>기간 <select value={period} onChange={event=>setPeriod(event.target.value)}><option value="30">최근 30일</option><option value="90">최근 90일</option><option value="ALL">전체 기간</option></select></label></header>
        <div className="diagList">{visible.map(item=><DiagnosisRow item={item} active={active?.id===item.id} onSelect={setActiveId} key={item.id}/>)}{!visible.length?<div className="diagEmpty"><HarinIcon name={dataUnavailable?'warning':'reports'} size={26}/><strong>{dataUnavailable?'진단 목록을 확인할 수 없습니다.':'이 조건의 저장 진단이 없습니다.'}</strong><p>{dataUnavailable?'저장소 연결을 확인한 뒤 다시 열어주세요.':'기간이나 자료 상태를 바꾸거나 새 진단을 생성하세요.'}</p></div>:null}</div>
      </section>
    </Phase28RightRailLayout>
  </section>;
}
