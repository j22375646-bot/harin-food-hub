'use strict';
const {mapLimit}=require('../async/map-limit.js');
const text=v=>v==null?'':String(v).trim();
function normalizeReceiver(payload={}){
 const rows=Array.isArray(payload.receivers)?payload.receivers:Array.isArray(payload.receiver)?payload.receiver:[payload.receiver||payload.receivers||{}];
 if(rows.length!==1)return null;const r=rows[0];
 return {name:text(r.name),contact:text(r.virtual_phone_no||r.cellphone||r.phone),postCode:text(r.zipcode||r.post_code),address:text(r.address_full||r.address1),addressDetail:text(r.address2),message:text(r.shipping_message)};
}
async function hydratePage(page,{read=async(id,signal)=>require('./client.js').adminGet(require('./config.js').getConfig(),'/orders/'+encodeURIComponent(id)+'/receivers',{}, {signal}),timeoutMs=6500}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let stop;
 const ended=new Promise((_,reject)=>{stop=()=>reject(Error('Receiver timeout'));controller.signal.addEventListener('abort',stop,{once:true});});ended.catch(()=>{});
 try{const orders=await mapLimit(page.orders,4,async order=>{
  if(order.platform!=='CAFE24'||order.fulfillment!=='SELLER'||order.shippingEligible!==true||!['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage))return order;
  try{controller.signal.throwIfAborted();if(!/^[A-Za-z0-9_-]{1,80}$/.test(order.externalOrderId))throw Error('Order identity');const response=await Promise.race([read(order.externalOrderId,controller.signal),ended]);controller.signal.throwIfAborted();const receiver=normalizeReceiver(response.payload||{});if(!receiver?.name||!receiver.address||!/^\d{5}$/.test(receiver.postCode)||!/^\d{9,12}$/.test(receiver.contact.replace(/[\s-]/g,'')))throw Error('Receiver incomplete');return {...order,receiver};}
  catch{return {...order,receiver:{},shippingEligible:false,selectionEligible:false,shippingBlockedReason:'카페24 수취인 정보를 확인하지 못했습니다. 주문 정보 새로고침 후 다시 확인하세요.'};}
 });return {...page,orders};}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);controller.abort();}
}
module.exports={normalizeReceiver,hydratePage};
