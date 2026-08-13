'use client';

import { useEffect, useMemo, useState } from 'react';

const STAGE_LABELS={PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',SHIPPING:'배송중',DELIVERED:'배송완료'};
const CHANNEL_LABELS={ALL:'전체 채널',NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'};
const money=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const dateTime=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'주문일 확인 필요';
const postalTracking=value=>String(value||'').replace(/\D/g,'').slice(0,13);

function ChannelState({ channel }) {
  const label={READY:'정상',FAILED:'수집 실패',SETUP_REQUIRED:'설정 필요',RECONNECT_REQUIRED:'재연결 필요'}[channel.status]||channel.label;
  return <span className={`unifiedChannelState ${String(channel.status||'').toLowerCase()}`}><i/><b>{CHANNEL_LABELS[channel.platform]}</b><em>{label}</em><small>{channel.message}</small></span>;
}

function DeliveryInfo({ order }) {
  const [state,setState]=useState(order.demo?{status:'READY',receiver:order.demoReceiver}:{status:'LOADING'});
  useEffect(()=>{
    let active=true;
    if(order.demo)return ()=>{active=false;};
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

function TimingBadge({ badge }) {
  if(!badge)return null;
  return <span className={`orderTimingBadge ${badge.type.toLowerCase()}`} title={badge.detail}>{badge.label}</span>;
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
  const stateLabel={RUNNING:'처리 중',SUCCESS:'전송 완료',QUEUED:'고정 IP 전송 대기',FAILED:'확인 필요'}[actionState?.status];
  return <div className={`orderInvoiceEntry${registered?' registered':''}${actionState?.status?` ${actionState.status.toLowerCase()}`:''}`}>
    <div><span><small>우체국 송장번호</small><b>{registered?'이미 등록된 송장':'직접 입력 · 자동발급 연결 예정'}</b></span>{stateLabel?<em>{stateLabel}</em>:<em>{complete?'13자리 입력 완료':'13자리 숫자'}</em>}</div>
    <label><input inputMode="numeric" autoComplete="off" maxLength={13} value={current} disabled={Boolean(registered)||!order.shippingEligible||order.demo} onChange={event=>onChange(order,postalTracking(event.target.value))} placeholder="예: 13자리 송장번호" aria-label={`${order.hubOrderId} 우체국 송장번호`}/><span>{registered?'등록된 번호는 최신 수집 상태를 기준으로 표시합니다.':order.demo?'화면 확인용 샘플입니다.':order.shippingEligible?'번호를 입력하면 이 주문이 자동으로 작업 선택됩니다.':order.shippingBlockedReason}</span></label>
    {actionState?.error?<p>{actionState.error}</p>:null}
  </div>;
}

function OrderCard({ order, selected, onSelect, invoiceDraft='', onInvoiceChange, actionState }) {
  return <article className={`unifiedOrderCard${order.cancellationRequested?' cancelWarning':''}${order.demo?' demoOrderCard':''}`}>
    {order.cancellationRequested?<div className="orderCancelWarning"><b>출고 멈춤 · 취소/반품 요청 확인</b><span>출고 전에 해당 쇼핑몰에서 요청 상태를 먼저 확인하세요.</span></div>:null}
    <header className="unifiedOrderCardHeader"><div className="orderBadgeGroup"><label className={`shippingSelect${order.shippingEligible?'':' blocked'}`} title={order.shippingBlockedReason||'포장·배송 작업에 선택'}><input type="checkbox" checked={selected} disabled={!order.shippingEligible} onChange={event=>onSelect(order,event.target.checked)}/><span>{order.demo?'샘플':order.shippingEligible?'작업 선택':'선택 불가'}</span></label><span className={`channelBadge ${order.platform.toLowerCase()}`}>{order.channelLabel}</span>{order.platform==='COUPANG'&&order.fulfillment==='SELLER'?<span className="sellerDeliveryBadge">판매자배송</span>:null}{order.fulfillment==='ROCKET_GROWTH'?<span className="fulfillmentBadge">로켓그로스</span>:null}</div><div className="orderStatusGroup"><span className="orderStageBadge">{STAGE_LABELS[order.stage]||'상태 확인'}</span><TimingBadge badge={order.timingBadge}/><b className="orderAmount">{money(order.amount)}</b></div></header>
    <TimingNotice badge={order.timingBadge}/>
    <section><div><span>허브 주문번호</span><b>{order.hubOrderId}</b></div><div><span>쇼핑몰 주문번호</span><b>{order.externalOrderId}</b></div><div><span>주문 시각</span><b>{dateTime(order.orderedAt)}</b></div></section>
    <div className="unifiedOrderProduct"><div className="orderItemRows">{order.items?.length?order.items.map((item,index)=><div className="orderItemRow" key={`${item.externalItemId||item.name}-${index}`}><span><small>상품명</small><b>{item.name}</b></span><span><small>옵션</small><b>{item.option||'기본 옵션'}</b></span><strong>{count(item.quantity)}개</strong></div>):<p>상품 상세는 다음 수집 때 자동으로 채워집니다.</p>}<em>{(order.packagingInstructions||[]).join(' · ')}</em></div><strong className="orderTotalQuantity">총 {order.quantity?`${count(order.quantity)}개`:'-'}</strong></div>
    <DeliveryInfo order={order}/>
    <InvoiceEntry order={order} value={invoiceDraft} onChange={onInvoiceChange} actionState={actionState}/>
  </article>;
}

function previousDate(value) {
  const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);
}

function timingDemoOrders(businessDate) {
  const yesterday=previousDate(businessDate);
  const receiver={name:'홍길동',contact:'010-0000-0000',postCode:'12345',address:'서울시 샘플구 확인로 15',addressDetail:'디자인 확인용',message:'문 앞에 놓아주세요'};
  return [
    {demo:true,hubOrderId:'SAMPLE-SAME-DAY',platform:'CAFE24',channelLabel:'Cafe24',externalOrderId:'DESIGN-당일출고',orderedAt:`${businessDate}T00:10:00+09:00`,stage:'PREPARING',amount:23000,fulfillment:'SELLER',shippingEligible:false,shippingBlockedReason:'디자인 확인용 주문입니다.',timingBadge:{type:'SAME_DAY',label:'당일출고',detail:'오늘 15시까지 주문'},items:[{externalItemId:'SAMPLE-1',name:'하린식품 작두콩수세미차',option:'30티백 · 2개',quantity:2}],quantity:2,packagingInstructions:['2개 포장'],demoReceiver:receiver},
    {demo:true,hubOrderId:'SAMPLE-DELAYED',platform:'COUPANG',channelLabel:'쿠팡',externalOrderId:'DESIGN-배송지연',orderedAt:`${yesterday}T10:20:00+09:00`,stage:'PREPARING',amount:38000,fulfillment:'SELLER',shippingEligible:false,shippingBlockedReason:'디자인 확인용 주문입니다.',timingBadge:{type:'DELAYED',label:'배송지연',detail:'주문 후 1일째 준비중'},items:[{externalItemId:'SAMPLE-2',name:'하린식품 국내산 우엉차',option:'50티백 · 1개',quantity:1}],quantity:1,packagingInstructions:['1개 포장'],demoReceiver:receiver}
  ];
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

const EPOST_CHECK_KEYS=['fixedIp','apiKey','securityKey','contract','encryption','testWrite'];

function PostalConnectionPanel(){
  const [state,setState]=useState({status:'LOADING',message:'최근 우체국 연결 상태를 확인하고 있습니다.'});
  function apply(result){
    if(result?.epost)return setState({status:result.epost.status,epost:result.epost,message:result.epost.readyForTest?'실제 테스트 송장 발급 전 준비가 끝났습니다.':'아래 확인 필요 항목을 고정 IP 서버에 설정하세요.'});
    if(result?.pending)return setState({status:'PROBING',message:'서울 고정 IP 서버가 설정을 확인하고 있습니다.'});
    if(result?.status==='NOT_CHECKED')return setState({status:'NOT_CHECKED',message:result.message});
    setState({status:'FAILED',message:result?.error||'우체국 연결 상태를 확인하지 못했습니다.'});
  }
  useEffect(()=>{
    let active=true;
    fetch('/api/epost/status',{cache:'no-store'}).then(response=>response.json()).then(result=>active&&apply(result)).catch(error=>active&&setState({status:'FAILED',message:error.message}));
    return()=>{active=false;};
  },[]);
  async function probe(){
    setState(previous=>({...previous,status:'PROBING',message:'서울 고정 IP 서버가 인증키·계약정보·암호화를 확인하고 있습니다.'}));
    try{
      const response=await fetch('/api/epost/status',{method:'POST',cache:'no-store'});
      const queued=await response.json();
      if(!response.ok||!queued.ok)throw new Error(queued.error||'연결 확인 요청 실패');
      const id=queued.request?.id;
      if(!id)throw new Error('연결 확인 작업번호가 없습니다.');
      for(let attempt=0;attempt<40;attempt+=1){
        await wait(1500);
        const pollResponse=await fetch(`/api/epost/status?requestId=${encodeURIComponent(id)}`,{cache:'no-store'});
        const result=await pollResponse.json();
        if(pollResponse.status===202)continue;
        apply(result);return;
      }
      throw new Error('고정 IP 서버 응답이 늦습니다. 잠시 후 다시 확인해 주세요.');
    }catch(error){setState({status:'FAILED',message:error.message});}
  }
  const epost=state.epost;
  const ready=Boolean(epost?.readyForTest);
  const busy=['LOADING','PROBING'].includes(state.status);
  const title=busy?'연결 확인 중':ready?'11-3C 테스트 준비 완료':state.status==='NOT_CHECKED'?'연결 확인 전':'설정 확인 필요';
  return <article className={`postalConnection ${ready?'ready':state.status.toLowerCase()}`} aria-live="polite">
    <header><div><span>PHASE 11-3C · TEST PARCEL</span><h2>우체국 테스트 송장 연결</h2><p>인증키 원문은 화면이나 DB에 저장하지 않고, 서울 고정 IP 서버에서 테스트 접수만 실행합니다.</p></div><b>{title}</b></header>
    <div className="postalChecks">{EPOST_CHECK_KEYS.map(key=>{const check=epost?.checks?.[key];return <span className={!check?'waiting':check.ok?'ok':'needed'} key={key}><i>{check?.ok?'✓':'!'}</i><b>{check?.label||{fixedIp:'서울 고정 IP',apiKey:'우체국 인증키',securityKey:'SEED 보안키',contract:'계약 정보',encryption:'SEED-128 암호화',testWrite:'테스트 접수 잠금'}[key]}</b><small>{check?.detail||'확인 대기'}</small></span>;})}</div>
    <footer><div><b>{state.message}</b><small>실제 소포 접수·13자리 송장 발급은 계속 잠겨 있습니다. 테스트 결과는 TESTREGINOAPI로만 표시됩니다.</small>{epost?.checkedAt?<small>마지막 확인 {dateTime(epost.checkedAt)}</small>:null}</div><button type="button" onClick={probe} disabled={busy}>{state.status==='PROBING'?'확인 중…':'고정 IP 연결 확인'}</button></footer>
  </article>;
}

function ShippingWorkbench({ orders, selectedIds, invoices, setInvoices, actionResults, setActionResults }) {
  const selected=orders.filter(order=>selectedIds.has(order.hubOrderId));
  const [coupangCourier,setCoupangCourier]=useState('EPOST');
  const [cafe24Courier,setCafe24Courier]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');
  const [liveCandidates,setLiveCandidates]=useState([]);
  const [postalTest,setPostalTest]=useState({status:'IDLE',message:'실제 발송 없이 우체국 테스트 접수 결과만 확인합니다.'});
  const storedCandidates=useMemo(()=>{
    const groups=new Map();
    selected.forEach(order=>{if(order.shippingCandidateKey){const rows=groups.get(order.shippingCandidateKey)||[];rows.push(order);groups.set(order.shippingCandidateKey,rows);}});
    return [...groups.values()].filter(rows=>rows.length>1).map(rows=>rows.map(order=>order.hubOrderId));
  },[selected]);
  const printIds=selected.map(order=>order.hubOrderId).join(',');
  const paidTargets=selected.filter(order=>order.stage==='PAID');
  const invoiceTargets=selected.filter(order=>['PREPARING','READY_TO_SHIP'].includes(order.stage)&&postalTracking(order.invoiceNumber||invoices[order.hubOrderId]).length===13&&!order.invoiceNumber);
  const postalTestTarget=selected.length===1&&selected[0].shippingEligible&&!selected[0].invoiceNumber&&['PAID','PREPARING','READY_TO_SHIP'].includes(selected[0].stage)?selected[0]:null;
  async function runPostalTest(){
    if(!postalTestTarget)return setPostalTest({status:'FAILED',message:'송장이 없는 출고 가능 주문을 1건만 선택하세요.'});
    if(!window.confirm(`${postalTestTarget.hubOrderId} 주문으로 우체국 테스트 접수를 실행할까요?\n실제 발송·실제 송장 등록은 하지 않습니다.`))return;
    setBusy('EPOST_TEST');setPostalTest({status:'RUNNING',message:'서울 고정 IP 서버에서 테스트 접수 중입니다…'});
    try{
      const response=await fetch('/api/epost/test-issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,testOnly:true,hubOrderId:postalTestTarget.hubOrderId})});
      let result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'우체국 테스트 접수 시작 실패');
      if(result.pending){
        const id=result.request?.id;
        if(!id)throw new Error('테스트 접수 작업번호가 없습니다.');
        for(let attempt=0;attempt<40;attempt+=1){
          await wait(1500);
          const pollResponse=await fetch(`/api/epost/test-issue?requestId=${encodeURIComponent(id)}`,{cache:'no-store'});
          result=await pollResponse.json();
          if(pollResponse.status===202)continue;
          if(!pollResponse.ok||!result.ok)throw new Error(result.error||'우체국 테스트 접수 실패');
          break;
        }
        if(result.pending)throw new Error('고정 IP 서버 응답이 늦습니다. 잠시 뒤 다시 시도해주세요.');
      }
      const tracking=result.result?.trackingNo||'TESTREGINOAPI';
      setPostalTest({status:'SUCCESS',trackingNo:tracking,reused:Boolean(result.reused||result.result?.reused),message:result.reused||result.result?.reused?'기존 테스트 접수 결과를 안전하게 다시 불러왔습니다.':'우체국 테스트 접수 결과를 확인했습니다.'});
    }catch(error){setPostalTest({status:'FAILED',message:error.message});}finally{setBusy('');}
  }
  async function run(action){
    if(!selected.length)return setMessage('먼저 아래 주문에서 ‘작업 선택’을 눌러주세요.');
    const targets=action==='PREPARE'?paidTargets:invoiceTargets;
    if(!targets.length)return setMessage(action==='PREPARE'?'선택 주문 중 결제완료 상태가 없습니다.':'준비중·출고대기 주문에 우체국 송장번호 13자리를 먼저 입력해주세요.');
    const label=action==='PREPARE'?'상품준비중으로 변경':'송장을 각 쇼핑몰에 전송';
    if(!window.confirm(`대상 ${targets.length}건을 ${label}할까요?\n실제 쇼핑몰 주문이 변경됩니다.`))return;
    const rows=targets.map(order=>({hubOrderId:order.hubOrderId,invoiceNumber:postalTracking(order.invoiceNumber||invoices[order.hubOrderId]),deliveryCompanyCode:order.platform==='COUPANG'?coupangCourier:cafe24Courier}));
    setActionResults(previous=>({...previous,...Object.fromEntries(targets.map(order=>[order.hubOrderId,{status:'RUNNING',action}]))}));
    setBusy(action);setMessage('채널별로 안전하게 처리 중입니다…');
    try{
      const response=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action,orders:rows})});
      const result=await response.json();
      setActionResults(previous=>({...previous,...Object.fromEntries((result.results||[]).map(item=>[item.hubOrderId,{status:item.ok?(item.status||'SUCCESS'):'FAILED',action,error:item.error||''}]))}));
      setMessage(`완료 ${result.succeeded||0}건 · 확인 필요 ${result.failed||0}건${result.results?.filter(item=>!item.ok).length?` · ${result.results.filter(item=>!item.ok).map(item=>`${item.hubOrderId}: ${item.error}`).join(' / ')}`:''}`);
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
  return <article className="shippingWorkbench">
    <header><div><span>PHASE 11-3C · TEST PARCEL</span><h2>포장·배송 작업대</h2><p>결제완료는 준비중으로 바꾸고, 선택한 주문 1건으로 우체국 테스트 접수까지 확인합니다.</p></div><b>{selected.length}건 선택</b></header>
    <details className="shippingHelp"><summary><b>이 작업대는 어떻게 쓰나요?</b><em>열기</em></summary><div><p><strong>1.</strong> 출고할 주문의 ‘작업 선택’을 누르세요.</p><p><strong>2.</strong> 먼저 상품준비중으로 바꾸고 포장명세서를 인쇄하세요.</p><p><strong>3.</strong> 포장이 끝나면 주문별 송장번호와 채널 배송사 코드를 넣고 전송하세요.</p><p><strong>예시:</strong> 같은 주소 주문이 2건이어도 쿠팡 정책을 확인하기 전에는 자동으로 합치지 않습니다.</p></div></details>
    <div className="shippingSelectionSummary"><span><small>결제완료</small><b>{count(paidTargets.length)}건</b></span><span><small>준비중·출고대기</small><b>{count(selected.length-paidTargets.length)}건</b></span><span><small>송장 입력완료</small><b>{count(invoiceTargets.length)}건</b></span></div>
    <div className="shippingActions"><button onClick={()=>run('PREPARE')} disabled={Boolean(busy)||!paidTargets.length}>{busy==='PREPARE'?'처리 중…':`결제완료 ${count(paidTargets.length)}건 상품준비중`}</button><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=packing&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">포장명세서</a><a className={!selected.length?'disabled':''} href={selected.length?`/api/shipping/print?type=dispatch&ids=${encodeURIComponent(printIds)}`:'#'} target="_blank" rel="noreferrer">출고목록 PDF</a><button className="secondary" onClick={findCandidates} disabled={Boolean(busy)||!selected.length}>{busy==='CANDIDATES'?'주소 확인 중…':'묶음배송 후보 찾기'}</button></div>
    <section className={`postalTestWorkbench ${postalTest.status.toLowerCase()}`} aria-live="polite"><div><span>11-3C 안전 테스트</span><b>선택 주문 1건으로 테스트 송장 확인</b><small>{postalTest.message}</small></div>{postalTest.trackingNo?<strong><small>테스트 결과</small>{postalTest.trackingNo}</strong>:null}<button type="button" onClick={runPostalTest} disabled={Boolean(busy)||!postalTestTarget}>{busy==='EPOST_TEST'?'테스트 접수 중…':'선택 1건 우체국 테스트 접수'}</button><p>실제 발송 없음 · 쇼핑몰 송장 등록 없음 · 같은 주문은 기존 결과 재사용</p></section>
    {(storedCandidates.length||liveCandidates.length)?<div className="shippingCandidates"><b>묶음배송 후보 · 자동 합배송 안 함</b>{[...storedCandidates,...liveCandidates].map((rows,index)=><span key={`${rows.join('-')}-${index}`}>{rows.length}건 · {rows.join(' · ')}</span>)}</div>:null}
    {selected.length?<section className="invoiceWorkbench"><header><div><b>선택 주문 우체국 송장</b><small>주문 카드에서 입력한 번호와 동일하게 연결됩니다.</small></div><label><span>쿠팡 배송사 코드</span><input value={coupangCourier} onChange={event=>setCoupangCourier(event.target.value.toUpperCase())} placeholder="EPOST"/></label><label><span>Cafe24 배송사 코드</span><input value={cafe24Courier} onChange={event=>setCafe24Courier(event.target.value.toUpperCase())} placeholder="관리자 우체국 코드"/></label></header><div>{selected.map(order=>{const result=actionResults[order.hubOrderId];return <label className={result?.status?.toLowerCase()||''} key={order.hubOrderId}><span><b>{order.hubOrderId}</b><small>{order.channelLabel} · {order.productName}</small>{result?<em>{result.status==='RUNNING'?'처리 중':result.status==='FAILED'?`확인 필요 · ${result.error}`:result.status==='QUEUED'?'고정 IP 전송 대기':'전송 완료'}</em>:null}</span><input inputMode="numeric" maxLength={13} disabled={Boolean(order.invoiceNumber)} value={postalTracking(order.invoiceNumber||invoices[order.hubOrderId])} onChange={event=>setInvoices(previous=>({...previous,[order.hubOrderId]:postalTracking(event.target.value)}))} placeholder="우체국 송장 13자리"/></label>})}</div><button onClick={()=>run('UPLOAD_INVOICE')} disabled={Boolean(busy)||!invoiceTargets.length}>{busy==='UPLOAD_INVOICE'?'채널 전송 중…':`송장 입력완료 ${count(invoiceTargets.length)}건 전송`}</button></section>:null}
    {message?<p className="shippingMessage">{message}</p>:null}
  </article>;
}

export default function UnifiedOrdersCenter({ center, children }) {
  const [currentCenter,setCurrentCenter]=useState(center);
  const [liveState,setLiveState]=useState({status:'IDLE',message:'매시 정각 자동수집 · 필요할 때 아래 버튼으로 즉시 수집할 수 있습니다.'});
  const [platform,setPlatform]=useState('ALL');
  const [stage,setStage]=useState('ALL');
  const [query,setQuery]=useState('');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [actionOnly,setActionOnly]=useState(false);
  const [selectedIds,setSelectedIds]=useState(()=>new Set());
  const [invoiceDrafts,setInvoiceDrafts]=useState({});
  const [shippingActionResults,setShippingActionResults]=useState({});
  const [showCount,setShowCount]=useState(20);
  const demoOrders=useMemo(()=>timingDemoOrders(currentCenter.summary.windowEnd),[currentCenter.summary.windowEnd]);
  const visible=useMemo(()=>currentCenter.orders.filter(order=>{
    const needle=query.trim().toLowerCase();
    if(platform!=='ALL'&&order.platform!==platform)return false;
    if(stage==='ALL'&&order.stage==='DELIVERED')return false;
    if(stage!=='ALL'&&order.stage!==stage)return false;
    if(actionOnly&&!order.actionRequired)return false;
    const date=String(order.orderedAt||'').slice(0,10);
    if(startDate&&date<startDate)return false;
    if(endDate&&date>endDate)return false;
    if(needle&&!`${order.hubOrderId} ${order.externalOrderId} ${order.productName} ${(order.productNames||[]).join(' ')}`.toLowerCase().includes(needle))return false;
    return true;
  }),[currentCenter.orders,platform,stage,query,startDate,endDate,actionOnly]);
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
  useEffect(()=>setShowCount(20),[platform,stage,query,startDate,endDate,actionOnly]);
  const rendered=visible.slice(0,showCount);
  const bulkEligible=visible.filter(order=>order.shippingEligible&&['PAID','PREPARING'].includes(order.stage));
  const bulkSelected=bulkEligible.filter(order=>selectedIds.has(order.hubOrderId)).length;
  const allBulkSelected=bulkEligible.length>0&&bulkSelected===bulkEligible.length;
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
  return <section className="unifiedOrdersCenter">
    <section className="unifiedOrdersHero"><div><span>PHASE 11-3C · TEST PARCEL</span><h1>통합 주문·배송센터</h1><p>쿠팡은 판매자배송 주문만 작업 목록에 표시하고, Cafe24와 함께 우체국 테스트 접수까지 안전하게 확인합니다.</p></div><div><small>지금 처리 필요</small><b>{count(currentCenter.summary.actionRequired)}건</b><em>현재 진행중 {count(currentCenter.summary.visibleDefaultTotal)}건</em><em>최근 30일 배송완료 {count(currentCenter.stageCounts.DELIVERED)}건</em><em>로켓그로스 {count(currentCenter.summary.rocketGrowthStored)}건 · 별도 저장</em></div></section>
    <article className={`liveOrdersStatus ${liveState.status.toLowerCase()}`} aria-live="polite"><div><span className="livePulse"/><span><b>{liveState.status==='LOADING'?'전체 플랫폼 수집 중':liveState.status==='READY'?'최신 상태 수집 완료':liveState.status==='PARTIAL'?'일부 채널 확인 필요':liveState.status==='FAILED'?'최신 상태 수집 실패':'1시간 자동수집'}</b><small>{liveState.message} · 작업화면 {currentCenter.summary.windowStart}~{currentCenter.summary.windowEnd}</small></span></div><button type="button" onClick={refreshLiveOrders} disabled={liveState.status==='LOADING'}>{liveState.status==='LOADING'?'수집 중…':'전체 플랫폼 수동수집'}</button></article>
    <details className="timingDemoPanel" open><summary><span><b>출고 뱃지 디자인 확인</b><small>아래 2건은 실제 주문·매출에 포함되지 않는 화면 샘플입니다.</small></span><em>샘플 접기</em></summary><div>{demoOrders.map(order=><OrderCard order={order} selected={false} onSelect={()=>{}} key={order.hubOrderId}/>)}</div></details>
    <div className="unifiedChannelStates">{currentCenter.channels.map(channel=><ChannelState channel={channel} key={channel.platform}/>)}</div>
    <details className="unifiedOrdersHelp"><summary><span><b>이 화면은 어떻게 쓰나요?</b><small>처음 볼 때만 열어보세요. 쉬운 예시로 설명합니다.</small></span><em>열기</em></summary><div><p><b>1. 위 단계 박스</b>를 누르면 그 단계 주문만 보여요.</p><p><b>2. ‘처리 필요만’</b>을 켜면 포장·출고하거나 취소를 확인할 주문만 남아요.</p><p><b>예시:</b> 취소 경고가 붙은 주문은 송장을 넣기 전에 쇼핑몰에서 취소 요청부터 확인하세요.</p><p>채널 하나가 실패해도 정상 채널 주문은 계속 표시됩니다. 실패 채널은 위 상태 카드에서 따로 알려드립니다.</p></div></details>
    <article className="unifiedProcessPanel"><header><div><span>실시간 주문 흐름 · 배송완료 최근 30일</span><h2>배송완료는 5단계를 눌렀을 때만 표시됩니다</h2></div><button className={stage==='ALL'?'active':''} onClick={()=>setStage('ALL')}>진행중 전체 {count(currentCenter.summary.visibleDefaultTotal)}건</button></header><div className="unifiedOrderFlow">{currentCenter.stages.map((item,index)=><div key={item.id}><button className={stage===item.id?'active':''} onClick={()=>setStage(item.id)}><small>{index+1}. {item.label}</small><b>{count(currentCenter.stageCounts[item.id])}건</b><span>{item.id==='DELIVERED'?'최근 30일 · 클릭해서 보기':item.description}</span></button>{index<currentCenter.stages.length-1?<i>→</i>:null}</div>)}</div></article>
    <article className="unifiedOrderToolbar"><div><label><span>채널</span><select value={platform} onChange={event=>setPlatform(event.target.value)}>{Object.entries(CHANNEL_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>주문 상태</span><select value={stage} onChange={event=>setStage(event.target.value)}><option value="ALL">진행중 전체</option>{currentCenter.stages.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="orderSearch"><span>주문·상품 검색</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="허브번호·쇼핑몰번호·상품명"/></label><label><span>시작일</span><input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><label><span>종료일</span><input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></label></div><footer><label className="actionOnly"><input type="checkbox" checked={actionOnly} onChange={event=>setActionOnly(event.target.checked)}/><span>처리 필요만 보기</span></label><strong>{count(visible.length)}건 표시</strong><a href={exportHref}>엑셀 다운로드</a></footer></article>
    <article className="bulkShippingSelection"><label><input type="checkbox" checked={allBulkSelected} disabled={!bulkEligible.length} onChange={event=>selectBulk(event.target.checked)}/><span><b>결제완료·준비중 전체선택</b><small>현재 검색·채널 조건의 출고 가능 주문 {count(bulkEligible.length)}건</small></span></label><div><b>{count(bulkSelected)}건 선택됨</b><button type="button" onClick={()=>setSelectedIds(new Set())} disabled={!selectedIds.size}>전체 선택 해제</button></div></article>
    <PostalConnectionPanel/>
    <ShippingWorkbench orders={currentCenter.orders} selectedIds={selectedIds} invoices={invoiceDrafts} setInvoices={setInvoiceDrafts} actionResults={shippingActionResults} setActionResults={setShippingActionResults}/>
    {currentCenter.summary.cancellations?<div className="unifiedCancelSummary"><b>출고 전에 확인할 취소·반품 요청 {count(currentCenter.summary.cancellations)}건</b><span>처리 완료된 요청은 숨기고, 현재 확인이 필요한 요청만 표시합니다.</span></div>:null}
    <div className="unifiedOrderList">{rendered.length?rendered.map(order=><OrderCard order={order} selected={selectedIds.has(order.hubOrderId)} onSelect={selectOrder} invoiceDraft={invoiceDrafts[order.hubOrderId]||''} onInvoiceChange={updateInvoice} actionState={shippingActionResults[order.hubOrderId]} key={`${order.platform}:${order.hubOrderId}`}/>):<div className="unifiedOrdersEmpty"><b>이 조건의 주문이 없습니다.</b><span>검색어나 기간을 지우고 다시 확인해보세요.</span></div>}</div>
    {rendered.length<visible.length?<button className="unifiedOrdersMore" onClick={()=>setShowCount(value=>value+20)}>주문 20건 더 보기 · 남은 {count(visible.length-rendered.length)}건</button>:null}
    {children?<details className="legacyCoupangOrders"><summary><span><b>쿠팡 배송 처리 상세</b><small>상품준비중 처리·송장 입력 등 쿠팡 작업이 필요할 때 펼치세요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
  </section>;
}
