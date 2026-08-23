'use client';

import './keyword-bid-capability-panel.css';
import { useEffect, useMemo, useState } from 'react';
import { HarinIcon } from '../_design-system/harin-icon.js';
import capabilityModel from '../../lib/naver/bid-capability-view.js';

const {capabilityView}=capabilityModel;

function checkedAtLabel(value){
  if(!value)return '아직 실계정 검사를 실행하지 않았어요';
  try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
  catch{return '검사 시각 확인 필요';}
}

function placeholderView(){return capabilityView(null);}

export default function KeywordBidCapabilityPanel(){
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [message,setMessage]=useState('');
  const view=useMemo(()=>capabilityView(result),[result]);

  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/naver/bid-capabilities/probe',{cache:'no-store',signal:controller.signal})
      .then(async response=>{const payload=await response.json();if(!response.ok||!payload.ok)throw new Error('LOAD_FAILED');return payload.result;})
      .then(value=>{if(value)setResult(value);})
      .catch(error=>{if(error.name!=='AbortError')setMessage('저장된 검사 결과를 불러오지 못했어요. 다시 확인을 눌러주세요.');})
      .finally(()=>setLoading(false));
    return ()=>controller.abort();
  },[]);

  async function runProbe(){
    if(running)return;
    setRunning(true);setMessage('네이버 실계정의 읽기 기능을 차례로 확인하고 있어요.');
    try{
      const response=await fetch('/api/naver/bid-capabilities/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.code||'PROBE_FAILED');
      setResult(payload.result);
      setMessage(payload.result?.status==='READY'?'공식 API의 핵심 읽기 기능을 모두 확인했어요.':'확인할 항목이 남았어요. 기능표에서 상태를 확인해주세요.');
    }catch{
      setMessage('실계정 검사를 끝내지 못했어요. 자격증명과 네이버 응답 상태를 확인해주세요.');
    }finally{setRunning(false);setLoading(false);}
  }

  const shown=loading&&!result?placeholderView():view;
  return <section className="keywordCapabilityPanel" aria-labelledby="keyword-capability-title">
    <header>
      <div className="keywordCapabilityTitle">
        <i><HarinIcon name="scan" size={23}/></i>
        <span><small>24-0 · NAVER OFFICIAL API</small><h2 id="keyword-capability-title">자동입찰에 쓸 수 있는 자료를 확인해요</h2><p>실제 계정에서 제공되는 값·예상값·허브 계산값을 구분해 표시합니다.</p></span>
      </div>
      <div className="keywordCapabilityAction">
        <em className={shown.statusTone}>{shown.statusLabel}</em>
        <button type="button" onClick={runProbe} disabled={running}>{running?<><span className="keywordCapabilitySpinner"/>확인 중</>:<><HarinIcon name="sync" size={17}/>실계정 다시 확인</>}</button>
      </div>
    </header>

    <div className="keywordCapabilitySummary">
      {shown.counts.map(([label,value])=><span key={label}><small>{label}</small><b>{loading&&!result?'—':value}</b></span>)}
      <span className="checked"><small>마지막 확인</small><b>{loading&&!result?'불러오는 중':checkedAtLabel(shown.checkedAt)}</b></span>
    </div>

    {message?<p className="keywordCapabilityMessage" role="status">{message}</p>:null}

    <div className={`keywordCapabilityGroups ${loading&&!result?'loading':''}`}>
      {shown.groups.map(group=><article key={group.key}>
        <header><span><b>{group.label}</b><small>{group.description}</small></span><i><HarinIcon name={group.key==='core'?'database':group.key==='performance'?'growth':group.key==='estimate'?'target':'shield'} size={19}/></i></header>
        <div>{group.items.length?group.items.map(item=><span key={item.key}><i className={item.tone}/><em><b>{item.label}</b><small>{item.note||item.description}</small></em><strong className={item.tone}>{item.displayStatus}</strong></span>):<span className="empty"><em><b>{loading?'저장된 결과를 불러오고 있어요':'아직 검사 결과가 없어요'}</b><small>실계정 다시 확인을 누르면 항목별 상태가 표시됩니다.</small></em></span>}</div>
      </article>)}
    </div>

    <footer><HarinIcon name="shield" size={18}/><span><b>이번 검사는 입찰가를 변경하지 않아요.</b><small>GET과 네이버 공식 예상용 POST만 사용합니다. 실제 순위와 경쟁사 실제 입찰가는 제공값처럼 꾸미지 않습니다.</small></span></footer>
  </section>;
}
