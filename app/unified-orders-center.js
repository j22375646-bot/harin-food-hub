'use client';

import { useEffect, useMemo, useState } from 'react';
import { HarinIcon } from './_design-system/harin-icon.js';

const STAGE_LABELS={PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',SHIPPING:'배송중',DELIVERED:'배송완료'};
const CHANNEL_LABELS={ALL:'전체 채널',NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'};
const TIMING_LABELS={SAME_DAY:'당일출고',DELAYED:'배송지연'};
const POSTAL_COURIER_BY_PLATFORM=Object.freeze({COUPANG:'EPOST',NAVER:'EPOST',CAFE24:'0012'});
const ACTIVE_STAGES=new Set(['PAID','PREPARING','READY_TO_SHIP']);
const ORDER_WORKSPACES=[
  {id:'ACTIVE',label:'현재 주문',description:'지금 포장·출고할 판매자배송',short:'처리할 주문'},
  {id:'EPOST',label:'우체국 발급',description:'송장 없는 주문을 자동발급',short:'송장 발급'},
  {id:'REGISTER',label:'쇼핑몰 송장등록',description:'발급·직접입력 송장을 채널에 반영',short:'채널 등록'},
  {id:'IN_TRANSIT',label:'배송중',description:'우체국 이동상태를 한 번에 확인',short:'배송 확인'},
  {id:'COMPLETED',label:'최근 완료',description:'최근 30일 완료 건만 확인',short:'30일 완료'},
  {id:'RETRY',label:'재시도',description:'송장은 보존하고 채널 전송만 재실행',short:'실패 복구'}
];
const money=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const dateTime=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'주문일 확인 필요';
const postalTracking=value=>String(value||'').replace(/\D/g,'').slice(0,13);

function matchesOrderWorkspace(order,workspace,invoices,actions,trackingStates){
  const action=actions[order.hubOrderId];
  const tracking=trackingStates[order.hubOrderId]||order.tracking;
  const draftInvoice=postalTracking(invoices[order.hubOrderId]||action?.invoiceNumber);
  const active=ACTIVE_STAGES.has(order.stage)&&order.fulfillment!=='ROCKET_GROWTH';
  if(workspace==='ACTIVE')return active;
  if(workspace==='EPOST')return active&&order.shippingEligible&&!order.invoiceNumber&&draftInvoice.length!==13&&action?.status!=='SUCCESS';
  if(workspace==='REGISTER')return active&&!order.invoiceNumber&&draftInvoice.length===13&&action?.status!=='SUCCESS'&&action?.status!=='FAILED';
  if(workspace==='IN_TRANSIT')return order.stage==='SHIPPING'||tracking?.statusCode==='IN_TRANSIT';
  if(workspace==='COMPLETED')return order.stage==='DELIVERED'||tracking?.statusCode==='DELIVERED';
  if(workspace==='RETRY')return action?.status==='FAILED';
  return false;
}

function ChannelState({ channel }) {
  const label={READY:'정상',FAILED:'수집 실패',SETUP_REQUIRED:'설정 필요',RECONNECT_REQUIRED:'재연결 필요'}[channel.status]||channel.label;
  return <span className={`unifiedChannelState ${String(channel.status||'').toLowerCase()}`}><i/><b>{CHANNEL_LABELS[channel.platform]}</b><em>{label}</em><small>{channel.message}</small></span>;
}

function DeliveryInfo({ order }) {
  const initialReceiver=order.demoReceiver||order.receiver;
  const [state,setState]=useState(initialReceiver?{status:'READY',receiver:initialReceiver}:{status:'LOADING'});
  useEffect(()=>{
    let active=true;
    if(order.demo||order.receiver)return ()=>{active=false;};
    scheduleDetail(()=>loadDeliveryDetail(order))
      .then(receiver=>active&&setState({status:'READY',receiver}))
      .catch(error=>active&&setState({status:'FAILED',error:error.message}));
    return ()=>{active=false;};
  },[order.platform,order.externalOrderId,order.shipmentId]);
  const receiver=state.receiver||{};
  const address=[receiver.postCode&&`(${receiver.postCode})`,receiver.address,receiver.addressDetail].filter(Boolean).join(' ');
  return <div className={`orderDeliveryInfo ${state.status.toLowerCase()}`} aria-live="polite">
    <header><b>배송정보</b><small>{state.status==='LOADING'?'자동으로 불러오는 중…':state.status==='READY'?'항상 표시':'자동 조회 확인 필요'}</small></header>
    {state.status==='READY'?<div><span><small>받는 분</small><b>{receiver.name||'-'}</b></span><span><small>연락처</small><b>{receiver.contact||receiver.safeNumber||'-'}</b></span><span className="deliveryAddress"><small>주소</small><b>{address||'-'}</b></span><span className="deliveryMemo"><small>배송메모</small><b>{receiver.message||'배송메모 없음'}</b></span></div>:<p>{state.status==='LOADING'?'버튼을 누르지 않아도 배송지·연락처·메모가 자동으로 표시됩니다.':state.error}</p>}
  </div>;
}

function TimingBadge({ badge }) {
  if(!badge)return null;
  return <span className={`orderTimingBadge ${badge.type.toLowerCase()}`} title={badge.detail}>{badge.label||TIMING_LABELS[badge.type]}</span>;
}

function TimingNotice({ badge }) {
  if(!badge)return null;
  const action=badge.type==='DELAYED'?'출고 상태를 바로 확인하세요':'오늘 출고할 주문입니다';
  return <div className={`orderTimingNotice ${badge.type.toLowerCase()}`}><span>{badge.detail}</span><b>{action}</b></div>;
}

function InvoiceEntry({ order, value='', onChange=()=>{}, actionState }) {
  const registered=postalTracking(order.invoiceNumber);
  const current=registered||value;
  const complete=current.length===13;
  const stateLabel={ISSUING:'우체국 발급 중',RUNNING:'채널 전송 중',SUCCESS:'쇼핑몰 전송 완료',QUEUED:'고정 IP 처리 대기',FAILED:'다시 시도 필요'}[actionState?.status];
  return <div className={`orderInvoiceEntry${registered?' registered':''}${actionState?.status?` ${actionState.status.toLowerCase()}`:''}`}>
    <div><span><small>우체국 송장번호</small><b>{registered?'이미 등록된 송장':complete?'직접 입력한 송장':'선택 후 위 버튼에서 자동발급'}</b></span>{stateLabel?<em>{stateLabel}</em>:<em>{complete?'13자리 입력 완료':'발급 전'}</em>}</div>
    <label><input inputMode="numeric" autoComplete="off" maxLength={13} value={current} disabled={Boolean(registered)||!order.shippingEligible||order.demo} onChange={event=>onChange(order,postalTracking(event.target.value))} placeholder="자동발급 또는 13자리 직접 입력" aria-label={`${order.hubOrderId} 우체국 송장번호`}/><span>{registered?'플랫폼에 등록된 최신 송장입니다.':order.demo?'화면 확인용 샘플입니다.':order.shippingEligible?'자동발급 버튼을 쓰면 번호 입력과 플랫폼 등록까지 한 번에 끝납니다.':order.shippingBlockedReason}</span></label>
    {actionState?.error?<p>{actionState.error} · 송장번호는 보존되며 쇼핑몰 전송만 다시 시도합니다.</p>:null}
  </div>;
}

function TrackingStatus({ state }) {
  if(!state)return null;
  const tone=state.status==='FAILED'?'failed':state.statusCode==='DELIVERED'?'delivered':state.statusCode==='IN_TRANSIT'?'shipping':'waiting';
  return <details className={`orderTrackingStatus ${tone}`}><summary><span><small>우체국 배송추적</small><b>{state.statusLabel||'배송상태 확인'}</b></span><em>{state.checkedAt?dateTime(state.checkedAt):'확인 대기'}</em></summary><div>{state.error?<p>{state.error}</p>:state.latestEvent?<><b>{state.latestEvent.name||state.latestEvent.resultName||state.statusLabel}</b><span>{[state.latestEvent.postOffice,state.latestEvent.time&&dateTime(state.latestEvent.time)].filter(Boolean).join(' · ')}</span></>:<p>우체국 접수 후 이동 내역이 표시됩니다.</p>}{state.events?.length>1?<ol>{state.events.slice(0,8).map((event,index)=><li key={`${event.time||'event'}-${index}`}><b>{event.name||event.resultName||'배송 처리'}</b><span>{[event.postOffice,event.time&&dateTime(event.time)].filter(Boolean).join(' · ')}</span></li>)}</ol>:null}</div></details>;
}

function OrderCard({ order, selected, onSelect, invoiceDraft='', onInvoiceChange, actionState, trackingState }) {
  return <article className={`unifiedOrderCard${order.cancellationRequested?' cancelWarning':''}${order.demo?' demoOrderCard':''}`}>
    {order.cancellationRequested?<div className="orderCancelWarning"><b>출고 멈춤 · 취소/반품 요청 확인</b><span>출고 전에 해당 쇼핑몰에서 요청 상태를 먼저 확인하세요.</span></div>:null}
    <header className="unifiedOrderCardHeader"><div className="orderBadgeGroup"><label className={`shippingSelect${order.shippingEligible?'':' blocked'}`} title={order.shippingBlockedReason||'포장·배송 작업에 선택'}><input type="checkbox" checked={selected} disabled={!order.shippingEligible} onChange={event=>onSelect(order,event.target.checked)}/><span>{order.demo?'샘플':order.shippingEligible?'작업 선택':'선택 불가'}</span></label><span className={`channelBadge ${order.platform.toLowerCase()}`}>{order.channelLabel}</span>{order.platform==='COUPANG'&&order.fulfillment==='SELLER'?<span className="sellerDeliveryBadge">판매자배송</span>:null}{order.fulfillment==='ROCKET_GROWTH'?<span className="fulfillmentBadge">로켓그로스</span>:null}</div><div className="orderStatusGroup"><span className="orderStageBadge">{STAGE_LABELS[order.stage]||'상태 확인'}</span><TimingBadge badge={order.timingBadge}/><b className="orderAmount">{money(order.amount)}</b></div></header>
    <TimingNotice badge={order.timingBadge}/>
    <section><div><span>허브 주문번호</span><b>{order.hubOrderId}</b></div><div><span>쇼핑몰 주문번호</span><b>{order.externalOrderId}</b></div><div><span>주문 시각</span><b>{dateTime(order.orderedAt)}</b></div></section>
    <div className="unifiedOrderProduct"><div className="orderItemRows">{order.items?.length?order.items.map((item,index)=><div className="orderItemRow" key={`${item.externalItemId||item.name}-${index}`}><span><small>상품명</small><b>{item.name}</b></span><span><small>옵션</small><b>{item.option||'기본 옵션'}</b></span><strong>{count(item.quantity)}개</strong></div>):<p>상품 상세는 다음 수집 때 자동으로 채워집니다.</p>}<em>{(order.packagingInstructions||[]).join(' · ')}</em></div><strong className="orderTotalQuantity">총 {order.quantity?`${count(order.quantity)}개`:'-'}</strong></div>
    <DeliveryInfo order={order}/>
    <InvoiceEntry order={order} value={invoiceDraft} onChange={onInvoiceChange} actionState={actionState}/>
    <TrackingStatus state={trackingState||order.tracking}/>
  </article>;
}

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function pollShippingTransfer(item){
  if(item.platform!=='COUPANG'||!item.requestId||!['QUEUED','RUNNING'].includes(item.status))return item;
  for(let attempt=0;attempt<35;attempt+=1){
    await wait(1200);
    const response=await fetch(`/api/coupang/operations/${encodeURIComponent(item.requestId)}`,{cache:'no-store'});
    const result=await response.json();
    if(response.status===202)continue;
    if(!response.ok||!result.ok)throw new Error(result.error||'쿠팡 송장 전송에 실패했습니다.');
    return {...item,status:'SUCCESS',error:''};
  }
  throw new Error('고정 IP 서버 응답이 늦습니다. 송장번호는 보존됐으니 채널 전송만 다시 시도하세요.');
}
const detailQueue=[];
let detailActive=0;
function drainDetailQueue(){
  while(detailActive<6&&detailQueue.length){
    const next=detailQueue.shift();detailActive+=1;
    Promise.resolve().then(next.task).then(next.resolve,next.reject).finally(()=>{detailActive-=1;drainDetailQueue();});
  }
}
function scheduleDetail(task){return new Promise((resolve,reject)=>{detailQueue.push({task,resolve,reject});drainDetailQueue();});}

async function coupangDetail(order) {
  const queued=await fetch(`/api/coupang/orders/detail?shipmentBoxId=${encodeURIComponent(order.shipmentId)}`).then(response=>response.json().then(data=>({status:response.status,data})));
  if(!queued.data?.ok)throw new Error(queued.data?.error||'쿠팡 상세 조회 요청 실패');
  const id=queued.data.request?.id;
  if(!id)throw new Error('쿠팡 상세 조회 번호가 없습니다.');
  for(let attempt=0;attempt<25;attempt+=1){
    await wait(1200);
    const response=await fetch(`/api/coupang/operations/${encodeURIComponent(id)}`);
    const result=await response.json();
    if(response.status===202)continue;
    if(!response.ok||!result.ok)throw new Error(result.error||'쿠팡 상세 조회 실패');
    return result.order;
  }
  throw new Error('고정 IP 서버 응답이 늦습니다. 잠시 뒤 다시 눌러주세요.');
}

async function loadDeliveryDetail(order){
  if(order.platform==='COUPANG'){
    if(!order.shipmentId)throw new Error('쿠팡 배송번호가 없어 자동 조회할 수 없습니다.');
    const detail=await coupangDetail(order);
    return detail.receiver||{};
  }
  if(order.platform==='CAFE24'){
    const response=await fetch(`/api/cafe24/orders/delivery-detail?orderId=${encodeURIComponent(order.externalOrderId)}`,{cache:'no-store'});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'Cafe24 배송정보 조회 실패');
    return result.receiver||{};
  }
  if(order.platform==='NAVER'&&order.receiver)return order.receiver;
  throw new Error('배송정보 자동 조회를 지원하지 않는 채널입니다.');
}

function ShippingWorkbench({ mode, orders, selectedIds, invoices, setInvoices, actionResults, setActionResults, trackingStates, setTrackingStates }) {
  const selected=orders.filter(order=>selectedIds.has(order.hubOrderId));
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');
  const [liveCandidates,setLiveCandidates]=useState([]);
  const storedCandidates=useMemo(()=>{
    const groups=new Map();
    selected.forEach(order=>{if(order.shippingCandidateKey){const rows=groups.get(order.shippingCandidateKey)||[];rows.push(order);groups.set(order.shippingCandidateKey,rows);}});
    return [...groups.values()].filter(rows=>rows.length>1).map(rows=>rows.map(order=>order.hubOrderId));
  },[selected]);
  const printIds=selected.map(order=>order.hubOrderId).join(',');
  const labelTargets=selected.filter(order=>postalTracking(order.invoiceNumber).length===13||(actionResults[order.hubOrderId]?.status==='SUCCESS'&&postalTracking(invoices[order.hubOrderId]).length===13));
  const labelIds=labelTargets.map(order=>order.hubOrderId).join(',');
  const paidTargets=selected.filter(order=>order.stage==='PAID');
  const invoiceTargets=selected.filter(order=>['PREPARING','READY_TO_SHIP'].includes(order.stage)&&postalTracking(order.invoiceNumber||invoices[order.hubOrderId]).length===13&&!order.invoiceNumber&&actionResults[order.hubOrderId]?.status!=='SUCCESS');
  const retryTargets=invoiceTargets.filter(order=>actionResults[order.hubOrderId]?.status==='FAILED');
  const autoIssueTargets=selected.filter(order=>order.shippingEligible&&!order.invoiceNumber&&['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage));
  useEffect(()=>{
    let active=true;
    async function loadTransferHistory(){
      try{
        const response=await fetch('/api/shipping/actions',{cache:'no-store'});
        const history=await response.json();
        if(!response.ok||!history.ok||!active)return;
        const rows=history.results||[];
        setActionResults(previous=>({...previous,...Object.fromEntries(rows.map(item=>[item.hubOrderId,item]))}));
        setInvoices(previous=>({...previous,...Object.fromEntries(rows.filter(item=>item.invoiceNumber).map(item=>[item.hubOrderId,item.invoiceNumber]))}));
        await Promise.all(rows.filter(item=>item.platform==='COUPANG'&&['QUEUED','RUNNING'].includes(item.status)).map(async item=>{
          try{
            const settled=await pollShippingTransfer(item);
            if(active)setActionResults(previous=>({...previous,[item.hubOrderId]:settled}));
          }catch(error){if(active)setActionResults(previous=>({...previous,[item.hubOrderId]:{...item,status:'FAILED',error:error.message}}));}
        }));
      }catch{}
    }
    loadTransferHistory();
    return()=>{active=false;};
  },[setActionResults,setInvoices]);
  useEffect(()=>{
    let active=true;
    fetch('/api/shipping/tracking',{cache:'no-store'}).then(response=>response.json()).then(result=>{
      if(active&&result.ok)setTrackingStates(Object.fromEntries((result.states||[]).map(item=>[item.hubOrderId,item])));
    }).catch(()=>{});
    return()=>{active=false;};
  },[setTrackingStates]);
  async function refreshTracking(){
    const selectedTracked=selected.filter(order=>postalTracking(order.invoiceNumber).length===13);
    if(selected.length&&!selectedTracked.length){
      setMessage('선택한 주문에는 전송이 끝난 13자리 송장번호가 없습니다. 송장 전송 후 다시 확인해주세요.');
      return;
    }
    setBusy('TRACKING');setMessage('서울 고정 IP 서버에서 우체국 배송상태를 확인하고 있습니다…');
    try{
      const response=await fetch('/api/shipping/tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderIds:selectedTracked.map(order=>order.hubOrderId)})});
      const queued=await response.json();
      if(!response.ok||!queued.ok)throw new Error(queued.error||'배송상태 확인 시작 실패');
      let latest;
      for(let attempt=0;attempt<35;attempt+=1){
        if(attempt)await wait(1200);
        const pollResponse=await fetch('/api/shipping/tracking',{cache:'no-store'});
        latest=await pollResponse.json();
        if(!pollResponse.ok||!latest.ok)throw new Error(latest.error||'배송추적 결과 확인 실패');
        const targetIds=new Set((queued.queued||[]).flatMap(item=>item.hubOrderIds||[]));
        const targetStates=(latest.states||[]).filter(item=>!targetIds.size||targetIds.has(item.hubOrderId));
        if(targetStates.length&&targetStates.every(item=>item.status!=='QUEUED'))break;
      }
      const rows=latest?.states||[];
      setTrackingStates(Object.fromEntries(rows.map(item=>[item.hubOrderId,item])));
      const failures=rows.filter(item=>item.status==='FAILED').length;
      setMessage(`배송상태 확인 완료 · 배송중 ${rows.filter(item=>item.statusCode==='IN_TRANSIT').length}건 · 배달완료 ${rows.filter(item=>item.statusCode==='DELIVERED').length}건${failures?` · 확인 필요 ${failures}건`:''}`);
    }catch(error){setMessage(`배송추적 실패 · ${error.message}`);}finally{setBusy('');}
  }
  async function pollPostalIssue(item){
    if(!item?.request?.id)throw new Error(`${item?.hubOrderId||'주문'} 발급 작업번호가 없습니다.`);
    for(let attempt=0;attempt<80;attempt+=1){
      if(attempt)await wait(1500);
      const response=await fetch(`/api/epost/issue?requestId=${encodeURIComponent(item.request.id)}`,{cache:'no-store'});
      const result=await response.json();
      if(response.status===202)continue;
      if(!response.ok||!result.ok)throw new Error(result.error||`${item.hubOrderId} 송장 발급 실패`);
      const invoiceNumber=postalTracking(result.result?.trackingNo);
      if(invoiceNumber.length!==13)throw new Error(`${item.hubOrderId} 송장번호 13자리를 확인하지 못했습니다.`);
      return {hubOrderId:item.hubOrderId,invoiceNumber,reused:Boolean(result.result?.reused)};
    }
    throw new Error(`${item.hubOrderId} 우체국 응답이 늦습니다. 잠시 뒤 다시 시도해주세요.`);
  }

  async function issueAndTransfer(){
    if(!autoIssueTargets.length)return setMessage('송장이 없는 결제완료·준비중·출고대기 주문을 선택하세요.');
    if(!window.confirm(`선택한 ${autoIssueTargets.length}건의 실제 우체국 송장을 발급하고 각 쇼핑몰에 자동 등록할까요?\n실제 계약소포 접수가 생성됩니다.`))return;
    setBusy('AUTO_ISSUE');
    setMessage('1/3 결제완료 주문을 상품준비중으로 바꾸고 있습니다…');
    setActionResults(previous=>({...previous,...Object.fromEntries(autoIssueTargets.map(order=>[order.hubOrderId,{status:'ISSUING',action:'AUTO_ISSUE'}]))}));
    try{
      let readyTargets=[...autoIssueTargets];
      const paid=autoIssueTargets.filter(order=>order.stage==='PAID');
      if(paid.length){
        const prepareResponse=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action:'PREPARE',orders:paid.map(order=>({hubOrderId:order.hubOrderId}))})});
        const prepare=await prepareResponse.json();
        const settled=await Promise.all((prepare.results||[]).map(async item=>{try{return await pollShippingTransfer({...item,status:item.ok?(item.status||'SUCCESS'):'FAILED'});}catch(error){return {...item,status:'FAILED',error:error.message};}}));
        const failedIds=new Set(settled.filter(item=>item.status==='FAILED').map(item=>item.hubOrderId));
        readyTargets=readyTargets.filter(order=>!failedIds.has(order.hubOrderId));
        if(!readyTargets.length)throw new Error('상품준비중 변경에 실패해 송장을 발급하지 않았습니다.');
      }
      setMessage(`2/3 우체국 송장 ${readyTargets.length}건을 자동발급하고 있습니다…`);
      const issueResponse=await fetch('/api/epost/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,orderIds:readyTargets.map(order=>order.hubOrderId)})});
      const issuedStart=await issueResponse.json();
      if(!issueResponse.ok||!issuedStart.ok)throw new Error(issuedStart.error||'우체국 송장 자동발급 시작 실패');
      const issued=await Promise.all((issuedStart.results||[]).filter(item=>item.ok).map(async item=>{try{return {...await pollPostalIssue(item),ok:true};}catch(error){return {hubOrderId:item.hubOrderId,ok:false,error:error.message};}}));
      const invoiceById=Object.fromEntries(issued.filter(item=>item.ok).map(item=>[item.hubOrderId,item.invoiceNumber]));
      setInvoices(previous=>({...previous,...invoiceById}));
      const transferTargets=readyTargets.filter(order=>invoiceById[order.hubOrderId]);
      if(!transferTargets.length)throw new Error(issued.find(item=>!item.ok)?.error||'발급된 송장이 없습니다.');
      setMessage(`3/3 발급된 송장 ${transferTargets.length}건을 쇼핑몰에 등록하고 있습니다…`);
      const transferResponse=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action:'UPLOAD_INVOICE',orders:transferTargets.map(order=>({hubOrderId:order.hubOrderId,invoiceNumber:invoiceById[order.hubOrderId],deliveryCompanyCode:POSTAL_COURIER_BY_PLATFORM[order.platform]}))})});
      const transfer=await transferResponse.json();
      const immediate=(transfer.results||[]).map(item=>({...item,status:item.ok?(item.status||'SUCCESS'):'FAILED',action:'AUTO_ISSUE',error:item.error||'',invoiceNumber:invoiceById[item.hubOrderId]}));
      const settled=await Promise.all(immediate.map(async item=>{try{return await pollShippingTransfer(item);}catch(error){return {...item,status:'FAILED',error:error.message};}}));
      setActionResults(previous=>({...previous,...Object.fromEntries(settled.map(item=>[item.hubOrderId,item]))}));
      const completed=settled.filter(item=>item.status==='SUCCESS').length;
      const transferFailed=settled.filter(item=>item.status==='FAILED');
      const issueFailed=issued.filter(item=>!item.ok);
      setMessage(`자동 출고 처리 완료 · 송장발급 ${issued.filter(item=>item.ok).length}건 · 쇼핑몰 등록 ${completed}건${issueFailed.length||transferFailed.length?` · 다시 확인 ${issueFailed.length+transferFailed.length}건`:''}`);
    }catch(error){
      setMessage(`자동 출고 처리 중단 · ${error.message}`);
      setActionResults(previous=>({...previous,...Object.fromEntries(autoIssueTargets.filter(order=>previous[order.hubOrderId]?.status==='ISSUING').map(order=>[order.hubOrderId,{status:'FAILED',action:'AUTO_ISSUE',error:error.message}]))}));
    }finally{setBusy('');}
  }
  async function run(action){
    if(!selected.length)return setMessage('먼저 아래 주문에서 ‘작업 선택’을 눌러주세요.');
    const targets=action==='PREPARE'?paidTargets:invoiceTargets;
    if(!targets.length)return setMessage(action==='PREPARE'?'선택 주문 중 결제완료 상태가 없습니다.':'준비중·출고대기 주문에 우체국 송장번호 13자리를 먼저 입력해주세요.');
    const label=action==='PREPARE'?'상품준비중으로 변경':'송장을 각 쇼핑몰에 전송';
    if(!window.confirm(`대상 ${targets.length}건을 ${label}할까요?\n실제 쇼핑몰 주문이 변경됩니다.`))return;
    const rows=targets.map(order=>({hubOrderId:order.hubOrderId,invoiceNumber:postalTracking(order.invoiceNumber||invoices[order.hubOrderId]),deliveryCompanyCode:POSTAL_COURIER_BY_PLATFORM[order.platform]}));
    setActionResults(previous=>({...previous,...Object.fromEntries(targets.map(order=>[order.hubOrderId,{status:'RUNNING',action}]))}));
    setBusy(action);setMessage('채널별로 안전하게 처리 중입니다…');
    try{
      const response=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action,orders:rows})});
      const result=await response.json();
      const immediate=(result.results||[]).map(item=>({...item,status:item.ok?(item.status||'SUCCESS'):'FAILED',action,error:item.error||''}));
      setActionResults(previous=>({...previous,...Object.fromEntries(immediate.map(item=>[item.hubOrderId,item]))}));
      const settled=await Promise.all(immediate.map(async item=>{
        try{return await pollShippingTransfer(item);}catch(error){return {...item,status:'FAILED',error:error.message};}
      }));
      setActionResults(previous=>({...previous,...Object.fromEntries(settled.map(item=>[item.hubOrderId,item]))}));
      const completed=settled.filter(item=>item.status==='SUCCESS').length;
      const failed=settled.filter(item=>item.status==='FAILED');
      setMessage(`쇼핑몰 전송 완료 ${completed}건 · 채널만 재시도 ${failed.length}건${failed.length?` · ${failed.map(item=>`${item.hubOrderId}: ${item.error}`).join(' / ')}`:''}`);
    }catch(error){setActionResults(previous=>({...previous,...Object.fromEntries(targets.map(order=>[order.hubOrderId,{status:'FAILED',action,error:error.message}]))}));setMessage(`처리 실패 · ${error.message}`);}finally{setBusy('');}
  }
  async function findCandidates(){
    const targets=selected.filter(order=>order.platform==='COUPANG').slice(0,10);
    if(!targets.length){setLiveCandidates([]);setMessage('선택한 쿠팡 주문이 없습니다. Cafe24 후보는 아래에 바로 표시됩니다.');return;}
    setBusy('CANDIDATES');setMessage(`쿠팡 ${targets.length}건의 수령지를 서울 고정 IP로 확인 중입니다…`);
    try{
      const details=await Promise.all(targets.map(async order=>({order,detail:await coupangDetail(order)})));
      const groups=new Map();
      details.forEach(({order,detail})=>{const receiver=detail.receiver||{};const key=[receiver.name,receiver.postCode,receiver.address,receiver.addressDetail].map(value=>String(value||'').replace(/\s+/g,'').toLowerCase()).join('|');if(!receiver.name||!receiver.postCode||!receiver.address)return;const rows=groups.get(key)||[];rows.push(order.hubOrderId);groups.set(key,rows);});
      const candidates=[...groups.values()].filter(rows=>rows.length>1);
      setLiveCandidates(candidates);setMessage(candidates.length?`쿠팡 묶음배송 후보 ${candidates.length}묶음을 찾았습니다. 자동 합배송되지 않습니다.`:'같은 수령지로 확인되는 쿠팡 주문이 없습니다.');
    }catch(error){setMessage(`후보 확인 실패 · ${error.message}`);}finally{setBusy('');}
  }
  if(!['EPOST','REGISTER','IN_TRANSIT','RETRY'].includes(mode))return null;
  const workbenchCopy={
    EPOST:{title:'우체국 송장 자동발급',description:'선택한 주문의 우체국 송장을 발급하고 쇼핑몰 등록까지 이어서 처리합니다.'},
    REGISTER:{title:'쇼핑몰 송장등록',description:'발급되었거나 직접 입력한 13자리 송장번호를 각 쇼핑몰에 등록합니다.'},
    IN_TRANSIT:{title:'배송중 상태 확인',description:'우체국 이동상태를 새로 받아 배송중·배송완료를 자동으로 구분합니다.'},
    RETRY:{title:'실패 작업 다시 처리',description:'발급된 송장번호는 그대로 두고 실패한 쇼핑몰 등록만 다시 실행합니다.'}
  }[mode];
  return <section className={`shippingWorkbench shippingWorkbenchFocused mode-${mode.toLowerCase()}`}>
    <header><div><span>PHASE 13-4 · SHIPPING WORKSPACE</span><h2>{workbenchCopy.title}</h2><p>{workbenchCopy.description}</p></div><b>{selected.length?`${selected.length}건 선택`:'아래 주문을 선택하세요'}</b></header>
    <div className="shippingWorkbenchBody">
    {mode==='EPOST'?<><div className="postalAutomationFlow"><span className={selected.length?'done':''}><i>1</i><b>주문 선택</b><small>{selected.length?`${selected.length}건 선택됨`:'아래 주문에서 선택'}</small></span><strong>→</strong><span><i>2</i><b>송장 자동발급</b><small>우체국 계약소포</small></span><strong>→</strong><span><i>3</i><b>쇼핑몰 자동등록</b><small>쿠팡·Cafe24·네이버</small></span></div><div className="shippingSelectionSummary"><span><small>결제완료</small><b>{count(paidTargets.length)}건</b></span><span><small>준비중·출고대기</small><b>{count(selected.length-paidTargets.length)}건</b></span><span><small>송장 입력완료</small><b>{count(invoiceTargets.length)}건</b></span></div><button className="postalAutomationPrimary" type="button" onClick={issueAndTransfer} disabled={Boolean(busy)||!autoIssueTargets.length}>{busy==='AUTO_ISSUE'?'송장 발급·등록 처리 중…':`선택 ${count(autoIssueTargets.length)}건 송장 자동발급 + 쇼핑몰 등록`}</button></>:null}
    {mode==='IN_TRANSIT'?<div className="trackingWorkspaceAction"><span><b>배송중 주문 전체 상태 확인</b><small>선택하지 않아도 현재 배송중 송장을 모두 조회합니다.</small></span><button type="button" onClick={refreshTracking} disabled={Boolean(busy)}>{busy==='TRACKING'?'배송조회 중…':'우체국 배송상태 새로고침'}</button></div>:null}
    {(mode==='EPOST')&&(storedCandidates.length||liveCandidates.length)?<div className="shippingCandidates"><b>묶음배송 후보 · 자동 합배송 안 함</b>{[...storedCandidates,...liveCandidates].map((rows,index)=><span key={`${rows.join('-')}-${index}`}>{rows.length}건 · {rows.join(' · ')}</span>)}</div>:null}
    {['REGISTER','RETRY'].includes(mode)&&selected.length?<section className="invoiceWorkbench"><header><div><b>선택 주문 송장번호</b><small>자동발급 번호가 여기에 채워집니다. 기존 송장은 직접 입력해서 등록할 수도 있습니다.</small></div></header><div>{selected.map(order=>{const result=actionResults[order.hubOrderId];return <label className={result?.status?.toLowerCase()||''} key={order.hubOrderId}><span><b>{order.hubOrderId}</b><small>{order.channelLabel} · {order.productName}</small>{result?<em>{result.status==='ISSUING'?'우체국 발급 중':result.status==='RUNNING'?'채널 등록 중':result.status==='FAILED'?`다시 확인 · ${result.error}`:result.status==='QUEUED'?'고정 IP 처리 대기':'쇼핑몰 등록 완료'}</em>:null}</span><input inputMode="numeric" maxLength={13} disabled={Boolean(order.invoiceNumber)||result?.status==='SUCCESS'} value={postalTracking(order.invoiceNumber||invoices[order.hubOrderId])} onChange={event=>setInvoices(previous=>({...previous,[order.hubOrderId]:postalTracking(event.target.value)}))} placeholder="자동발급 또는 13자리 직접 입력"/></label>})}</div><button onClick={()=>run('UPLOAD_INVOICE')} disabled={Boolean(busy)||!invoiceTargets.length}>{busy==='UPLOAD_INVOICE'?'쇼핑몰 등록 중…':mode==='RETRY'?`실패 ${count(retryTargets.length)}건 다시 등록`:`입력된 송장 ${count(invoiceTargets.length)}건 쇼핑몰 등록`}</button></section>:null}
    {['EPOST','REGISTER'].includes(mode)?<details className="shippingUtilityTools"><summary><span><b>인쇄·기타 출고 도구</b><small>포장명세서·라벨·묶음 후보는 필요할 때만 사용하세요.</small></span><em>열기</em></summary><div className="shippingActions"><button onClick={()=>run('PREPARE')} disabled={Boolean(busy)||!paidTargets.length}>{busy==='PREPARE'?'처리 중…':`상품준비중 변경 ${count(paidTargets.length)}건`}</button><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=packing&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">포장명세서</a><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=dispatch&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">출고목록</a><a className={!labelTargets.length?'disabled':''} href={labelTargets.length?`/api/shipping/print?type=label&ids=${encodeURIComponent(labelIds)}`:'#'} target="_blank" rel="noreferrer">송장 라벨 인쇄</a><button className="secondary" onClick={findCandidates} disabled={Boolean(busy)||!selected.length}>{busy==='CANDIDATES'?'주소 확인 중…':'묶음배송 후보'}</button></div></details>:null}
    {message?<p className="shippingMessage">{message}</p>:null}
    </div>
  </section>;
}

