'use strict';

const DAY_MS=24*60*60*1000;
const LOT_STATUSES=new Set(['ACTIVE','USED','DISCARDED']);

function text(value,max=200){return String(value??'').trim().slice(0,max);}
function dateOnly(value){
  const normalized=text(value,10);
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(normalized))return null;
  const parsed=new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===normalized?normalized:null;
}
function todayKey(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function daysUntil(expiresOn,now=new Date()){
  const expiry=dateOnly(expiresOn),today=todayKey(now);
  if(!expiry)return null;
  return Math.round((Date.parse(`${expiry}T00:00:00.000Z`)-Date.parse(`${today}T00:00:00.000Z`))/DAY_MS);
}
function expiryMeta(expiresOn,now=new Date()){
  const days=daysUntil(expiresOn,now);
  if(days==null)return {code:'UNKNOWN',label:'날짜 확인 필요',tone:'info',days:null,priority:1};
  if(days<0)return {code:'EXPIRED',label:`${Math.abs(days)}일 지남`,tone:'danger',days,priority:4};
  if(days<=30)return {code:'URGENT',label:days===0?'오늘 만료':`${days}일 남음`,tone:'danger',days,priority:3};
  if(days<=90)return {code:'WARNING',label:`${days}일 남음`,tone:'warn',days,priority:2};
  return {code:'HEALTHY',label:`${days}일 남음`,tone:'good',days,priority:0};
}
function normalizeStatus(value){const status=text(value,20).toUpperCase();return LOT_STATUSES.has(status)?status:'ACTIVE';}
function normalizeLotInput(input={}){
  const vendorItemId=text(input.vendor_item_id,80),lotCode=text(input.lot_code,80),expiresOn=dateOnly(input.expires_on);
  const quantity=Number(input.quantity);
  if(!vendorItemId)throw Object.assign(new Error('로켓그로스 상품을 선택해주세요.'),{status:400,code:'VENDOR_ITEM_REQUIRED'});
  if(!lotCode)throw Object.assign(new Error('LOT 번호를 입력해주세요.'),{status:400,code:'LOT_CODE_REQUIRED'});
  if(!expiresOn)throw Object.assign(new Error('유통기한을 날짜 형식으로 입력해주세요.'),{status:400,code:'EXPIRY_REQUIRED'});
  if(!Number.isInteger(quantity)||quantity<0||quantity>1000000)throw Object.assign(new Error('입고 수량은 0개 이상 정수로 입력해주세요.'),{status:400,code:'INVALID_QUANTITY'});
  const receivedOn=input.received_on?dateOnly(input.received_on):null;
  const manufacturedOn=input.manufactured_on?dateOnly(input.manufactured_on):null;
  if(input.received_on&&!receivedOn)throw Object.assign(new Error('입고일을 확인해주세요.'),{status:400,code:'INVALID_RECEIVED_ON'});
  if(input.manufactured_on&&!manufacturedOn)throw Object.assign(new Error('제조일을 확인해주세요.'),{status:400,code:'INVALID_MANUFACTURED_ON'});
  if(manufacturedOn&&manufacturedOn>expiresOn)throw Object.assign(new Error('제조일은 유통기한보다 늦을 수 없습니다.'),{status:400,code:'INVALID_DATE_ORDER'});
  return {platform:'COUPANG',vendor_item_id:vendorItemId,lot_code:lotCode,received_on:receivedOn,manufactured_on:manufacturedOn,expires_on:expiresOn,quantity,status:normalizeStatus(input.status),notes:text(input.notes,500)||null};
}
function decorateLot(lot,now=new Date()){return {...lot,expiry:expiryMeta(lot?.expires_on,now)};}
function summarizeLots(lots=[],inventory=[],now=new Date()){
  const active=lots.filter(lot=>normalizeStatus(lot.status)==='ACTIVE').map(lot=>decorateLot(lot,now)).sort((a,b)=>(a.expiry.days??999999)-(b.expiry.days??999999));
  const registered=new Set(active.map(lot=>String(lot.vendor_item_id)));
  return {
    active,
    expired:active.filter(lot=>lot.expiry.code==='EXPIRED'),
    urgent:active.filter(lot=>['EXPIRED','URGENT'].includes(lot.expiry.code)),
    warning:active.filter(lot=>lot.expiry.code==='WARNING'),
    unregistered:(inventory||[]).filter(item=>!registered.has(String(item.vendor_item_id))),
    activeQuantity:active.reduce((sum,lot)=>sum+Number(lot.quantity||0),0)
  };
}

module.exports={LOT_STATUSES,dateOnly,daysUntil,expiryMeta,normalizeLotInput,normalizeStatus,summarizeLots,todayKey};
