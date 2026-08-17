'use strict';

const crypto = require('node:crypto');

const text = value => value == null ? '' : String(value).trim();
const dateValue = value => { const parsed=new Date(value); return Number.isFinite(parsed.getTime())?parsed:null; };
const daysBetween = (left,right) => Math.max(0,Math.round((right-left)/86400000));
const median = values => { const rows=values.filter(Number.isFinite).filter(value=>value>0).sort((a,b)=>a-b); if(!rows.length)return null; const middle=Math.floor(rows.length/2); return rows.length%2?rows[middle]:Math.round((rows[middle-1]+rows[middle])/2); };

function paidOrder(order = {}) {
  const status=text(order.payment_status || order.raw_data?.payment_status).toUpperCase();
  const cancelled=Number(order.cancel_amount||0)>0 || Number(order.refund_amount||0)>0 || /CANCEL|REFUND/.test(status);
  return !cancelled && (!status || /PAID|PAYMENT|COMPLETE|PREPAR/.test(status));
}
function customerReference(customerId, secret) {
  return crypto.createHmac('sha256',String(secret||'')).update(`repurchase\0${customerId}`).digest('base64url').slice(0,32);
}
function buildCandidates({ orders=[], items=[], historyDays=0, asOf=new Date(), secret }={}) {
  if(Number(historyDays)<90 || !secret)return { ready:false, reason:Number(historyDays)<90?'최소 90일 주문 이력이 필요합니다.':'후보 해시 비밀키가 필요합니다.', candidates:[] };
  const itemMap=new Map();
  for(const item of items){const key=String(item.order_id||'');const rows=itemMap.get(key)||[];rows.push(item);itemMap.set(key,rows);}
  const customers=new Map();
  for(const order of orders.filter(paidOrder)){
    const customerId=text(order.customer_id), orderedAt=dateValue(order.order_date);
    if(!customerId||!orderedAt)continue;
    const rows=customers.get(customerId)||[];
    const products=itemMap.get(String(order.order_id||''))||[];
    rows.push({ orderId:String(order.order_id||''), orderedAt, productName:text(products[0]?.product_name)||'구매 상품', quantity:products.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity)||0),0)||1 });
    customers.set(customerId,rows);
  }
  const candidates=[];
  for(const [customerId,rows] of customers){
    rows.sort((a,b)=>a.orderedAt-b.orderedAt);
    if(rows.length<2)continue;
    const intervals=[];for(let i=1;i<rows.length;i+=1){const value=daysBetween(rows[i-1].orderedAt,rows[i].orderedAt);if(value>0&&value<=365)intervals.push(value);}
    if(intervals.length<1)continue;
    const cycle=median(intervals), since=daysBetween(rows.at(-1).orderedAt,dateValue(asOf)||new Date());
    const audience=since>Math.max(60,cycle*2)?'DORMANT':since>=Math.max(1,cycle-7)&&since<=cycle+14?'DUE':null;
    if(!audience)continue;
    const latest=rows.at(-1);
    candidates.push({ recipientRef:customerReference(customerId,secret), orderRef:latest.orderId, audience, cycleDays:cycle, daysSinceOrder:since, lastOrderDate:latest.orderedAt.toISOString().slice(0,10), productName:latest.productName, quantity:latest.quantity });
  }
  return { ready:true, reason:null, candidates:candidates.sort((a,b)=>b.daysSinceOrder-a.daysSinceOrder).slice(0,50) };
}

function messageText(body,optOutNumber){return `(광고) 하린식품\n${text(body)}\n무료수신거부 ${text(optOutNumber)||'[번호 설정 필요]'}`;}
function publicCandidate(candidate,receiver={}){return { ...candidate, recipientName:maskName(receiver.name), recipientPhone:require('../messaging/solapi.js').maskPhone(receiver.phone), consentStatus:'OWNER_CONFIRMATION_REQUIRED' };}
function maskName(value){const name=text(value);if(!name)return '이름 확인 필요';if(name.length===1)return '*';return `${name[0]}${'*'.repeat(Math.max(1,name.length-2))}${name.length>2?name.at(-1):''}`;}

module.exports={ buildCandidates, customerReference, maskName, messageText, paidOrder, publicCandidate };
