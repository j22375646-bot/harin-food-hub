'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import collectionProgress from '../../../lib/orders/collection-progress.js';
import './orders-page.css';

const {activeCollectionPlatforms,collectionProgressLabel}=collectionProgress;

const STAGES=[
  {id:'ACTIVE',label:'송장 발급 전',icon:'orders',progress:0,description:'수취정보를 확인한 뒤 송장을 발급하세요.',action:'선택 주문 송장 발급'},
  {id:'EPOST',label:'우체국 발급',icon:'truck',progress:.25,description:'발급된 송장번호와 실패 내역을 확인하세요.',action:'발급 결과 확인'},
  {id:'REGISTER',label:'배송대기중',icon:'approvals',progress:.5,description:'접수 전·접수중 주문을 우체국 조회 결과로 확인하세요.',action:'접수·집중국 조회'},
  {id:'IN_TRANSIT',label:'배송중',icon:'sync',progress:.75,description:'이동 경로와 도착 예정 시각을 확인하세요.',action:'지연 배송 확인'},
  {id:'COMPLETED',label:'최근 완료',icon:'shield',progress:1,description:'최근 30일 완료 기록을 필요할 때만 펼쳐보세요.',action:'완료 주문 보기'}
];
const COURIER={COUPANG:'EPOST',NAVER:'EPOST',CAFE24:'0012'};
const CHANNEL_NAMES={NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'};
const CHANNEL_STATUS={READY:'정상',RUNNING:'수집 중',FAILED:'수집 실패',SETUP_REQUIRED:'설정 필요',RECONNECT_REQUIRED:'재연결 필요'};
const ACTIVE_STAGES=new Set(['PAID','PREPARING','READY_TO_SHIP']);
const wait=milliseconds=>new Promise(resolve=>window.setTimeout(resolve,milliseconds));

function money(value){return `${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;}
function dateTime(value){
  if(!value)return '주문 시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '주문 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function referenceTime(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function trackingNumber(value){return String(value||'').replace(/\D/g,'').slice(0,13);}
function receiverAddress(receiver={}){return [receiver.postCode&&`(${receiver.postCode})`,receiver.address,receiver.addressDetail].filter(Boolean).join(' ')||'배송지 확인 필요';}
function productOption(order={}){
  const item=order.items?.[0];
  const option=item?.option||'기본 옵션';
  const quantity=Number(order.quantity||item?.quantity)||0;
  return `${option} · 총 ${quantity||'확인 필요'}개 · ${order.hubOrderId||'주문번호 확인'}`;
}
function rowTone(order={}){
  if(order.cancelled)return 'cancelled';
  if(order.timingBadge?.type==='DELAYED')return 'delay';
  return {PAID:'paid',PREPARING:'preparing',READY_TO_SHIP:'preparing',SHIPPING:'shipping',DELIVERED:'complete',CANCELLED:'cancelled'}[order.stage]||'preparing';
}

function useCutoff(initialMinutes){
  const initial=typeof initialMinutes==='number'?Math.max(0,initialMinutes):null;
  const deadlineRef=useRef(initial==null?null:Date.now()+initial*60*1000);
  const [remaining,setRemaining]=useState(initial);
  useEffect(()=>{
    if(deadlineRef.current==null)return undefined;
    const update=()=>setRemaining(Math.max(0,Math.ceil((deadlineRef.current-Date.now())/60000)));
    update();
    const timer=window.setInterval(update,60000);
    return()=>window.clearInterval(timer);
  },[]);
  if(remaining==null)return {hours:'--',minutes:'--',remaining:null};
  return {hours:String(Math.floor(remaining/60)).padStart(2,'0'),minutes:String(remaining%60).padStart(2,'0'),remaining};
}

async function pollCoupangTransfer(item){
  if(item.platform!=='COUPANG'||!item.requestId||!['QUEUED','RUNNING'].includes(item.status))return item;
  for(let attempt=0;attempt<35;attempt+=1){
    if(attempt)await wait(1200);
    const response=await fetch(`/api/coupang/operations/${encodeURIComponent(item.requestId)}`,{cache:'no-store'});
    const result=await response.json();
    if(response.status===202)continue;
    if(!response.ok||!result.ok)throw new Error(result.error||'쿠팡 송장 전송에 실패했습니다.');
    return {...item,status:'SUCCESS',error:''};
  }
  throw new Error('고정 IP 서버 응답이 늦습니다. 송장번호는 보존됐으니 채널 전송만 다시 시도하세요.');
}

async function pollPostalIssue(item){
  if(!item?.request?.id)throw new Error(`${item?.hubOrderId||'주문'} 발급 작업번호가 없습니다.`);
  for(let attempt=0;attempt<80;attempt+=1){
    if(attempt)await wait(1500);
    const response=await fetch(`/api/epost/issue?requestId=${encodeURIComponent(item.request.id)}`,{cache:'no-store'});
    const result=await response.json();
    if(response.status===202)continue;
    if(!response.ok||!result.ok)throw new Error(result.error||`${item.hubOrderId} 송장 발급 실패`);
    const invoiceNumber=trackingNumber(result.result?.trackingNo);
    if(invoiceNumber.length!==13)throw new Error(`${item.hubOrderId} 송장번호 13자리를 확인하지 못했습니다.`);
    return {hubOrderId:item.hubOrderId,invoiceNumber,reused:Boolean(result.result?.reused)};
  }
  throw new Error(`${item.hubOrderId} 우체국 응답이 늦습니다. 잠시 뒤 다시 시도해주세요.`);
}

function Runway({workspaces,activeStage,onStageChange,cutoff,onOpenActions,delayOnly,onDelayToggle}){
  const stage=STAGES.find(item=>item.id===activeStage)||STAGES[0];
  const counts=Object.fromEntries((workspaces||[]).map(item=>[item.id,item.count]));
  return <section className="ordersRunway" aria-label="오늘의 출고 흐름">
    <div className="runwayHead">
      <div><h2>오늘의 출고 레일</h2><p>막힌 단계를 누르면 그 주문만 바로 모아드려요.</p><span className="mobileRunwayHint">좌우로 밀어 출고 5단계를 확인하세요.</span></div>
      <div className={`cutoffClock${cutoff.remaining!=null&&cutoff.remaining<=60?' urgent':''}`} aria-label={cutoff.remaining==null?'당일출고 마감 확인 필요':`당일출고 마감까지 ${cutoff.hours}시간 ${cutoff.minutes}분 남음`}>
        <div><span>당일출고 마감</span><em>오후 3시</em></div>
        <strong><span>{cutoff.hours}</span><i>:</i><span>{cutoff.minutes}</span></strong>
        <b aria-hidden="true"><i style={{width:`${cutoff.remaining==null?0:Math.max(0,Math.min(100,cutoff.remaining/300*100))}%`}}/></b>
        <small>{cutoff.remaining==null?'기준시각 확인 필요':'남은 시간 · 1분마다 갱신'}</small>
      </div>
    </div>
    <div className="stageTrack" role="tablist" aria-label="배송 단계" style={{'--stage-progress':stage.progress}}>
      {STAGES.map(item=>{const active=item.id===activeStage;const count=counts[item.id];return <button type="button" role="tab" data-phase28-orders-stage={item.id} aria-selected={active} tabIndex={active?0:-1} className={active?'active':''} onClick={()=>onStageChange(item.id)} key={item.id}><span><HarinIcon name={item.icon} size={19}/></span><strong>{item.label}</strong><small>{count==null?'확인 필요':`${Number(count).toLocaleString('ko-KR')}건`}</small></button>;})}
    </div>
    <div className="runwaySummary"><span><strong>{stage.label} {counts[stage.id]==null?'확인 필요':`${Number(counts[stage.id]).toLocaleString('ko-KR')}건`}</strong>{stage.description}</span><span><button type="button" className={delayOnly?'active':''} onClick={onDelayToggle}>배송지연 확인</button><button type="button" onClick={onOpenActions}>{stage.action}<HarinIcon name="chevron" size={15}/></button></span></div>
  </section>;
}

function FreshnessDock({channels=[],asOf,syncState,syncPlatforms=[],onSync}){
  const ready=channels.filter(item=>['READY','RUNNING'].includes(String(item.status||'').toUpperCase())).length;
  const progressLabel=syncState==='RUNNING'?(syncPlatforms.length?collectionProgressLabel(syncPlatforms):'완료 반영 중'):'1시간 자동';
  return <section className="ordersFreshness" aria-label="채널별 주문 수집 상태" aria-live="polite">
    <div className="freshnessSummary"><i/><span><strong>{channels.length?`${ready}/${channels.length} ${ready===channels.length?'최신':'확인 필요'}`:'상태 확인 중'}</strong><small>주문 데이터</small></span></div>
    <div className="freshnessChannels">{['NAVER','CAFE24','COUPANG'].map(brand=>{const channel=channels.find(item=>String(item.platform||'').toUpperCase()===brand);return <span key={brand}><Phase28ChannelLogo brand={brand} size="compact"/><span>{CHANNEL_NAMES[brand]}<strong>{channel?.message||CHANNEL_STATUS[channel?.status]||'확인 필요'}</strong></span></span>;})}</div>
    <span className={`autoCycle${syncState==='RUNNING'?' collecting':''}`}><HarinIcon name={syncState==='RUNNING'?'sync':'clock'} size={16}/>{progressLabel}</span>
    <button type="button" onClick={onSync} disabled={syncState==='RUNNING'}><HarinIcon name="sync" size={17}/>{syncState==='RUNNING'?'수집 중':'전체 수집'}</button>
    <small className="freshnessAsOf">{referenceTime(asOf)}</small>
  </section>;
}

function OrderRow({order,selected,onSelect}){
  const selectable=order.selectionEligible===true;
  const receiver=order.receiver||{};
  const selectionReason=order.selectionBlockedReason||'현재 주문은 허브 출고 작업에서 선택할 수 없습니다.';
  return <article className={`orderRow${selected?' selected':''}${order.cancellationRequested?' cancellation':''}`} data-selection-locked={selectable?undefined:'true'}>
    <input type="checkbox" checked={selected} disabled={!selectable} title={selectable?'출고 주문 선택':selectionReason} onChange={event=>onSelect(order,event.target.checked)} aria-label={selectable?`${order.productName} 주문 선택`:`${order.productName} 선택 불가 · ${selectionReason}`}/>
    <div className="orderProduct"><span className={`productPictogram ${String(order.platform||'').toLowerCase()}`}><HarinIcon name="product" size={22}/></span><span><span className="productMeta"><Phase28ChannelLogo brand={order.platform} size="compact"/>{order.channelLabel} · 판매자배송{order.platform==='NAVER'?<em className="selectionLock">네이버 송장 발급</em>:null}</span><strong>{order.productName}</strong><small>{productOption(order)}</small></span></div>
    <div className="shippingPerson"><strong>{receiver.name||'받는 분 확인 필요'} · {receiver.contact||'연락처 확인 필요'}</strong><span>{receiverAddress(receiver)} · {receiver.message||'배송메모 없음'}</span></div>
    <div className="orderTime"><strong>{dateTime(order.orderedAt)}</strong><span>{order.timingBadge?.detail||'출고 일정 확인'}</span></div>
    <div className="orderBadges"><span data-tone={rowTone(order)}>{order.stageLabel}</span>{order.timingBadge?<span data-tone={order.timingBadge.type==='DELAYED'?'delay':'schedule'}>{order.timingBadge.label||'일정 확인'}</span>:null}</div>
    <div className="orderAmount"><strong>{money(order.amount)}</strong><span>{Number(order.quantity||0).toLocaleString('ko-KR')}개</span></div>
  </article>;
}

function OrdersWorkspace({orders,stage,selectedIds,onSelect,platform,setPlatform,delayOnly,onOpenActions,visibleLimit=20}){
  const [showCount,setShowCount]=useState(visibleLimit);
  useEffect(()=>setShowCount(visibleLimit),[stage,platform,delayOnly,visibleLimit]);
  const visible=useMemo(()=>orders.filter(order=>order.stageIds?.includes(stage)).filter(order=>platform==='ALL'||order.platform===platform).filter(order=>!delayOnly||order.timingBadge?.type==='DELAYED'),[orders,stage,platform,delayOnly]);
  const eligible=visible.filter(order=>order.selectionEligible===true);
  const allSelected=Boolean(eligible.length)&&eligible.every(order=>selectedIds.has(order.hubOrderId));
  const stageLabel=STAGES.find(item=>item.id===stage)?.label||'주문';
  function toggleAll(checked){eligible.forEach(order=>onSelect(order,checked));}
  return <section className="ordersWorkspace">
    <header><div><h2>{stageLabel} 주문</h2><p>배송정보·연락처·메모를 누르지 않아도 바로 확인할 수 있어요.</p></div><div><select value={platform} onChange={event=>setPlatform(event.target.value)} aria-label="판매 채널 필터"><option value="ALL">전체 채널</option><option value="NAVER">네이버</option><option value="CAFE24">Cafe24</option><option value="COUPANG">쿠팡</option></select><span>{delayOnly?'배송지연만':'전체 일정'}</span></div></header>
    <div className="bulkBar"><input type="checkbox" checked={allSelected} disabled={!eligible.length} onChange={event=>toggleAll(event.target.checked)} aria-label="현재 출고 가능 주문 전체 선택"/><strong>{selectedIds.size.toLocaleString('ko-KR')}건 선택</strong><span>현재 화면의 출고 가능 주문만 선택돼요.</span><button type="button" onClick={onOpenActions} disabled={!selectedIds.size}>선택 주문 출고하기</button></div>
    <div className="orderRows">{visible.length?visible.slice(0,showCount).map(order=><OrderRow order={order} selected={selectedIds.has(order.hubOrderId)} onSelect={onSelect} key={order.hubOrderId}/>):<div className="ordersEmpty"><strong>{stageLabel}에 표시할 주문이 없어요.</strong><span>{delayOnly?'배송지연 필터를 해제하거나 다른 단계를 확인하세요.':'다른 출고 단계를 확인하거나 전체 수집을 실행하세요.'}</span></div>}</div>
    {showCount<visible.length?<button type="button" className="ordersMore" onClick={()=>setShowCount(value=>value+visibleLimit)}>주문 {Math.min(visibleLimit,visible.length-showCount)}건 더 보기 · 남은 {(visible.length-showCount).toLocaleString('ko-KR')}건</button>:null}
  </section>;
}

function OrdersRail({activeTab,setActiveTab,selectedOrders,previewOrder,channels,activeStage,busy,delayedCount,onPrimaryAction,onSync}){
  const tabs=[{id:'selected',label:'선택 주문'},{id:'actions',label:'출고 작업'},{id:'sync',label:'수집 상태'}];
  const stage=STAGES.find(item=>item.id===activeStage)||STAGES[0];
  const receiver=previewOrder?.receiver||{};
  const primaryLabel=activeStage==='COMPLETED'?'최근 완료 주문 확인':activeStage==='IN_TRANSIT'||activeStage==='REGISTER'?'우체국 배송상태 새로고침':`선택 ${selectedOrders.length.toLocaleString('ko-KR')}건 송장 발급`;
  function onTabKey(event,index){
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:(index-1+tabs.length)%tabs.length;
    setActiveTab(tabs[next].id);
    document.getElementById(`phase28-orders-tab-${tabs[next].id}`)?.focus();
  }
  return <div className="ordersRail">
    <section className="ordersRailCard">
      <div className="ordersRailTabs" role="tablist" aria-label="주문 보조 작업">{tabs.map((tab,index)=><button type="button" role="tab" id={`phase28-orders-tab-${tab.id}`} aria-selected={activeTab===tab.id} aria-controls={`phase28-orders-panel-${tab.id}`} tabIndex={activeTab===tab.id?0:-1} onClick={()=>setActiveTab(tab.id)} onKeyDown={event=>onTabKey(event,index)} key={tab.id}>{tab.label}</button>)}</div>
      <div className="railPanels">
        <section role="tabpanel" id="phase28-orders-panel-selected" aria-labelledby="phase28-orders-tab-selected" aria-hidden={activeTab!=='selected'} inert={activeTab==='selected'?undefined:true} data-active={activeTab==='selected'}><header><h3>선택한 주문을 확인하세요</h3><p>수취 정보와 배송메모를 항상 보여드려요.</p></header><div className="selectionCount"><span>작업 선택</span><strong>{selectedOrders.length.toLocaleString('ko-KR')}건</strong></div>{previewOrder?<><div className="orderDetail"><div><span>받는 분</span><strong>{receiver.name||'확인 필요'} · {receiver.contact||'연락처 확인 필요'}</strong></div><div><span>주소</span><strong>{receiverAddress(receiver)}</strong></div><div><span>상품·수량</span><strong>{previewOrder.productName} · {Number(previewOrder.quantity||0).toLocaleString('ko-KR')}개</strong></div></div><div className="orderMemo"><strong>배송메모</strong><br/>{receiver.message||'배송메모 없음'}</div></>:<div className="railEmpty">현재 단계에 표시할 주문이 없어요.</div>}<button type="button" className="railPrimary" onClick={()=>setActiveTab('actions')} disabled={!selectedOrders.length}>선택 주문 출고 작업 열기</button></section>
        <section role="tabpanel" id="phase28-orders-panel-actions" aria-labelledby="phase28-orders-tab-actions" aria-hidden={activeTab!=='actions'} inert={activeTab==='actions'?undefined:true} data-active={activeTab==='actions'}><header><h3>{stage.action}</h3><p>{stage.description}</p></header><div className="actionSteps"><div><i>1</i><span><strong>주문 확인</strong><small>{selectedOrders.length}건 선택됨</small></span></div><div><i>2</i><span><strong>우체국 송장 자동발급</strong><small>계약소포 번호를 받아와요.</small></span></div><div><i>3</i><span><strong>쇼핑몰 자동등록</strong><small>채널별 택배사 코드로 전송해요.</small></span></div></div><button type="button" className="railPrimary" onClick={onPrimaryAction} disabled={Boolean(busy)||(!selectedOrders.length&&!['REGISTER','IN_TRANSIT','COMPLETED'].includes(activeStage))}>{busy||primaryLabel}</button></section>
        <section role="tabpanel" id="phase28-orders-panel-sync" aria-labelledby="phase28-orders-tab-sync" aria-hidden={activeTab!=='sync'} inert={activeTab==='sync'?undefined:true} data-active={activeTab==='sync'}><header><h3>판매 채널 최신 상태</h3><p>한 채널 오류가 다른 채널을 막지 않아요.</p></header><div className="channelHealth">{['NAVER','CAFE24','COUPANG'].map(brand=>{const channel=channels.find(item=>String(item.platform||'').toUpperCase()===brand);const ready=['READY','RUNNING'].includes(String(channel?.status||'').toUpperCase());return <div key={brand}><Phase28ChannelLogo brand={brand}/><span><strong>{CHANNEL_NAMES[brand]}</strong><small>{channel?.message||'최근 수집 상태 확인'}</small></span><em data-ready={ready}>{CHANNEL_STATUS[channel?.status]||channel?.label||'확인 필요'}</em></div>;})}</div><button type="button" className="railPrimary" onClick={onSync} disabled={Boolean(busy)}>전체 플랫폼 다시 수집</button></section>
      </div>
    </section>
    <section className="ordersRailSummary"><h3>오늘 출고 기준</h3><div><span>당일출고 마감</span><strong>오후 3시</strong></div><div><span>배송지연</span><strong>{Number(delayedCount||0).toLocaleString('ko-KR')}건 확인</strong></div><div><span>로켓그로스</span><strong>자동처리 · 제외</strong></div></section>
  </div>;
}

export default function Phase28OrdersPage({model={}}){
  const router=useRouter();
  const hero=model.hero||{};
  const orders=model.orders||[];
  const channels=model.channels||[];
  const [activeStage,setActiveStage]=useState('ACTIVE');
  const [activeRailTab,setActiveRailTab]=useState('selected');
  const [selectedIds,setSelectedIds]=useState(()=>new Set());
  const [platform,setPlatform]=useState('ALL');
  const [delayOnly,setDelayOnly]=useState(false);
  const [busy,setBusy]=useState('');
  const [syncState,setSyncState]=useState('IDLE');
  const [syncPlatforms,setSyncPlatforms]=useState([]);
  const [statusMessage,setStatusMessage]=useState('');
  const [toastVisible,setToastVisible]=useState(false);
  const cutoff=useCutoff(model.cutoff?.remainingMinutes);
  const selectedOrders=useMemo(()=>orders.filter(order=>selectedIds.has(order.hubOrderId)),[orders,selectedIds]);
  const stageOrders=useMemo(()=>orders.filter(order=>order.stageIds?.includes(activeStage)),[orders,activeStage]);
  const previewOrder=selectedOrders[0]||stageOrders[0]||null;
  useEffect(()=>{
    if(!statusMessage)return undefined;
    setToastVisible(true);
    const timer=window.setTimeout(()=>setToastVisible(false),2600);
    return()=>window.clearTimeout(timer);
  },[statusMessage]);

  function selectOrder(order,checked){
    if(checked&&order.selectionEligible!==true){setStatusMessage(order.selectionBlockedReason||'현재 주문은 허브 출고 작업에서 선택할 수 없어요.');return;}
    setSelectedIds(previous=>{const next=new Set(previous);if(checked)next.add(order.hubOrderId);else next.delete(order.hubOrderId);return next;});
  }
  function changeStage(id){setActiveStage(id);setDelayOnly(false);setStatusMessage(`${STAGES.find(item=>item.id===id)?.label||'선택 단계'} 주문만 모았어요.`);}
  function openActions(){setActiveRailTab('actions');document.getElementById('phase28-orders-tab-actions')?.focus({preventScroll:true});}

  async function syncOrders(){
    setSyncState('RUNNING');setSyncPlatforms(activeCollectionPlatforms({naver:'PENDING',cafe24:'RUNNING',coupang:'PENDING'}));setBusy('전체 주문 수집 중…');setStatusMessage('네이버·Cafe24·쿠팡 주문 수집을 시작했어요.');
    try{
      const startResponse=await fetch('/api/orders/live-refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const start=await startResponse.json();
      if(!startResponse.ok||!start.ok)throw new Error(start.error||'전체 주문 수집을 시작하지 못했습니다.');
      const coupangRequestId=start.requests?.coupang?.id||'';
      const naverRequestId=start.requests?.naver?.id||'';
      const cafe24Status=start.cafe24Error?'FAILED':(start.cafe24?.status||'SUCCESS');
      setSyncPlatforms(activeCollectionPlatforms({naver:start.requests?.naver,cafe24:cafe24Status,coupang:start.requests?.coupang}));
      if(coupangRequestId||naverRequestId){
        let settled=false;
        let latestPlatforms=[];
        for(let attempt=0;attempt<80;attempt+=1){
          if(attempt)await wait(1200);
          const params=new URLSearchParams();
          if(coupangRequestId)params.set('coupangRequestId',coupangRequestId);
          if(naverRequestId)params.set('naverRequestId',naverRequestId);
          const response=await fetch(`/api/orders/live-refresh?${params}`,{cache:'no-store'});
          const result=await response.json();
          if(!response.ok)throw new Error(result.error||'주문 수집 상태를 확인하지 못했습니다.');
          latestPlatforms=activeCollectionPlatforms({naver:result.requests?.naver,cafe24:cafe24Status,coupang:result.requests?.coupang});
          setSyncPlatforms(latestPlatforms);
          if(response.status===202||result.pending)continue;
          settled=true;
          if(result.partial)setStatusMessage(`주문 수집 완료 · ${result.failures?.join(' · ')||'일부 채널 확인 필요'}`);
          else setStatusMessage('전체 플랫폼 최신 주문을 반영했어요.');
          break;
        }
        if(!settled)setStatusMessage(`${collectionProgressLabel(latestPlatforms).replace(/ 수집 중$/,'')} 수집이 계속 진행 중이에요. 수집 상태에서 완료 여부를 확인해주세요.`);
      }else setStatusMessage(start.partial?'일부 채널은 확인이 필요해요.':'전체 플랫폼 최신 주문을 반영했어요.');
      router.refresh();
    }catch(error){setStatusMessage(`수집 확인 필요 · ${error.message}`);}finally{setSyncState('IDLE');setSyncPlatforms([]);setBusy('');}
  }

  async function issueAndTransfer(){
    const targets=selectedOrders.filter(order=>order.platform!=='NAVER'&&order.selectionEligible===true&&order.shippingEligible&&!trackingNumber(order.invoiceNumber)&&ACTIVE_STAGES.has(order.stage));
    if(!targets.length){setStatusMessage('송장이 없는 결제완료·준비중·출고대기 주문을 선택하세요.');return;}
    if(!window.confirm(`선택한 ${targets.length}건의 실제 우체국 송장을 발급하고 각 쇼핑몰에 자동 등록할까요?\n실제 계약소포 접수가 생성됩니다.`))return;
    setBusy('송장 발급·등록 처리 중…');
    try{
      let readyTargets=[...targets];
      const paid=targets.filter(order=>order.stage==='PAID');
      if(paid.length){
        setStatusMessage('1/3 결제완료 주문을 상품준비중으로 바꾸고 있어요.');
        const response=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action:'PREPARE',orders:paid.map(order=>({hubOrderId:order.hubOrderId}))})});
        const result=await response.json();
        const settled=await Promise.all((result.results||[]).map(async item=>{try{return await pollCoupangTransfer({...item,status:item.ok?(item.status||'SUCCESS'):'FAILED'});}catch(error){return {...item,status:'FAILED',error:error.message};}}));
        const failed=new Set(settled.filter(item=>item.status==='FAILED').map(item=>item.hubOrderId));
        readyTargets=readyTargets.filter(order=>!failed.has(order.hubOrderId));
        if(!readyTargets.length)throw new Error('상품준비중 변경에 실패해 송장을 발급하지 않았습니다.');
      }
      setStatusMessage(`2/3 우체국 송장 ${readyTargets.length}건을 자동발급하고 있어요.`);
      const issueResponse=await fetch('/api/epost/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,orderIds:readyTargets.map(order=>order.hubOrderId)})});
      const issueStart=await issueResponse.json();
      if(!issueResponse.ok||!issueStart.ok)throw new Error(issueStart.error||'우체국 송장 자동발급 시작 실패');
      const issued=await Promise.all((issueStart.results||[]).filter(item=>item.ok).map(async item=>{try{return {...await pollPostalIssue(item),ok:true};}catch(error){return {hubOrderId:item.hubOrderId,ok:false,error:error.message};}}));
      const invoiceById=Object.fromEntries(issued.filter(item=>item.ok).map(item=>[item.hubOrderId,item.invoiceNumber]));
      const transferTargets=readyTargets.filter(order=>invoiceById[order.hubOrderId]);
      if(!transferTargets.length)throw new Error(issued.find(item=>!item.ok)?.error||'발급된 송장이 없습니다.');
      setStatusMessage(`3/3 발급된 송장 ${transferTargets.length}건을 쇼핑몰에 등록하고 있어요.`);
      const transferResponse=await fetch('/api/shipping/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true,action:'UPLOAD_INVOICE',orders:transferTargets.map(order=>({hubOrderId:order.hubOrderId,invoiceNumber:invoiceById[order.hubOrderId],deliveryCompanyCode:COURIER[order.platform]}))})});
      const transfer=await transferResponse.json();
      const immediate=(transfer.results||[]).map(item=>({...item,status:item.ok?(item.status||'SUCCESS'):'FAILED',error:item.error||''}));
      const settled=await Promise.all(immediate.map(async item=>{try{return await pollCoupangTransfer(item);}catch(error){return {...item,status:'FAILED',error:error.message};}}));
      const completed=settled.filter(item=>item.status==='SUCCESS').length;
      const failed=issued.filter(item=>!item.ok).length+settled.filter(item=>item.status==='FAILED').length;
      setStatusMessage(`자동 출고 처리 완료 · 송장발급 ${issued.filter(item=>item.ok).length}건 · 쇼핑몰 등록 ${completed}건${failed?` · 다시 확인 ${failed}건`:''}`);
      setSelectedIds(new Set());router.refresh();
    }catch(error){setStatusMessage(`자동 출고 처리 중단 · ${error.message}`);}finally{setBusy('');}
  }

  async function refreshTracking(){
    const ids=stageOrders.filter(order=>trackingNumber(order.invoiceNumber).length===13).map(order=>order.hubOrderId);
    if(!ids.length){setStatusMessage('현재 단계에는 전송이 끝난 13자리 송장번호가 없어요.');return;}
    setBusy('우체국 배송조회 중…');setStatusMessage(`${ids.length}건의 우체국 배송상태를 확인하고 있어요.`);
    try{
      const response=await fetch('/api/shipping/tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderIds:ids})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'배송상태 확인 시작 실패');
      setStatusMessage('배송상태 확인 요청을 보냈어요. 완료되면 단계가 자동으로 바뀝니다.');
      router.refresh();
    }catch(error){setStatusMessage(`배송추적 확인 필요 · ${error.message}`);}finally{setBusy('');}
  }

  function primaryAction(){
    if(activeStage==='REGISTER'||activeStage==='IN_TRANSIT')return refreshTracking();
    if(activeStage==='COMPLETED'){setStatusMessage('최근 30일 완료 주문을 현재 목록에 표시하고 있어요.');return;}
    return issueAndTransfer();
  }

  const workCount=typeof hero.workCount==='number'?hero.workCount:null;
  return <section className="p28OrdersPage" data-phase28-root="true" data-phase28-page="orders">
    <div className="ordersIntro"><Phase28PageHeading context={`채널 ${channels.length||0}/3 최신 · 판매자배송만 표시`} title="오늘 출고할 주문은 " accent={workCount==null?'확인 필요':`${workCount.toLocaleString('ko-KR')}건`} suffix="이에요." summary="취소 주문과 로켓그로스는 작업목록에서 빼고, 직접 보낼 주문만 모았어요."/><div className="ordersSyncCluster"><span><i><HarinIcon name="sync" size={19}/></i><span><small>{syncState==='RUNNING'?(syncPlatforms.length?collectionProgressLabel(syncPlatforms):'완료 반영 중'):'마지막 전체 동기화'}</small><strong>{referenceTime(hero.asOf)}</strong></span></span><button type="button" onClick={syncOrders} disabled={syncState==='RUNNING'}><HarinIcon name="sync" size={17}/>{syncState==='RUNNING'?'수집 중':'지금 동기화'}</button></div></div>
    <Phase28RightRailLayout label="출고 보조석" rail={<OrdersRail activeTab={activeRailTab} setActiveTab={setActiveRailTab} selectedOrders={selectedOrders} previewOrder={previewOrder} channels={channels} activeStage={activeStage} busy={busy} delayedCount={hero.delayedCount} onPrimaryAction={primaryAction} onSync={syncOrders}/> }>
      <div className="ordersCore"><Runway workspaces={model.workspaces||[]} activeStage={activeStage} onStageChange={changeStage} cutoff={cutoff} onOpenActions={openActions} delayOnly={delayOnly} onDelayToggle={()=>setDelayOnly(value=>!value)}/><FreshnessDock channels={channels} asOf={hero.asOf} syncState={syncState} syncPlatforms={syncPlatforms} onSync={syncOrders}/><OrdersWorkspace orders={orders} stage={activeStage} selectedIds={selectedIds} onSelect={selectOrder} platform={platform} setPlatform={setPlatform} delayOnly={delayOnly} onOpenActions={openActions} visibleLimit={model.visibleLimit||20}/>{selectedIds.size?<div className="mobileBatchAction"><span><strong>{selectedIds.size}건 선택</strong><small>판매자배송 출고 작업</small></span><button type="button" onClick={openActions}>우체국 발급</button></div>:null}</div>
    </Phase28RightRailLayout>
    <div className={`ordersToast${toastVisible?' visible':''}`} role="status" aria-live="polite">{statusMessage}</div>
  </section>;
}
