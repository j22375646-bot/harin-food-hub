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

module.exports={fetchCafe24Receiver,hasReceiverDetails,hydrateCafe24OrderReceivers};
