'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const STAGE_LABELS={PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',SHIPPING:'배송중',DELIVERED:'배송완료'};
const CHANNEL_LABELS={ALL:'전체 채널',NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'};
const money=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const dateTime=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'주문일 확인 필요';

function ChannelState({ channel }) {
  const label={READY:'정상',FAILED:'수집 실패',SETUP_REQUIRED:'설정 필요',RECONNECT_REQUIRED:'재연결 필요'}[channel.status]||channel.label;
  return <span className={`unifiedChannelState ${String(channel.status||'').toLowerCase()}`}><i/><b>{CHANNEL_LABELS[channel.platform]}</b><em>{label}</em><small>{channel.message}</small></span>;
}

function DeliveryInfo({ order }) {
  const [state,setState]=useState({status:'LOADING'});
  useEffect(()=>{
    let active=true;
    if(order.platform==='NAVER'){
      setState({status:'UNAVAILABLE',error:'네이버 커머스 연결 후 자동 표시됩니다.'});
      return ()=>{active=false;};
    }
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

function OrderCard({ order, selected, onSelect }) {
  return <article className={`unifiedOrderCard${order.cancellationRequested?' cancelWarning':''}`}>
    {order.cancellationRequested?<div className="orderCancelWarning"><b>출고 멈춤 · 취소/반품 요청 확인</b><span>출고 전에 해당 쇼핑몰에서 요청 상태를 먼저 확인하세요.</span></div>:null}
    <header><div><label className={`shippingSelect${order.shippingEligible?'':' blocked'}`} title={order.shippingBlockedReason||'포장·배송 작업에 선택'}><input type="checkbox" checked={selected} disabled={!order.shippingEligible} onChange={event=>onSelect(order,event.target.checked)}/><span>{order.shippingEligible?'작업 선택':'선택 불가'}</span></label><span className={`channelBadge ${order.platform.toLowerCase()}`}>{order.channelLabel}</span>{order.platform==='COUPANG'&&order.fulfillment==='SELLER'?<span className="sellerDeliveryBadge">판매자배송</span>:null}{order.fulfillment==='ROCKET_GROWTH'?<span className="fulfillmentBadge">로켓그로스</span>:null}<strong>{STAGE_LABELS[order.stage]||'상태 확인'}</strong></div><b>{money(order.amount)}</b></header>
    <section><div><span>허브 주문번호</span><b>{order.hubOrderId}</b></div><div><span>쇼핑몰 주문번호</span><b>{order.externalOrderId}</b></div><div><span>주문 시각</span><b>{dateTime(order.orderedAt)}</b></div></section>
    <div className="unifiedOrderProduct"><div className="orderItemRows">{order.items?.length?order.items.map((item,index)=><div className="orderItemRow" key={`${item.externalItemId||item.name}-${index}`}><span><small>상품명</small><b>{item.name}</b></span><span><small>옵션</small><b>{item.option||'기본 옵션'}</b></span><strong>{count(item.quantity)}개</strong></div>):<p>상품 상세는 다음 수집 때 자동으로 채워집니다.</p>}<em>{(order.packagingInstructions||[]).join(' · ')}</em></div><strong className="orderTotalQuantity">총 {order.quantity?`${count(order.quantity)}개`:'-'}</strong></div>
    <DeliveryInfo order={order}/>
  </article>;
}

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
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
  throw new Error('배송정보 자동 조회를 지원하지 않는 채널입니다.');
}

function ShippingWorkbench({ orders, selectedIds, setSelectedIds }) {
  const selected=orders.filter(order=>selectedIds.has(order.hubOrderId));
  const [invoices,setInvoices]=useState({});
  const [coupangCourier,setCoupangCourier]=useState('CJGLS');
  const [cafe24Courier,setCafe24Courier]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');
  const [liveCandidates,setLiveCandidates]=useState([]);
  const storedCandidates=useMemo(()=>{
    const groups=new Map();
    selected.forEach(order=>{if(order.shippingCandidateKey){const rows=groups.get(order.shippingCandidateKey)||[];rows.push(order);groups.set(order.shippingCandidateKey,rows);}});
    return [...groups.values()].filter(rows=>rows.length>1).map(rows=>rows.map(order=>order.hubOrderId));
  },[selected]);
  const printIds=selected.map(order=>order.hubOrderId).join(',');
  async function run(action){
    if(!selected.length)return setMessage('먼저 아래 주문에서 ‘작업 선택’을 눌러주세요.');
    const label=action==='PREPARE'?'상품준비중으로 변경':'송장을 각 쇼핑몰에 전송';
    if(!window.confirm(`선택 ${selected.length}건을 ${label}할까요?\n실제 쇼핑몰 주문이 변경됩니다.`))return;
    const rows=selected.map(order=>({hubOrderId:order.hubOrderId,invoiceNumber:invoices[order.hubOrderId]||'',deliveryCompanyCode:order.platform==='COUPANG'?coupangCourier:cafe24Courier}));
    setBusy(action);setMessage('채널별로 안전하게 처리 중입니다…');
    try{
      const response=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action,orders:rows})});
      const result=await response.json();
      setMessage(`완료 ${result.succeeded||0}건 · 확인 필요 ${result.failed||0}건${result.results?.filter(item=>!item.ok).length?` · ${result.results.filter(item=>!item.ok).map(item=>`${item.hubOrderId}: ${item.error}`).join(' / ')}`:''}`);
      if(result.succeeded)setSelectedIds(new Set());
    }catch(error){setMessage(`처리 실패 · ${error.message}`);}finally{setBusy('');}
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
  return <article className="shippingWorkbench">
    <header><div><span>PHASE 11-3 · PACK & SHIP</span><h2>포장·배송 작업대</h2><p>아래 주문을 선택한 뒤 상품준비중 처리, 포장명세서, 송장 전송을 한 번에 진행합니다.</p></div><b>{selected.length}건 선택</b></header>
    <details className="shippingHelp"><summary><b>이 작업대는 어떻게 쓰나요?</b><em>열기</em></summary><div><p><strong>1.</strong> 출고할 주문의 ‘작업 선택’을 누르세요.</p><p><strong>2.</strong> 먼저 상품준비중으로 바꾸고 포장명세서를 인쇄하세요.</p><p><strong>3.</strong> 포장이 끝나면 주문별 송장번호와 채널 배송사 코드를 넣고 전송하세요.</p><p><strong>예시:</strong> 같은 주소 주문이 2건이어도 쿠팡 정책을 확인하기 전에는 자동으로 합치지 않습니다.</p></div></details>
    <div className="shippingActions"><button onClick={()=>run('PREPARE')} disabled={Boolean(busy)||!selected.length}>{busy==='PREPARE'?'처리 중…':'선택 주문 상품준비중'}</button><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=packing&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">포장명세서</a><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=dispatch&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">출고목록 PDF</a><button className="secondary" onClick={findCandidates} disabled={Boolean(busy)||!selected.length}>{busy==='CANDIDATES'?'주소 확인 중…':'묶음배송 후보 찾기'}</button></div>
    {(storedCandidates.length||liveCandidates.length)?<div className="shippingCandidates"><b>묶음배송 후보 · 자동 합배송 안 함</b>{[...storedCandidates,...liveCandidates].map((rows,index)=><span key={`${rows.join('-')}-${index}`}>{rows.length}건 · {rows.join(' · ')}</span>)}</div>:null}
    {selected.length?<section className="invoiceWorkbench"><header><div><b>송장번호 직접 일괄 입력</b><small>쿠팡과 Cafe24는 배송사 코드 체계가 달라 각각 입력합니다.</small></div><label><span>쿠팡 배송사 코드</span><input value={coupangCourier} onChange={event=>setCoupangCourier(event.target.value.toUpperCase())} placeholder="예: CJGLS"/></label><label><span>Cafe24 배송사 코드</span><input value={cafe24Courier} onChange={event=>setCafe24Courier(event.target.value.toUpperCase())} placeholder="관리자 배송업체 코드"/></label></header><div>{selected.map(order=><label key={order.hubOrderId}><span><b>{order.hubOrderId}</b><small>{order.channelLabel} · {order.productName}</small></span><input value={invoices[order.hubOrderId]||''} onChange={event=>setInvoices({...invoices,[order.hubOrderId]:event.target.value.trim()})} placeholder="송장번호 입력"/></label>)}</div><button onClick={()=>run('UPLOAD_INVOICE')} disabled={Boolean(busy)}>{busy==='UPLOAD_INVOICE'?'채널 전송 중…':'입력 송장 일괄 전송'}</button></section>:null}
    {message?<p className="shippingMessage">{message}</p>:null}
  </article>;
}

