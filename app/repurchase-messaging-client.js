'use client';

import { useState } from 'react';

const money=value=>`${Number(value||0).toLocaleString('ko-KR')}원`;
const statusLabel={DRAFT:'작성 중',APPROVED:'승인 완료',SENDING:'발송 중',SENT:'발송 완료',PARTIAL:'일부 실패',FAILED:'확인 필요',CANCELLED:'취소'};

export default function RepurchaseMessagingClient(){
  const [state,setState]=useState({configuration:null,campaigns:[],candidates:[]});
  const [selected,setSelected]=useState([]),[messageBody,setMessageBody]=useState('평소 구매 시기가 가까워져 필요한 상품이 있으신지 안내드려요.'),[consent,setConsent]=useState(false),[compliance,setCompliance]=useState(false),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  const latest=state.campaigns?.[0],config=state.configuration;
  async function call(action,extra={}){
    setBusy(action);setNotice('');
    try{const response=await fetch('/api/retention/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'작업에 실패했습니다.');setState(current=>({...current,...payload,candidates:payload.candidates??current.candidates}));if(action==='PREVIEW')setSelected([]);setNotice(action==='PREVIEW'?'최신 주문으로 재구매 후보를 확인했습니다.':action==='CREATE_DRAFT'?'발송 전 검토안을 저장했습니다.':action==='APPROVE'?'사장님 승인을 기록했습니다.':'발송 요청을 완료했습니다.');return payload;}
    catch(error){setNotice(error.message);}finally{setBusy('');}
  }
  const toggle=value=>setSelected(rows=>rows.includes(value)?rows.filter(item=>item!==value):[...rows,value]);
  return <section className="repurchaseMessaging" aria-label="재구매 메시지 운영">
    <header><div className="repurchaseIcon" aria-hidden="true">↗</div><div><span>OWNER APPROVED MESSAGE</span><h3>재구매 고객에게 필요한 때만 안내해요</h3><p>최신 주문으로 대상을 다시 확인하고, 수신동의 원본을 확인한 뒤에만 발송합니다.</p></div><button type="button" onClick={()=>call('PREVIEW')} disabled={Boolean(busy)}>{busy==='PREVIEW'?'확인 중…':'재구매 대상 불러오기'}</button></header>
    <div className="repurchaseSteps"><span><b>1</b>대상 확인</span><span><b>2</b>문구 작성</span><span><b>3</b>동의 확인</span><span><b>4</b>사장님 승인</span><span><b>5</b>발송</span></div>
    <div className="repurchaseReadiness">
      <article><small>연결 상태</small><b>{config?.configured?'발송키 준비':'키 입력 대기'}</b><em>{config?.writeEnabled?'실제 발송 허용':'발송 잠금 · 0건'}</em></article>
      <article><small>선택 대상</small><b>{selected.length}명</b><em>전화번호는 화면·DB에 저장 안 함</em></article>
      <article><small>예상 비용</small><b>{money((messageBody.length>45?45:18)*selected.length)}</b><em>실제 요금은 발송 직전 다시 계산</em></article>
    </div>
    {state.candidates?.length>0&&<div className="repurchaseGrid"><div className="repurchaseCandidates"><div className="repurchaseSectionTitle"><b>보낼 대상 선택</b><small>이름·연락처는 가려서 표시합니다.</small></div>{state.candidates.map(row=><label key={row.recipientRef} className={selected.includes(row.recipientRef)?'selected':''}><input type="checkbox" checked={selected.includes(row.recipientRef)} onChange={()=>toggle(row.recipientRef)}/><span><b>{row.recipientName} · {row.recipientPhone||'연락처 확인 필요'}</b><small>{row.productName} · 마지막 주문 {row.lastOrderDate}</small></span><em>{row.audience==='DUE'?'재구매 예정':'휴면 가능'}</em></label>)}</div>
      <div className="repurchaseComposer"><label><b>안내 문구</b><textarea value={messageBody} maxLength={1800} onChange={event=>setMessageBody(event.target.value)}/><small>(광고) 하린식품과 무료수신거부 문구는 서버에서 자동으로 붙습니다.</small></label><label className="repurchaseCheck"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>Cafe24 고객의 광고성 정보 수신동의 원본을 직접 확인했습니다.</span></label><label className="repurchaseCheck"><input type="checkbox" checked={compliance} onChange={event=>setCompliance(event.target.checked)}/><span>광고 표기·무료수신거부 번호와 발송 문구를 확인했습니다.</span></label><button type="button" onClick={()=>call('CREATE_DRAFT',{recipientRefs:selected,messageBody})} disabled={Boolean(busy)||!selected.length||!messageBody.trim()}>검토안 저장</button></div></div>}
    {latest&&<div className="repurchaseApproval"><div><span>{statusLabel[latest.status]||latest.status}</span><b>{latest.targetCount}명 · {latest.messageType} · 예상 {money(latest.estimatedCost)}</b><small>{latest.messageBody}</small></div><div><button type="button" onClick={()=>call('APPROVE',{campaignId:latest.id,consentConfirmed:consent,complianceConfirmed:compliance})} disabled={Boolean(busy)||latest.status!=='DRAFT'||!consent||!compliance}>사장님 승인</button><button type="button" className="send" onClick={()=>call('SEND',{campaignId:latest.id})} disabled={Boolean(busy)||latest.status!=='APPROVED'||!config?.writeEnabled}>승인 캠페인 발송</button></div></div>}
    {notice&&<p className="repurchaseNotice" role="status">{notice}</p>}
    <details><summary>최근 메시지 기록 보기</summary><div>{(state.campaigns||[]).map(row=><p key={row.id}><b>{statusLabel[row.status]||row.status}</b><span>{row.targetCount}명 · {row.createdAt?.slice(0,10)}</span><em>{money(row.estimatedCost)}</em></p>)}</div></details>
    <p className="repurchaseLegal">수신동의가 확인되지 않은 고객은 선택하지 마세요. 고객 ID·전화번호·주소는 캠페인 기록에 저장하지 않습니다.</p>
  </section>;
}
