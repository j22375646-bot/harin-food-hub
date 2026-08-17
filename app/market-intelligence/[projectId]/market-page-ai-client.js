'use client';

import {useState} from 'react';
import {HarinBadge,HarinButton,HarinPictogram} from '../../_design-system/harin-ui.js';

const META={
  data:{label:'자료실',title:'근거 준비도 분석',icon:'database',tone:'blue'},
  market:{label:'시장 분석',title:'시장범위·고객 신호 분석',icon:'analysis',tone:'lavender'},
  competition:{label:'경쟁 분석',title:'경쟁 불편·차별화 분석',icon:'search',tone:'pink'},
  conversion:{label:'구매 전환',title:'구매장벽·성장 흐름 분석',icon:'target',tone:'mint'}
};
const confidence={LOW:'낮음 · 자료 확인 필요',MEDIUM:'보통 · 서버 근거 있음',HIGH:'높음'};
const date=value=>value?new Date(value).toLocaleString('ko-KR'):'저장 전';

export default function MarketPageAi({projectId,workspace,productName}){
  const meta=META[workspace],endpoint=`/api/market-intelligence/projects/${projectId}/page-ai?workspace=${workspace}`;
  const [opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[data,setData]=useState(null),[message,setMessage]=useState('');

  async function load(){
    if(loading)return;setLoading(true);setMessage('');
    try{const response=await fetch(endpoint,{cache:'no-store'}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||'분석 준비표를 불러오지 못했습니다.');setData(body);}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}
  }
  async function save(){
    if(saving)return;setSaving(true);setMessage('');
    try{const response=await fetch(endpoint.split('?')[0],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace})}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||'미리보기를 저장하지 못했습니다.');setData(current=>({...current,...body.preview,latest:body.record}));setMessage(body.message);}
    catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving(false);}
  }
  function toggle(event){const next=event.currentTarget.open;setOpened(next);if(next&&!data&&!loading)load();}

  const preview=data?.result,latest=data?.latest,nclue=data?.snapshot?.nclue;
  return <details className={`marketPageAi marketPageAi-${workspace}`} onToggle={toggle} open={opened}>
    <summary>
      <HarinPictogram icon="ai" tone="lavender" size={24}/>
      <span><small>이 페이지의 독립 AI</small><b>{meta.title}</b><p>{productName}와 {meta.label}의 검증 자료만 사용해요.</p></span>
      <em>사용 시작 전 · 비용 0원</em><strong>{opened?'접기 ↑':'분석 준비표 보기 ↓'}</strong>
    </summary>
    <div className="marketPageAiBody">
      {loading?<div className="marketAiLoading"><i/><span><b>{meta.label} 자료를 확인하고 있어요</b><small>외부 AI 호출 없이 서버 집계만 읽습니다.</small></span></div>:data?<>
        <section className="marketAiBoundary"><article><HarinPictogram icon={meta.icon} tone={meta.tone}/><span><small>분석 범위</small><b>{productName} · {meta.label}</b></span></article><article><HarinPictogram icon="database" tone="blue"/><span><small>근거 격리</small><b>프로젝트 Evidence {data.snapshot.evidence_ids.length}개</b></span></article><article><HarinPictogram icon="shield" tone="pink"/><span><small>안전장치</small><b>추천만 · 자동 변경 없음</b></span></article><article><HarinPictogram icon="ai" tone="lavender"/><span><small>현재 비용</small><b>OpenAI 호출 0회 · 0원</b></span></article></section>
        <section className={`marketAiStory ${preview.decision_status.toLowerCase()}`}>
          <header><div><HarinBadge tone={preview.decision_status==='BLOCKED'?'warning':'lavender'}>{preview.decision_status==='BLOCKED'?'판단 보류':'서버 미리보기'}</HarinBadge><span>신뢰도 {confidence[preview.confidence]||preview.confidence}</span></div><small>계산식 {data.snapshot.formula_version}</small></header>
          <div><article><i>01</i><span><small>무엇이 보이나요?</small><b>{preview.observation}</b></span></article><article><i>02</i><span><small>왜 중요한가요?</small><b>{preview.impact}</b></span></article><article className="action"><i>03</i><span><small>지금 무엇을 할까요?</small><b>{preview.recommendation}</b></span></article></div>
          <details><summary>판단 근거와 주의사항 <b>보기 ＋</b></summary><section><ul>{preview.evidence.map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ul><p>{preview.caution}</p></section></details>
        </section>
        {workspace==='conversion'&&nclue?<NcluePilot pilot={nclue}/>:null}
        <footer className="marketAiActions"><span><small>최근 저장</small><b>{latest?date(latest.created_at):'아직 저장한 결과 없음'}</b></span><HarinButton type="button" variant="secondary" icon="sync" onClick={load} disabled={loading||saving}>현재 자료 다시 계산</HarinButton><HarinButton type="button" variant="primary" icon="checklist" onClick={save} disabled={loading||saving}>{saving?'저장 중…':'비용 없이 미리보기 저장'}</HarinButton></footer>
      </>:null}
      {message?<p className="marketAiMessage" role={message.startsWith('확인 필요')?'alert':'status'}>{message}</p>:null}
      <p className="marketAiGuard"><b>페이지별 AI는 합치지 않습니다.</b> 크레딧 사용을 시작해도 이 상품·이 단계의 구조화된 집계만 전달하고, 고객명·연락처·주문번호와 플랫폼 쓰기 권한은 제외합니다.</p>
    </div>
  </details>;
}

function NcluePilot({pilot}){
  return <section className="ncluePilot">
    <header><div><HarinPictogram icon="customer" tone="lavender"/><span><small>NCLUE READINESS PILOT</small><b>CRM 행동예측 연동 준비도</b><p>실제 연동이 아니라 기술·비용·동의·법적 조건을 먼저 확인하는 파일럿입니다.</p></span></div><HarinBadge tone={pilot.status==='READY'?'success':pilot.status==='PARTIAL'?'warning':'neutral'}>{pilot.ready_gates}/{pilot.total_gates} 준비</HarinBadge></header>
    <div className="nclueGateGrid">{pilot.gates.map(item=><article className={item.ready?'ready':'blocked'} key={item.id}><i>{item.ready?'✓':'!'}</i><span><b>{item.label}</b><small>{item.detail}</small></span></article>)}</div>
    <div className="nclueSignals"><span><small>식별 가능 집계</small><b>{pilot.eligible_cohort_count==null?'판단 보류':`${pilot.eligible_cohort_count.toLocaleString('ko-KR')}명`}</b></span><span><small>재구매 신호</small><b>{pilot.repeat_signal_count==null?'판단 보류':`${pilot.repeat_signal_count.toLocaleString('ko-KR')}명`}</b></span><span><small>휴면 신호</small><b>{pilot.dormant_signal_count==null?'판단 보류':`${pilot.dormant_signal_count.toLocaleString('ko-KR')}명`}</b></span></div>
    <p><HarinPictogram icon="shield" tone="pink" size={16}/>{pilot.safety}</p>
  </section>;
}