export default function UnifiedOrdersCenter({ center, children, aiPanel }) {
  const [currentCenter,setCurrentCenter]=useState(center);
  const [liveState,setLiveState]=useState({status:'IDLE',message:'매시 정각 자동수집 · 필요할 때 아래 버튼으로 즉시 수집할 수 있습니다.'});
  const [workspace,setWorkspace]=useState('ACTIVE');
  const [platform,setPlatform]=useState('ALL');
  const [stage,setStage]=useState('ALL');
  const [query,setQuery]=useState('');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [actionOnly,setActionOnly]=useState(false);
  const [timingOnly,setTimingOnly]=useState('ALL');
  const [selectedIds,setSelectedIds]=useState(()=>new Set());
  const [invoiceDrafts,setInvoiceDrafts]=useState({});
  const [shippingActionResults,setShippingActionResults]=useState({});
  const [trackingStates,setTrackingStates]=useState(()=>Object.fromEntries(center.orders.filter(order=>order.tracking).map(order=>[order.hubOrderId,order.tracking])));
  const [showCount,setShowCount]=useState(20);
  const [clock,setClock]=useState(null);
  const [scanQuery,setScanQuery]=useState('');
  const [scanMessage,setScanMessage]=useState('');
  const workspaceCounts=useMemo(()=>Object.fromEntries(ORDER_WORKSPACES.map(item=>[item.id,currentCenter.orders.filter(order=>matchesOrderWorkspace(order,item.id,invoiceDrafts,shippingActionResults,trackingStates)).length])),[currentCenter.orders,invoiceDrafts,shippingActionResults,trackingStates]);
  const workspaceOrders=useMemo(()=>currentCenter.orders.filter(order=>matchesOrderWorkspace(order,workspace,invoiceDrafts,shippingActionResults,trackingStates)),[currentCenter.orders,workspace,invoiceDrafts,shippingActionResults,trackingStates]);
  const visible=useMemo(()=>workspaceOrders.filter(order=>{
    const needle=query.trim().toLowerCase();
    if(platform!=='ALL'&&order.platform!==platform)return false;
    if(workspace==='ACTIVE'&&stage!=='ALL'&&order.stage!==stage)return false;
    if(workspace==='ACTIVE'&&actionOnly&&!order.actionRequired)return false;
    if(workspace==='ACTIVE'&&timingOnly!=='ALL'&&order.timingBadge?.type!==timingOnly)return false;
    const date=String(order.orderedAt||'').slice(0,10);
    if(startDate&&date<startDate)return false;
    if(endDate&&date>endDate)return false;
    if(needle&&!`${order.hubOrderId} ${order.externalOrderId} ${order.productName} ${(order.productNames||[]).join(' ')}`.toLowerCase().includes(needle))return false;
    return true;
  }),[workspaceOrders,workspace,platform,stage,query,startDate,endDate,actionOnly,timingOnly]);
  async function refreshLiveOrders(){
    setLiveState({status:'LOADING',message:'전체 플랫폼 주문·배송 상태를 수집하고 있습니다.'});
    try{
      const response=await fetch('/api/orders/live-refresh',{method:'POST',cache:'no-store'});
      const result=await response.json();
      if(result.center)setCurrentCenter(result.center);
      if(!response.ok||!result.ok)throw new Error(result.error||result.cafe24Error||'최신 주문 상태 확인 실패');
      const requestId=result.coupang?.request?.id;
      if(!requestId){
        setLiveState({status:result.partial?'PARTIAL':'READY',message:result.partial?'Cafe24는 확인했지만 쿠팡 상태는 확인이 필요합니다.':'최신 주문 상태로 갱신했습니다.'});
        return;
      }
      setLiveState({status:'LOADING',message:'Cafe24 확인 완료 · 쿠팡 판매자배송 상태를 고정 IP 서버에서 확인 중입니다.'});
      for(let attempt=0;attempt<50;attempt+=1){
        await wait(1500);
        const pollResponse=await fetch(`/api/orders/live-refresh?requestId=${encodeURIComponent(requestId)}`,{cache:'no-store'});
        const poll=await pollResponse.json();
        if(pollResponse.status===202)continue;
        if(!pollResponse.ok||!poll.ok)throw new Error(poll.error||'쿠팡 최신 주문 상태 확인 실패');
        if(poll.center)setCurrentCenter(poll.center);
        setLiveState({status:result.partial?'PARTIAL':'READY',message:result.partial?'쿠팡은 최신 상태입니다. Cafe24 상태는 다시 확인이 필요합니다.':'Cafe24·쿠팡 수집 완료 · 네이버 커머스는 API 연결 후 포함됩니다.'});
        return;
      }
      throw new Error('쿠팡 고정 IP 서버 응답이 늦습니다. 잠시 후 다시 확인해 주세요.');
    }catch(error){
      setLiveState({status:'FAILED',message:error.message});
    }
  }
  useEffect(()=>setShowCount(20),[workspace,platform,stage,query,startDate,endDate,actionOnly,timingOnly]);
  useEffect(()=>{setClock(Date.now());const timer=window.setInterval(()=>setClock(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    setCurrentCenter(previous=>{
      let changed=false;
      const orders=previous.orders.map(order=>{
        const tracked=trackingStates[order.hubOrderId];
        const nextStage=tracked?.status==='SUCCESS'&&tracked.statusCode==='DELIVERED'?'DELIVERED':tracked?.status==='SUCCESS'&&tracked.statusCode==='IN_TRANSIT'?'SHIPPING':order.stage;
        if(nextStage===order.stage)return order;
        changed=true;
        return {...order,stage:nextStage,stageLabel:STAGE_LABELS[nextStage],actionRequired:false,shippingEligible:false,tracking:tracked};
      });
      if(!changed)return previous;
      const stageCounts=Object.fromEntries(previous.stages.map(item=>[item.id,orders.filter(order=>order.stage===item.id).length]));
      return {...previous,orders,stageCounts,summary:{...previous.summary,actionRequired:orders.filter(order=>order.actionRequired).length,visibleDefaultTotal:orders.filter(order=>order.stage!=='DELIVERED').length}};
    });
  },[trackingStates]);
  const activeWorkspace=ORDER_WORKSPACES.find(item=>item.id===workspace)||ORDER_WORKSPACES[0];
  const rendered=visible.slice(0,showCount);
  const bulkEligible=visible.filter(order=>order.shippingEligible&&ACTIVE_STAGES.has(order.stage)&&['ACTIVE','EPOST','REGISTER','RETRY'].includes(workspace));
  const bulkSelected=bulkEligible.filter(order=>selectedIds.has(order.hubOrderId)).length;
  const allBulkSelected=bulkEligible.length>0&&bulkSelected===bulkEligible.length;
  const delayedCount=currentCenter.orders.filter(order=>ACTIVE_STAGES.has(order.stage)&&order.timingBadge?.type==='DELAYED'&&order.fulfillment!=='ROCKET_GROWTH').length;
  const sameDayCount=currentCenter.orders.filter(order=>ACTIVE_STAGES.has(order.stage)&&order.timingBadge?.type==='SAME_DAY'&&order.fulfillment!=='ROCKET_GROWTH').length;
  const cutoffLabel=clock?(()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(clock)).map(part=>[part.type,part.value]));const minutes=Number(parts.hour)*60+Number(parts.minute);if(minutes>=15*60)return '오늘 15시 마감 지남';const left=15*60-minutes;return `당일출고 마감 ${Math.floor(left/60)}시간 ${left%60}분 전`;})():'15시 당일출고 기준';
  const exportParams=new URLSearchParams();
  if(platform!=='ALL')exportParams.set('platform',platform);
  if(stage!=='ALL')exportParams.set('stage',stage);
  if(query.trim())exportParams.set('query',query.trim());
  if(startDate)exportParams.set('start',startDate);
  if(endDate)exportParams.set('end',endDate);
  if(actionOnly)exportParams.set('action','1');
  const exportHref=`/api/orders/export${exportParams.size?`?${exportParams}`:''}`;
  function selectOrder(order,checked){setSelectedIds(previous=>{const next=new Set(previous);if(checked)next.add(order.hubOrderId);else next.delete(order.hubOrderId);return next;});}
  function updateInvoice(order,value){setInvoiceDrafts(previous=>({...previous,[order.hubOrderId]:value}));if(value)selectOrder(order,true);}
  function selectBulk(checked){setSelectedIds(previous=>{const next=new Set(previous);bulkEligible.forEach(order=>checked?next.add(order.hubOrderId):next.delete(order.hubOrderId));return next;});}
  function openWorkspace(nextWorkspace){setWorkspace(nextWorkspace);setStage('ALL');setActionOnly(false);setTimingOnly('ALL');}
  function locateScannedOrder(event){event.preventDefault();const needle=scanQuery.replace(/\s/g,'').toLowerCase();if(!needle)return;const match=currentCenter.orders.find(order=>[order.hubOrderId,order.externalOrderId,order.invoiceNumber,invoiceDrafts[order.hubOrderId]].some(value=>String(value||'').replace(/\s/g,'').toLowerCase()===needle));if(!match){setScanMessage('일치하는 주문이나 송장번호를 찾지 못했습니다.');return;}openWorkspace(match.invoiceNumber?'IN_TRANSIT':'ACTIVE');setQuery(match.hubOrderId);if(match.shippingEligible)selectOrder(match,true);setScanMessage(`${match.channelLabel} 주문을 찾았습니다. 해당 카드만 표시합니다.`);setScanQuery('');}
  return <section className="unifiedOrdersCenter">
    <section className="unifiedOrdersHero"><div className="operationsHeroCopy"><span>14-4 · ORDER &amp; SHIPPING WORKBENCH</span><div className="operationsHeroTitle"><i><HarinIcon name="truck" size={28}/></i><h1>주문·배송 작업센터</h1></div><p>판매자배송 주문만 실제 출고 순서로 처리하고, 로켓그로스와 완료 이력은 작업목록에서 분리합니다.</p></div><div className="ordersHeroMetrics"><span><small>현재 처리할 주문</small><b>{count(workspaceCounts.ACTIVE)}건</b></span><span><small>송장 발급 대기</small><b>{count(workspaceCounts.EPOST)}건</b></span><span><small>배송중</small><b>{count(workspaceCounts.IN_TRANSIT)}건</b></span><span><small>재시도</small><b>{count(workspaceCounts.RETRY)}건</b></span></div></section>
    <section className="orderFocusRail" aria-label="오늘의 출고 집중 항목"><button type="button" className={delayedCount?'danger':''} onClick={()=>{openWorkspace('ACTIVE');setTimingOnly('DELAYED');}}><HarinIcon name="alerts" size={22}/><span><small>먼저 확인</small><b>배송지연 {count(delayedCount)}건</b></span><em>보기</em></button><button type="button" onClick={()=>{openWorkspace('ACTIVE');setTimingOnly('SAME_DAY');}}><HarinIcon name="truck" size={22}/><span><small>{cutoffLabel}</small><b>당일출고 {count(sameDayCount)}건</b></span><em>보기</em></button><form className="orderScanCommand" onSubmit={locateScannedOrder}><HarinIcon name="scan" size={22}/><label><span>바코드·송장 빠른 찾기</span><input value={scanQuery} onChange={event=>setScanQuery(event.target.value)} placeholder="주문번호 또는 13자리 송장" autoCapitalize="none" enterKeyHint="search"/></label><button type="submit">찾기</button></form></section>
    {scanMessage?<p className="orderScanMessage" role="status">{scanMessage}</p>:null}
    <section className="ordersSyncOverview"><article className={`liveOrdersStatus ${liveState.status.toLowerCase()}`} aria-live="polite"><div><span className="livePulse"/><span><b>{liveState.status==='LOADING'?'전체 플랫폼 수집 중':liveState.status==='READY'?'최신 상태 수집 완료':liveState.status==='PARTIAL'?'일부 채널 확인 필요':liveState.status==='FAILED'?'최신 상태 수집 실패':'1시간 자동수집'}</b><small>{liveState.message} · 작업화면 {currentCenter.summary.windowStart}~{currentCenter.summary.windowEnd}</small></span></div><button type="button" onClick={refreshLiveOrders} disabled={liveState.status==='LOADING'}>{liveState.status==='LOADING'?'수집 중…':'전체 플랫폼 수동수집'}</button></article><div className="unifiedChannelStates">{currentCenter.channels.map(channel=><ChannelState channel={channel} key={channel.platform}/>)}</div></section>
    <details className="unifiedOrdersHelp"><summary><span><b>이 화면은 어떻게 쓰나요?</b><small>처음 볼 때만 열어보세요. 실제 출고 순서대로 설명합니다.</small></span><em>열기</em></summary><div><p><b>1. 현재 주문</b>에서 오늘 포장할 판매자배송 주문을 고릅니다.</p><p><b>2. 우체국 발급</b>에서 선택 주문의 송장번호를 자동으로 받습니다.</p><p><b>3. 쇼핑몰 송장등록</b>에서 발급된 번호가 채널에 반영됐는지 확인합니다.</p><p><b>예시:</b> 등록이 실패해도 송장번호는 없어지지 않습니다. ‘재시도’에서 채널 전송만 다시 누르면 됩니다.</p></div></details>
    {aiPanel?<div className="operationsAiSlot ordersAiSlot">{aiPanel}</div>:null}
    <section className="orderHistoryBoundary"><article><small>현재 작업</small><b>{count(workspaceCounts.ACTIVE)}건</b><span>{currentCenter.summary.windowStart}~{currentCenter.summary.windowEnd}</span></article><article><small>최근 완료</small><b>{count(workspaceCounts.COMPLETED)}건</b><span>최근 30일만 표시</span></article><article><small>누적 보관</small><b>{count(currentCenter.summary.historyTotal)}건</b><span>통계·이력용, 작업목록과 분리</span></article><article className="rocketGrowthReadOnly"><small>로켓그로스</small><b>{count(currentCenter.summary.rocketGrowthStored)}건</b><span>자동처리 · 조회 전용</span></article></section>
    <article className="orderWorkspacePanel"><header><div><span>오늘의 출고 작업 흐름</span><h2>필요한 작업공간만 열어 처리하세요</h2></div><b>{activeWorkspace.label} · {count(workspaceCounts[workspace])}건</b></header><nav className="orderWorkspaceNav" aria-label="주문·배송 작업공간">{ORDER_WORKSPACES.map((item,index)=><div key={item.id}><button type="button" className={workspace===item.id?'active':''} onClick={()=>openWorkspace(item.id)} aria-current={workspace===item.id?'page':undefined}><small>{index+1}. {item.short}</small><b>{item.label}</b><strong>{count(workspaceCounts[item.id])}건</strong><span>{item.description}</span></button>{index<ORDER_WORKSPACES.length-1?<i aria-hidden="true">→</i>:null}</div>)}</nav></article>
    <section className="orderListControls"><article className="unifiedOrderToolbar"><div><label><span>채널</span><select value={platform} onChange={event=>setPlatform(event.target.value)}>{Object.entries(CHANNEL_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>{workspace==='ACTIVE'?<label><span>주문 상태</span><select value={stage} onChange={event=>setStage(event.target.value)}><option value="ALL">현재 주문 전체</option>{currentCenter.stages.filter(item=>ACTIVE_STAGES.has(item.id)).map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>:null}<label className="orderSearch"><span>주문·상품 검색</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="허브번호·쇼핑몰번호·상품명"/></label><label><span>시작일</span><input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><label><span>종료일</span><input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></label></div><footer>{workspace==='ACTIVE'?<label className="actionOnly"><input type="checkbox" checked={actionOnly} onChange={event=>setActionOnly(event.target.checked)}/><span>처리 필요만 보기</span></label>:<span>{activeWorkspace.description}</span>}<strong>{count(visible.length)}건 표시</strong><a href={exportHref}>엑셀 다운로드</a></footer></article>{['ACTIVE','EPOST','REGISTER','RETRY'].includes(workspace)?<article className="bulkShippingSelection"><label><input type="checkbox" checked={allBulkSelected} disabled={!bulkEligible.length} onChange={event=>selectBulk(event.target.checked)}/><span><b>{workspace==='RETRY'?'재시도 주문 전체선택':'출고 가능 주문 전체선택'}</b><small>현재 조건에서 선택 가능한 주문 {count(bulkEligible.length)}건</small></span></label><div><b>{count(bulkSelected)}건 선택됨</b>{workspace==='ACTIVE'?<button type="button" className="workspaceMoveButton" onClick={()=>openWorkspace('EPOST')} disabled={!bulkSelected}>우체국 발급으로 이동</button>:null}<button type="button" onClick={()=>setSelectedIds(new Set())} disabled={!selectedIds.size}>선택 해제</button></div></article>:null}</section>
    <ShippingWorkbench mode={workspace} orders={currentCenter.orders} selectedIds={selectedIds} invoices={invoiceDrafts} setInvoices={setInvoiceDrafts} actionResults={shippingActionResults} setActionResults={setShippingActionResults} trackingStates={trackingStates} setTrackingStates={setTrackingStates}/>
    {currentCenter.summary.cancellations?<div className="unifiedCancelSummary"><b>출고 전에 확인할 취소·반품 요청 {count(currentCenter.summary.cancellations)}건</b><span>처리 완료된 요청은 숨기고, 현재 확인이 필요한 요청만 표시합니다.</span></div>:null}
    <header className="orderWorkspaceHeading"><div><small>{activeWorkspace.short}</small><h2>{activeWorkspace.label}</h2><p>{activeWorkspace.description}</p></div><b>{count(visible.length)}건</b></header>
    <div className="unifiedOrderList">{rendered.length?rendered.map(order=><OrderCard order={order} selected={selectedIds.has(order.hubOrderId)} onSelect={selectOrder} invoiceDraft={invoiceDrafts[order.hubOrderId]||''} onInvoiceChange={updateInvoice} actionState={shippingActionResults[order.hubOrderId]} trackingState={trackingStates[order.hubOrderId]} key={`${order.platform}:${order.hubOrderId}`}/>):<div className="unifiedOrdersEmpty"><b>{activeWorkspace.label}에 표시할 주문이 없습니다.</b><span>{workspace==='RETRY'?'실패 작업이 생기면 송장번호를 보존한 채 이곳에 표시됩니다.':'검색 조건을 지우거나 다른 작업공간을 확인해보세요.'}</span></div>}</div>
    {rendered.length<visible.length?<button className="unifiedOrdersMore" onClick={()=>setShowCount(value=>value+20)}>주문 20건 더 보기 · 남은 {count(visible.length-rendered.length)}건</button>:null}
    {children?<details className="legacyCoupangOrders"><summary><span><b>쿠팡 배송 처리 상세</b><small>상품준비중 처리·송장 입력 등 쿠팡 작업이 필요할 때 펼치세요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
  </section>;
}
