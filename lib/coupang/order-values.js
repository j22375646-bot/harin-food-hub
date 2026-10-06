'use strict';
const queue=require('./operation-queue.js');
function money(value){
 if(value===null||value===undefined||value===''||typeof value==='boolean')return null;
 if(typeof value==='object'){if(value.currencyCode&&value.currencyCode!=='KRW'||value.units===undefined)return null;value=Number(value.units)+Number(value.nanos||0)/1e9;}
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function lineAmounts(item={}){
 const quantity=money(item.shippingCount??item.quantity??1);
 const total=money(item.orderPrice),unit=money(item.salesPrice??item.unitPrice);
 return {quantity,unitPrice:unit??(total!==null&&quantity>0?total/quantity:null),total:total??(unit!==null&&quantity!==null?unit*quantity:null)};
}
function orderAmount(raw={}){const items=raw.orderItems??raw.items;if(!Array.isArray(items)||!items.length)return null;const totals=items.map(i=>lineAmounts(i).total);return totals.some(t=>t===null)?null:totals.reduce((a,b)=>a+b,0);}
function protectedReceiver(raw={}){
 const r=raw.receiver||{};const receiver={name:r.name||'',contact:r.safeNumber||r.receiverNumber||r.contact||'',address:r.addr1||r.address||'',addressDetail:r.addr2||r.addressDetail||'',postCode:r.postCode||'',message:r.deliveryMessage||r.message||''};
 if(!receiver.name||!receiver.contact||!receiver.address||!process.env.SUPABASE_SERVICE_ROLE_KEY)return null;
 return queue.seal(receiver);
}
function storedReceiver(raw={}){try{return raw.moaonReceiver?queue.open(raw.moaonReceiver):null;}catch{return null;}}
module.exports={money,lineAmounts,orderAmount,protectedReceiver,storedReceiver};
