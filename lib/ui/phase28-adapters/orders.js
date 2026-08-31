'use strict';

const businessCalendar=require('../../shipping-reference/business-calendar.js');

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const invoiceReady=value=>/^\d{13}$/.test(String(value||'').replace(/\D/g,''));
const activeStage=value=>['PAID','PREPARING','READY_TO_SHIP'].includes(String(value||''));
const stageLabel=value=>({PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',WAITING_FOR_CARRIER:'배송대기중',SHIPPING:'배송중',DELIVERED:'배송완료',CANCELLED:'취소'}[value]||'상태 확인');
const channelLabel=value=>({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'}[value]||String(value||'채널 확인'));

function invoiceView(order={}){
  const registered=String(order.invoiceNumber||'').replace(/\D/g,'');
  const issued=String(order.issuedInvoiceNumber||'').replace(/\D/g,'');
  if(/^\d{13}$/.test(registered))return Object.freeze({status:'REGISTERED',label:'플랫폼 등록',number:registered});
  if(/^\d{13}$/.test(issued))return Object.freeze({status:'ISSUED',label:'발급 완료 · 등록 필요',number:issued});
  return null;
}

function frozenRows(items=[]){
  return Object.freeze(items.map(item=>Object.freeze(item)));
}

function orderStageIds(order={}){
  const ids=[];
  const registered=invoiceReady(order.invoiceNumber);
  const active=activeStage(order.stage)&&!order.cancelled&&order.fulfillment!=='ROCKET_GROWTH';
  if(active&&!registered)ids.push('ACTIVE');
  if(active&&!registered&&order.shippingEligible===true)ids.push('EPOST');
  if(!order.cancelled&&registered&&!['SHIPPING','DELIVERED'].includes(order.stage)&&order.tracking?.statusCode!=='IN_TRANSIT'&&order.tracking?.statusCode!=='DELIVERED')ids.push('REGISTER');
  if(!order.cancelled&&(order.stage==='SHIPPING'||order.tracking?.statusCode==='IN_TRANSIT'))ids.push('IN_TRANSIT');
  if(order.cancelled||order.stage==='DELIVERED'||order.stage==='CANCELLED'||order.tracking?.statusCode==='DELIVERED')ids.push('COMPLETED');
  return ids;
}

function safeReceiver(receiver={}){
  return Object.freeze({
    name:String(receiver.name||''),
    contact:String(receiver.contact||receiver.safeNumber||''),
    postCode:String(receiver.postCode||''),
    address:String(receiver.address||''),
    addressDetail:String(receiver.addressDetail||''),
    message:String(receiver.message||'')
  });
}

function safeItems(items=[]){
  return frozenRows(items.slice(0,8).map(item=>({
    id:String(item.externalItemId||item.vendorItemId||item.productId||item.name||''),
    name:String(item.name||'상품 정보 확인 필요'),
    option:String(item.option||''),
    quantity:number(item.quantity),
    imageUrl:String(item.imageUrl||'')
  })));
}

function cutoffState(asOf,calendar={}){
  const holidayDates=Object.freeze((calendar.holidays||[]).map(item=>String(item?.date||item||'')).filter(Boolean));
  const holidayReady=Boolean(calendar.ready);
  return Object.freeze({
    ...businessCalendar.calculateCutoffSchedule({asOf,holidayDates,holidayReady}),
    holidayDates,holidayReady
  });
}

function compactOrders(orders=[]){
  const surfaced=orders.filter(order=>orderStageIds(order).length);
  const selected=[];
  const seen=new Set();
  for(const stageId of ['ACTIVE','EPOST','REGISTER','IN_TRANSIT','COMPLETED']){
    for(const order of surfaced.filter(item=>orderStageIds(item).includes(stageId)).slice(0,60)){
      const key=String(order.hubOrderId||order.externalOrderId||'');
      if(!key||seen.has(key))continue;
      seen.add(key);
      selected.push(order);
    }
  }
  return frozenRows(selected.slice(0,200).map(order=>({
    hubOrderId:String(order.hubOrderId||''),
    externalOrderId:String(order.externalOrderId||''),
    shipmentId:String(order.shipmentId||''),
    platform:String(order.platform||'').toUpperCase(),
    channelLabel:String(order.channelLabel||channelLabel(order.platform)),
    stage:String(order.stage||''),
    stageLabel:stageLabel(order.stage),
    stageIds:Object.freeze(orderStageIds(order)),
    productName:String(order.productName||order.items?.[0]?.name||'상품 정보 확인 필요'),
    quantity:number(order.quantity),
    amount:number(order.amount),
    orderedAt:order.orderedAt||null,
    invoiceNumber:String(order.invoiceNumber||''),
    issuedInvoiceNumber:String(order.issuedInvoiceNumber||''),
    invoice:invoiceView(order),
    shippingEligible:Boolean(order.shippingEligible),
    shippingBlockedReason:String(order.shippingBlockedReason||''),
    selectionEligible:String(order.platform||'').toUpperCase()!=='NAVER'&&Boolean(order.shippingEligible)&&!order.cancelled,
    selectionBlockedReason:String(order.platform||'').toUpperCase()==='NAVER'
      ?'네이버에서 송장을 발급하므로 허브 출고 선택에서 제외합니다.'
      :String(order.shippingBlockedReason||''),
    cancellationRequested:Boolean(order.cancellationRequested),
    cancelled:Boolean(order.cancelled),
    fulfillment:String(order.fulfillment||'SELLER'),
    timingBadge:order.timingBadge?Object.freeze({type:String(order.timingBadge.type||''),label:String(order.timingBadge.label||''),detail:String(order.timingBadge.detail||'')}):null,
    receiver:safeReceiver(order.receiver||order.demoReceiver||{}),
    items:safeItems(order.items||[])
  })));
}

function buildPhase28OrdersModel(data={}){
  const center=data.unifiedOrders||{};
  const orders=Array.isArray(center.orders)?center.orders:[];
  const sellerOrders=orders.filter(item=>item.fulfillment!=='ROCKET_GROWTH');
  const active=sellerOrders.filter(item=>activeStage(item.stage)&&!invoiceReady(item.invoiceNumber)&&!item.cancelled);
  const epost=active.filter(item=>item.shippingEligible===true);
  const registered=sellerOrders.filter(item=>!item.cancelled&&invoiceReady(item.invoiceNumber)&&!['SHIPPING','DELIVERED'].includes(item.stage));
  const inTransit=sellerOrders.filter(item=>item.stage==='SHIPPING'||item.tracking?.statusCode==='IN_TRANSIT');
  const completed=sellerOrders.filter(item=>item.stage==='DELIVERED'||item.stage==='CANCELLED'||item.tracking?.statusCode==='DELIVERED');
  const delayed=active.filter(item=>item.timingBadge?.type==='DELAYED');
  const cancellationCount=number(center.summary?.cancellations);
  const asOf=data.generatedAt||center.summary?.refreshedAt||null;
  const compact=compactOrders(sellerOrders);

  const workspaces=frozenRows([
    {id:'ACTIVE',label:'송장 발급 전',count:active.length,status:'READY',description:'지금 포장·출고할 판매자배송'},
    {id:'EPOST',label:'우체국 발급',count:epost.length,status:'READY',description:'출고 가능한 선택 주문'},
    {id:'REGISTER',label:'배송대기중',count:registered.length,status:'READY',description:'송장 등록 후 접수 대기'},
    {id:'IN_TRANSIT',label:'배송중',count:inTransit.length,status:'READY',description:'우체국 이동 상태 확인'},
    {id:'COMPLETED',label:'최근 완료',count:completed.length,status:'READY',description:'최근 30일 완료·취소 이력'},
    {id:'RETRY',label:'재시도',count:null,status:'CHECK_REQUIRED',description:'현재 화면 실행 결과에서 집계'}
  ]);

  return Object.freeze({
    kind:'orders',
    hero:Object.freeze({
      asOf,
      workCount:active.length,
      delayedCount:delayed.length,
      cancellationCount,
      headline:active.length?`오늘 출고할 주문은 ${active.length.toLocaleString('ko-KR')}건이에요.`:'오늘 새로 출고할 주문은 없어요.',
      summary:delayed.length?`배송지연 ${delayed.length.toLocaleString('ko-KR')}건을 먼저 확인한 뒤 출고 순서대로 처리하세요.`:'판매자배송만 모아 송장 발급부터 배송 확인까지 이어서 처리합니다.'
    }),
    workspaces,
    orders:compact,
    totalOrders:orders.length,
    visibleLimit:20,
    channels:frozenRows((center.channels||[]).map(item=>({...item}))),
    priorities:frozenRows(active.slice(0,5).map(item=>({
      id:String(item.hubOrderId||item.externalOrderId||''),
      platform:String(item.platform||'ALL'),
      productName:String(item.productName||item.items?.[0]?.name||'상품 정보 확인 필요'),
      timingType:String(item.timingBadge?.type||'READY'),
      timingLabel:String(item.timingBadge?.label||'출고 준비'),
      cancellationRequested:Boolean(item.cancellationRequested)
    }))),
    window:Object.freeze({
      days:number(center.summary?.windowDays)||30,
      start:center.summary?.windowStart||null,
      end:center.summary?.windowEnd||null
    }),
    cutoff:cutoffState(asOf,data.shippingReferenceCenter?.calendar||{})
  });
}

module.exports={buildPhase28OrdersModel,invoiceView};
