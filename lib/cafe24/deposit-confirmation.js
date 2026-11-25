'use strict';

const {cafe24Payment}=require('./order-payment.js');
const {isCafe24StorefrontOrder}=require('./order-origin.js');
const map=require('./mappers.js');

function depositState(order, orderId) {
  if(order?.order_id!==orderId||!isCafe24StorefrontOrder(order)||order.currency!=='KRW')return {status:'UNAVAILABLE'};
  if(!Array.isArray(order.payment_method)||order.payment_method.length!==1||order.payment_method[0]!=='cash')return {status:'INELIGIBLE'};
  const itemStatuses=Array.isArray(order.items)?order.items.map(item=>item.order_status):[];
  if(order.canceled!=='F'||order.cancel_date||order.cancel_request==='T'||order.return_request==='T'||order.exchange_request==='T'
    ||!itemStatuses.length||itemStatuses.some(status=>typeof status!=='string'||!/^N\d{2}$/.test(status)))return {status:'INELIGIBLE'};
  const {paymentState}=cafe24Payment(order,itemStatuses);
  if(paymentState==='PAID'&&order.paid==='T')return {status:'PAID'};
  const due=order.actual_order_amount?.total_amount_due;
  const amount=/^\d+(?:\.0+)?$/.test(String(due??''))?Number(due):0;
  if(order.paid!=='F'||paymentState!=='UNPAID'||!itemStatuses.every(status=>status==='N00')||!Number.isSafeInteger(amount)||amount<=0)return {status:'INELIGIBLE'};
  return {status:'READY',orderId,amount};
}

async function confirmDeposit({orderId, amount, actorId, read, reserve, reauthorize, write, save, signal}) {
  const before=await read(orderId);
  const preview=depositState(before,orderId);
  if(preview.status==='PAID'){
    await reauthorize();
    await save(before);
    return {status:'PAID'};
  }
  if(preview.status!=='READY')return preview;
  if(preview.amount!==amount)return {status:'AMOUNT_CHANGED'};
  await reauthorize();
  signal?.throwIfAborted();
  if(!await reserve({orderId,amount,actorId}))return {status:'CHECK_REQUIRED'};
  if(!signal?.aborted)try{await write(orderId);}catch{/* A response can be lost after the payment changed. Only read the result. */}
  try{
    const after=await read(orderId);
    if(depositState(after,orderId).status!=='PAID')return {status:'CHECK_REQUIRED'};
    await save(after);
    return {status:'PAID'};
  }catch{return {status:'CHECK_REQUIRED'};}
}

function depositStorage(db) {
  async function reserve({orderId,amount,actorId}){
    const result=await db.from('cafe24_deposit_confirmations').upsert(
      {order_id:orderId,amount_krw:amount,actor_id:actorId},
      {onConflict:'order_id',ignoreDuplicates:true}
    ).select('order_id').maybeSingle();
    if(result.error)throw result.error;
    return Boolean(result.data);
  }
  async function save(order) {
    const {items,...details}=order;
    const orderResult=await db.from('cafe24_orders').upsert(map.order(details),{onConflict:'order_id'});
    if(orderResult.error)throw orderResult.error;
    const itemResult=await db.from('cafe24_order_items').upsert(
      items.map((item,index)=>map.item(order.order_id,item,index)),{onConflict:'order_id,external_item_id'}
    );
    if(itemResult.error)throw itemResult.error;
    const audit=await db.from('cafe24_deposit_confirmations').update({confirmed_at:new Date().toISOString()})
      .eq('order_id',order.order_id).is('confirmed_at',null);
    if(audit.error)throw audit.error;
  }
  return {reserve,save};
}

module.exports={depositState,confirmDeposit,depositStorage};
