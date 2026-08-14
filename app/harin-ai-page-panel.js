'use client';

import { useEffect, useState } from 'react';

const STATUS_LABELS={PREVIEW:'서버 미리보기',READY:'AI 분석 완료',BLOCKED:'판단 보류',FAILED:'분석 실패'};
const CONFIDENCE_LABELS={HIGH:'높음',MEDIUM:'보통',LOW:'낮음'};

function kstDate(value){
  if(!value)return '아직 저장 안 됨';
  try{
    return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  }catch{return String(value);}
}

export default function HarinAiPagePanel({ panel, children }) {
  const [open,setOpen]=useState(false);
  const [latest,setLatest]=useState(panel?.latest_result||null);
  const [view,setView]=useState('preview');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    setLatest(panel?.latest_result||null);
    setView('preview');
    setNotice('');
    setError('');
  },[panel?.id,panel?.snapshot_token]);

  if (!panel) return null;
  const enabled=panel.execution_enabled===true;
  const selected=view==='saved'&&latest?latest:null;
  const result=selected?.result||panel.preview_result;
  const status=selected?.status||(result?.decision_status==='BLOCKED'?'BLOCKED':'PREVIEW');

  async function savePreview(){
    if(busy||!panel.snapshot_token)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/ai/page-results',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot_token:panel.snapshot_token})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok||!body.ok)throw new Error(body.error||'현재 미리보기를 저장하지 못했습니다.');
      setLatest(body.record);setView('saved');
      setNotice(body.reused?'같은 자료로 저장된 결과를 불러왔습니다.':'현재 자료 미리보기를 저장했습니다.');
    }catch(caught){setError(caught.message||'현재 미리보기를 저장하지 못했습니다.');}
    finally{setBusy(false);}
  }

  return <details className={`aiPagePanel ${open?'open':''}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>
      <div className="aiPagePulse" aria-hidden="true"><i/><i/><b>AI</b></div>
      <div className="aiPageHeadline"><span>12-5D · SAVED ANALYSIS</span><h2>{panel.title}</h2><p>{panel.summary}</p></div>
      <div className="aiPageStatus"><em className={enabled?'enabled':'locked'}>{enabled?'자동분석 사용 중':'사용 시작 전 · 비용 0원'}</em><strong>{panel.metric_value}</strong><small>{panel.metric_label}</small><b>{open?'접기 ↑':'결과 미리보기 ↓'}</b></div>
    </summary>
    <div className="aiPageBody">
      <section className="aiPageFlow" aria-label="AI 자동분석 처리 순서">
        <article><i>1</i><span><b>자료 수집</b><small>{panel.sources.join(' · ')}</small></span></article><em>→</em>
        <article><i>2</i><span><b>서버 계산</b><small>금액·비율·차단 기준은 허브가 계산</small></span></article><em>→</em>
        <article><i>3</i><span><b>결과 저장</b><small>같은 자료는 재사용해 중복 비용 방지</small></span></article>
      </section>

      <section className={`aiResultPreview ${status.toLowerCase()}`}>
        <header>
          <div><span>{STATUS_LABELS[status]||status}</span><b>{selected?'최근 저장 결과':'현재 자료 미리보기'}</b><small>{selected?kstDate(selected.created_at):'저장 전 · OpenAI 호출 없음'}</small></div>
          {latest?<nav aria-label="AI 결과 보기"><button type="button" className={view==='preview'?'active':''} onClick={()=>setView('preview')}>현재 미리보기</button><button type="button" className={view==='saved'?'active':''} onClick={()=>setView('saved')}>최근 저장</button></nav>:null}
        </header>
        <div className="aiResultStory">
          <article><i>01</i><span><small>무엇이 보이나요?</small><b>{result?.observation}</b></span></article>
          <article><i>02</i><span><small>왜 중요한가요?</small><b>{result?.impact}</b></span></article>
          <article className="action"><i>03</i><span><small>지금 무엇을 할까요?</small><b>{result?.recommendation}</b></span></article>
        </div>
        <details className="aiEvidence"><summary>판단 근거와 주의사항 보기 <b>＋</b></summary><div><ul>{(result?.evidence||[]).map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ul><p><b>신뢰도 {CONFIDENCE_LABELS[result?.confidence]||result?.confidence||'확인 필요'}</b>{result?.caution}</p></div></details>
        <footer>
          <div><span>기간</span><b>{selected?.period||panel.period}</b></div><div><span>자료 상태</span><b>{selected?.data_status||panel.data_status}</b></div><div><span>계산식 버전</span><b>{selected?.formula_version||panel.preview_formula_version}</b></div>
          <button type="button" onClick={savePreview} disabled={busy||!panel.snapshot_token}>{busy?'저장 중…':'현재 미리보기 저장'}</button>
        </footer>
        {notice?<p className="aiResultNotice" role="status">{notice}</p>:null}
        {error?<p className="aiResultError" role="alert">{error}</p>:null}
      </section>

      <section className="aiPageTaskList"><header><div><span>분석 예정 항목</span><b>{panel.readiness_label}</b></div><small>{panel.schedule}</small></header><div>{panel.tasks.map((task,index)=><span key={task}><i>{index+1}</i>{task}</span>)}</div></section>
      <p className="aiPageGuard"><b>{enabled?'자동분석이 켜져 있습니다.':'현재는 서버 미리보기만 저장합니다.'}</b> OpenAI를 호출하지 않아 비용은 0원입니다. 개인정보는 저장하지 않고, 실행·입찰 변경은 사장님 승인 전에는 작동하지 않습니다.</p>
      {open&&children?<div className="aiPageAdvanced">{children}</div>:null}
    </div>
  </details>;
}