export default function UnifiedOrdersCenter({ center, children }) {
  const [currentCenter,setCurrentCenter]=useState(center);
  const [liveState,setLiveState]=useState({status:'IDLE',message:'화면을 열면 최신 주문 상태를 자동으로 확인합니다.'});
  const liveStarted=useRef(false);
  const [platform,setPlatform]=useState('ALL');
  const [stage,setStage]=useState('ALL');
  const [query,setQuery]=useState('');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [actionOnly,setActionOnly]=useState(false);
  const [selectedIds,setSelectedIds]=useState(()=>new Set());
  const [showCount,setShowCount]=useState(20);
  const visible=useMemo(()=>currentCenter.orders.filter(order=>{
    const needle=query.trim().toLowerCase();
    if(platform!=='ALL'&&order.platform!==platform)return false;
    if(stage!=='ALL'&&order.stage!==stage)return false;
    if(actionOnly&&!order.actionRequired)return false;
    const date=String(order.orderedAt||'').slice(0,10);
    if(startDate&&date<startDate)return false;
    if(endDate&&date>endDate)return false;
    if(needle&&!`${order.hubOrderId} ${order.externalOrderId} ${order.productName} ${(order.productNames||[]).join(' ')}`.toLowerCase().includes(needle))return false;
    return true;
  }),[currentCenter.orders,platform,stage,query,startDate,endDate,actionOnly]);
  async function refreshLiveOrders(){
    setLiveState({status:'LOADING',message:'Cafe24와 쿠팡의 현재 주문 상태를 확인하고 있습니다.'});
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
        setLiveState({status:result.partial?'PARTIAL':'READY',message:result.partial?'쿠팡은 최신 상태입니다. Cafe24 상태는 다시 확인이 필요합니다.':'Cafe24·쿠팡 최신 주문 상태로 갱신했습니다.'});
        return;
      }
      throw new Error('쿠팡 고정 IP 서버 응답이 늦습니다. 잠시 후 다시 확인해 주세요.');
    }catch(error){
      setLiveState({status:'FAILED',message:error.message});
    }
  }
  useEffect(()=>{
    if(liveStarted.current)return;
    liveStarted.current=true;
    refreshLiveOrders();
  },[]);
  useEffect(()=>setShowCount(20),[platform,stage,query,startDate,endDate,actionOnly]);
  const rendered=visible.slice(0,showCount);
  const exportParams=new URLSearchParams();
  if(platform!=='ALL')exportParams.set('platform',platform);
  if(stage!=='ALL')exportParams.set('stage',stage);
  if(query.trim())exportParams.set('query',query.trim());
  if(startDate)exportParams.set('start',startDate);
  if(endDate)exportParams.set('end',endDate);
  if(actionOnly)exportParams.set('action','1');
  const exportHref=`/api/orders/export${exportParams.size?`?${exportParams}`:''}`;
  function selectOrder(order,checked){setSelectedIds(previous=>{const next=new Set(previous);if(checked)next.add(order.hubOrderId);else next.delete(order.hubOrderId);return next;});}
  return <section className="unifiedOrdersCenter">
    <section className="unifiedOrdersHero"><div><span>PHASE 11-3 · PACK & SHIP</span><h1>통합 주문·배송센터</h1><p>쿠팡은 판매자배송 주문만 작업 목록에 표시하고, Cafe24와 함께 현재 포장·출고 상태를 확인합니다.</p></div><div><small>지금 처리 필요</small><b>{count(currentCenter.summary.actionRequired)}건</b><em>최근 31일 작업화면 {count(currentCenter.summary.total)}건</em><em>누적 저장 {count(currentCenter.summary.historyTotal)}건</em><em>로켓그로스 {count(currentCenter.summary.rocketGrowthStored)}건 · 별도 저장</em></div></section>
    <article className={`liveOrdersStatus ${liveState.status.toLowerCase()}`} aria-live="polite"><div><span className="livePulse"/><span><b>{liveState.status==='LOADING'?'현재 상태 확인 중':liveState.status==='READY'?'최신 상태 확인 완료':liveState.status==='PARTIAL'?'일부 채널 확인 필요':liveState.status==='FAILED'?'최신 상태 확인 실패':'실시간 주문 상태'}</b><small>{liveState.message} · 작업화면 {currentCenter.summary.windowStart}~{currentCenter.summary.windowEnd}</small></span></div><button type="button" onClick={refreshLiveOrders} disabled={liveState.status==='LOADING'}>{liveState.status==='LOADING'?'확인 중…':'최신 상태 다시 확인'}</button></article>
    <div className="unifiedChannelStates">{currentCenter.channels.map(channel=><ChannelState channel={channel} key={channel.platform}/>)}</div>
    <details className="unifiedOrdersHelp"><summary><span><b>이 화면은 어떻게 쓰나요?</b><small>처음 볼 때만 열어보세요. 쉬운 예시로 설명합니다.</small></span><em>열기</em></summary><div><p><b>1. 위 단계 박스</b>를 누르면 그 단계 주문만 보여요.</p><p><b>2. ‘처리 필요만’</b>을 켜면 포장·출고하거나 취소를 확인할 주문만 남아요.</p><p><b>예시:</b> 취소 경고가 붙은 주문은 송장을 넣기 전에 쇼핑몰에서 취소 요청부터 확인하세요.</p><p>채널 하나가 실패해도 정상 채널 주문은 계속 표시됩니다. 실패 채널은 위 상태 카드에서 따로 알려드립니다.</p></div></details>
    <article className="unifiedProcessPanel"><header><div><span>최근 31일 실시간 주문 흐름</span><h2>단계를 누르면 바로 걸러집니다</h2></div><button className={stage==='ALL'?'active':''} onClick={()=>setStage('ALL')}>전체 {count(currentCenter.summary.total)}건</button></header><div className="unifiedOrderFlow">{currentCenter.stages.map((item,index)=><div key={item.id}><button className={stage===item.id?'active':''} onClick={()=>setStage(item.id)}><small>{index+1}. {item.label}</small><b>{count(currentCenter.stageCounts[item.id])}건</b><span>{item.description}</span></button>{index<currentCenter.stages.length-1?<i>→</i>:null}</div>)}</div></article>
    <article className="unifiedOrderToolbar"><div><label><span>채널</span><select value={platform} onChange={event=>setPlatform(event.target.value)}>{Object.entries(CHANNEL_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>주문 상태</span><select value={stage} onChange={event=>setStage(event.target.value)}><option value="ALL">전체 상태</option>{currentCenter.stages.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="orderSearch"><span>주문·상품 검색</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="허브번호·쇼핑몰번호·상품명"/></label><label><span>시작일</span><input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><label><span>종료일</span><input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></label></div><footer><label className="actionOnly"><input type="checkbox" checked={actionOnly} onChange={event=>setActionOnly(event.target.checked)}/><span>처리 필요만 보기</span></label><strong>{count(visible.length)}건 표시</strong><a href={exportHref}>엑셀 다운로드</a></footer></article>
    <ShippingWorkbench orders={currentCenter.orders} selectedIds={selectedIds} setSelectedIds={setSelectedIds}/>
    {currentCenter.summary.cancellations?<div className="unifiedCancelSummary"><b>출고 전에 확인할 취소·반품 요청 {count(currentCenter.summary.cancellations)}건</b><span>처리 완료된 요청은 숨기고, 현재 확인이 필요한 요청만 표시합니다.</span></div>:null}
    <div className="unifiedOrderList">{rendered.length?rendered.map(order=><OrderCard order={order} selected={selectedIds.has(order.hubOrderId)} onSelect={selectOrder} key={`${order.platform}:${order.hubOrderId}`}/>):<div className="unifiedOrdersEmpty"><b>이 조건의 주문이 없습니다.</b><span>검색어나 기간을 지우고 다시 확인해보세요.</span></div>}</div>
    {rendered.length<visible.length?<button className="unifiedOrdersMore" onClick={()=>setShowCount(value=>value+20)}>주문 20건 더 보기 · 남은 {count(visible.length-rendered.length)}건</button>:null}
    {children?<details className="legacyCoupangOrders"><summary><span><b>쿠팡 배송 처리 상세</b><small>상품준비중 처리·송장 입력 등 쿠팡 작업이 필요할 때 펼치세요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
  </section>;
}
