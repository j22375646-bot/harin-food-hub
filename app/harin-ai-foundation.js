'use client';

import { useEffect, useState } from 'react';

const confidenceLabel={HIGH:'높음',MEDIUM:'보통',LOW:'낮음'};
const decisionLabel={READY:'실행 검토 가능',WATCH:'더 지켜보기',BLOCKED:'판단 보류'};

export default function HarinAiFoundation({ foundation }) {
  const [status,setStatus]=useState(foundation||{});
  const [result,setResult]=useState(foundation?.latest?.result||null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    let active=true;
    fetch('/api/ai/status',{cache:'no-store'}).then(response=>response.json()).then(data=>{
      if(!active||!data.ok)return;
      setStatus(current=>({...current,...data}));
    }).catch(()=>{});
    return()=>{active=false;};
  },[]);

  async function explain(force=false){
    setBusy(true);setMessage('서버 계산값만 골라 AI가 쉬운 말로 정리하는 중입니다…');
    try{
      const response=await fetch('/api/ai/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({snapshot_token:foundation.snapshot_token,force})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'AI 설명 생성 실패');
      setResult(data.result);
      setMessage(data.reused?'같은 계산자료의 저장된 설명을 불러왔습니다.':'새 설명을 생성하고 서버에 저장했습니다.');
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy(false);}
  }

  return <section className="harinAiFoundation">
    <header className="harinAiHero">
      <div><span>하린 AI · 안전한 설명 설정</span><h2>하린 AI 설명 설정</h2><p>허브가 계산한 숫자만 받아서 관찰 → 영향 → 근거 → 추천 순서로 쉽게 설명합니다. 광고비나 입찰가는 절대 자동 변경하지 않습니다.</p></div>
      <aside><small>AI 운영 상태</small><strong>{status.execution_enabled?'사용 중':'사용 시작 전'}</strong><em>{status.execution_enabled?(status.model||'모델 확인 중'):'크레딧 미사용 · 비용 0원'}</em><button type="button" disabled={busy||!status.configured||!status.execution_enabled||!foundation?.snapshot_token} onClick={()=>explain(false)}>{status.execution_enabled?(busy?'설명 만드는 중…':result?'현재 자료 다시 설명':'AI 설명 생성'):'크레딧 연결 후 사용'}</button></aside>
    </header>
    <div className="harinAiGuards">
      <span className={status.structured_outputs?'ready':'wait'}><b>정해진 답변 형식</b><small>{status.structured_outputs?'항목 누락 방지':'확인 필요'}</small></span>
      <span className={status.pii_guard?'ready':'wait'}><b>개인정보 차단</b><small>{status.pii_guard?'주문·연락처 전송 안 함':'확인 필요'}</small></span>
      <span className={status.storage_ready!==false?'ready':'wait'}><b>결과 저장</b><small>{status.storage_ready!==false?'분석 이력 보관':'DB 확인 필요'}</small></span>
      <span className={status.file_search_configured?'ready':'optional'}><b>기획서 검색</b><small>{status.file_search_configured?'File Search 연결됨':'벡터 저장소 연결 전'}</small></span>
      <span className="locked"><b>자동 변경 잠금</b><small>OWNER 승인 전 실행 없음</small></span>
    </div>
    {message&&<p className="harinAiMessage" aria-live="polite">{message}</p>}
    {result?<article className={`harinAiResult ${String(result.decision_status||'WATCH').toLowerCase()}`}>
      <header><div><span>AI STRUCTURED EXPLANATION</span><h3>{decisionLabel[result.decision_status]||result.decision_status}</h3></div><em>신뢰도 {confidenceLabel[result.confidence]||result.confidence}</em></header>
      <div className="harinAiResultFlow"><section><i>1</i><span><b>관찰</b><p>{result.observation}</p></span></section><strong>→</strong><section><i>2</i><span><b>영향</b><p>{result.impact}</p></span></section><strong>→</strong><section><i>3</i><span><b>추천</b><p>{result.recommendation}</p></span></section></div>
      <details><summary>판단 근거와 주의점 보기</summary><div><ul>{(result.evidence||[]).map(item=><li key={item}>{item}</li>)}</ul><p><b>주의</b> {result.caution}</p></div></details>
    </article>:<div className="harinAiEmpty"><b>아직 AI 설명을 만들지 않았습니다.</b><p>위 버튼을 누르면 현재 12-3 경영판의 집계 숫자만 전송합니다. 주문번호·이름·연락처·주소는 보내지 않습니다.</p></div>}
  </section>;
}
