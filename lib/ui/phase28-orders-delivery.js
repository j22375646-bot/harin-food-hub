'use strict';

const text=value=>value==null?'':String(value).trim();

function hasReceiverDetails(receiver={}){
  return Boolean(text(receiver.name)&&text(receiver.contact)&&text(receiver.address));
}

async function fetchCafe24Receiver(orderId,fetchImpl=fetch){
  const response=await fetchImpl(`/api/cafe24/orders/delivery-detail?orderId=${encodeURIComponent(text(orderId))}`,{cache:'no-store'});
  const payload=await response.json();
  if(!response.ok||!payload.ok)throw new Error(payload.error||'Cafe24 배송정보를 불러오지 못했습니다.');
  return payload.receiver||{};
}

function normalizeCoupangReceiver(receiver={}){
  return {
    name:text(receiver.name),
    contact:text(receiver.safeNumber||receiver.contact),
    postCode:text(receiver.postCode),
    address:text(receiver.address),
    addressDetail:text(receiver.addressDetail),
    message:text(receiver.message)
  };
}

async function fetchCoupangReceiver(shipmentBoxId,fetchImpl=fetch,waitImpl=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))){
  const queuedResponse=await fetchImpl(`/api/coupang/orders/detail?shipmentBoxId=${encodeURIComponent(text(shipmentBoxId))}`,{cache:'no-store'});
  const queued=await queuedResponse.json();
  if(!queuedResponse.ok||!queued.ok)throw new Error(queued.error||'쿠팡 주문 상세조회를 시작하지 못했습니다.');
  const requestId=text(queued.request?.id);
  if(!requestId)throw new Error('쿠팡 주문 상세조회 작업번호가 없습니다.');
  for(let attempt=0;attempt<25;attempt+=1){
    if(attempt)await waitImpl(800);
    const response=await fetchImpl(`/api/coupang/operations/${encodeURIComponent(requestId)}`,{cache:'no-store'});
    const payload=await response.json();
    if(response.status===202||payload.pending)continue;
    if(!response.ok||!payload.ok)throw new Error(payload.error||'쿠팡 주문 상세정보를 불러오지 못했습니다.');
    const receiver=normalizeCoupangReceiver(payload.order?.receiver||{});
    if(!hasReceiverDetails(receiver))throw new Error('쿠팡 주문의 수취정보를 확인하지 못했습니다.');
    return receiver;
  }
  throw new Error('쿠팡 주문 상세조회 응답이 늦습니다. 잠시 뒤 다시 확인해주세요.');
}

async function hydrateCafe24OrderReceivers(orders=[],fetchImpl=fetch){
  const candidates=orders.filter(order=>
    String(order.platform||'').toUpperCase()==='CAFE24'
    && order.selectionEligible===true
    && text(order.externalOrderId)
    && !hasReceiverDetails(order.receiver)
  ).slice(0,20);
  if(!candidates.length)return orders;
  const settled=await Promise.all(candidates.map(async order=>{
    try{return [order.hubOrderId,await fetchCafe24Receiver(order.externalOrderId,fetchImpl)];}
    catch{return [order.hubOrderId,null];}
  }));
  const receiverByOrder=new Map(settled.filter(([,receiver])=>hasReceiverDetails(receiver)));
  if(!receiverByOrder.size)return orders;
  return orders.map(order=>receiverByOrder.has(order.hubOrderId)?{...order,receiver:receiverByOrder.get(order.hubOrderId)}:order);
}

async function hydrateOrderReceivers(orders=[],fetchImpl=fetch,waitImpl){
  const candidates=orders.filter(order=>{
    const platform=String(order.platform||'').toUpperCase();
    const identifier=platform==='CAFE24'?order.externalOrderId:order.shipmentId;
    return ['CAFE24','COUPANG'].includes(platform)
      && order.selectionEligible===true
      && text(identifier)
      && !hasReceiverDetails(order.receiver);
  }).slice(0,20);
  if(!candidates.length)return orders;
  const settled=await Promise.all(candidates.map(async order=>{
    try{
      const receiver=String(order.platform||'').toUpperCase()==='COUPANG'
        ?await fetchCoupangReceiver(order.shipmentId,fetchImpl,waitImpl)
        :await fetchCafe24Receiver(order.externalOrderId,fetchImpl);
      return [order.hubOrderId,receiver];
    }catch{return [order.hubOrderId,null];}
  }));
  const receiverByOrder=new Map(settled.filter(([,receiver])=>hasReceiverDetails(receiver)));
  if(!receiverByOrder.size)return orders;
  return orders.map(order=>receiverByOrder.has(order.hubOrderId)?{...order,receiver:receiverByOrder.get(order.hubOrderId)}:order);
}

module.exports={fetchCafe24Receiver,fetchCoupangReceiver,hasReceiverDetails,hydrateCafe24OrderReceivers,hydrateOrderReceivers,normalizeCoupangReceiver};
