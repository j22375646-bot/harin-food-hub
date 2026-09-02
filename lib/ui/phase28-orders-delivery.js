'use strict';

const text=value=>value==null?'':String(value).trim();
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const RECEIVER_CONCURRENCY=4;
const RECEIVER_RETRY_DELAYS=[350,1200];

function hasReceiverDetails(receiver={}){
  receiver=receiver||{};
  return Boolean(text(receiver.name)&&text(receiver.contact)&&text(receiver.address));
}

function needsReceiverHydration(order={}){
  const platform=String(order.platform||'').toUpperCase();
  const identifier=platform==='CAFE24'?order.externalOrderId:order.shipmentId;
  return ['CAFE24','COUPANG'].includes(platform)
    && text(identifier)
    && !hasReceiverDetails(order.receiver);
}

function receiverHydrationCandidates(orders=[],stageId=''){
  return orders.filter(order=>(!stageId||order.stageIds?.includes(stageId))&&needsReceiverHydration(order));
}

async function retryReceiver(task,waitImpl=wait){
  let lastError;
  for(let attempt=0;attempt<=RECEIVER_RETRY_DELAYS.length;attempt+=1){
    try{return await task();}
    catch(error){
      lastError=error;
      if(attempt<RECEIVER_RETRY_DELAYS.length)await waitImpl(RECEIVER_RETRY_DELAYS[attempt]);
    }
  }
  throw lastError;
}

async function mapWithConcurrency(items,worker,limit=RECEIVER_CONCURRENCY){
  const results=new Array(items.length);
  let cursor=0;
  async function run(){
    while(cursor<items.length){
      const index=cursor;
      cursor+=1;
      results[index]=await worker(items[index],index);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return results;
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

async function hydrateCafe24OrderReceivers(orders=[],fetchImpl=fetch,waitImpl=wait){
  const candidates=orders.filter(order=>
    String(order.platform||'').toUpperCase()==='CAFE24'
    && text(order.externalOrderId)
    && !hasReceiverDetails(order.receiver)
  );
  if(!candidates.length)return orders;
  const settled=await mapWithConcurrency(candidates,async order=>{
    try{return [order.hubOrderId,await retryReceiver(()=>fetchCafe24Receiver(order.externalOrderId,fetchImpl),waitImpl)];}
    catch{return [order.hubOrderId,null];}
  });
  const receiverByOrder=new Map(settled.filter(([,receiver])=>hasReceiverDetails(receiver)));
  if(!receiverByOrder.size)return orders;
  return orders.map(order=>receiverByOrder.has(order.hubOrderId)?{...order,receiver:receiverByOrder.get(order.hubOrderId)}:order);
}

async function hydrateOrderReceivers(orders=[],fetchImpl=fetch,waitImpl){
  const sleeper=waitImpl||wait;
  const candidates=orders.filter(needsReceiverHydration);
  if(!candidates.length)return orders;
  const settled=await mapWithConcurrency(candidates,async order=>{
    try{
      const receiver=await retryReceiver(()=>String(order.platform||'').toUpperCase()==='COUPANG'
        ?fetchCoupangReceiver(order.shipmentId,fetchImpl,sleeper)
        :fetchCafe24Receiver(order.externalOrderId,fetchImpl),sleeper);
      return [order.hubOrderId,receiver];
    }catch{return [order.hubOrderId,null];}
  });
  const receiverByOrder=new Map(settled.filter(([,receiver])=>hasReceiverDetails(receiver)));
  if(!receiverByOrder.size)return orders;
  return orders.map(order=>receiverByOrder.has(order.hubOrderId)?{...order,receiver:receiverByOrder.get(order.hubOrderId)}:order);
}

module.exports={fetchCafe24Receiver,fetchCoupangReceiver,hasReceiverDetails,hydrateCafe24OrderReceivers,hydrateOrderReceivers,needsReceiverHydration,normalizeCoupangReceiver,receiverHydrationCandidates};
