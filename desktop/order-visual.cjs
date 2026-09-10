'use strict';
// Public product CDN images only; never allow arbitrary customer-supplied hosts.
function safeImage(value){
 if(typeof value!=='string'||value.length>2048)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return '';
  const host=url.hostname;
  if(host==='harinfood.com')return /^\/web\/product\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)?url.href:'';
  if(!['shop-phinf.pstatic.net','shopping-phinf.pstatic.net','thumbnail.coupangcdn.com','image.coupangcdn.com'].includes(host)&&
     !/^image[0-9]+\.coupangcdn\.com$/.test(host)&&host!=='ecimg.cafe24img.com'&&
     !/^[a-z0-9-]+\.cafe24img\.com$/.test(host)&&host!=='ecimg.cafe24.com')return '';
  return url.href;
 }catch{return '';}
}
function projectVisual(order){
 const imageUrl=(Array.isArray(order?.items)?order.items:[]).slice(0,8).map(item=>safeImage(item?.imageUrl)).find(Boolean)||'';
 const gifts=order?.giftRequired===true&&Array.isArray(order.gifts)?order.gifts.slice(0,8)
  .filter(gift=>typeof gift?.giftName==='string'&&gift.giftName.trim()&&Number.isSafeInteger(gift.quantity)&&gift.quantity>0&&gift.quantity<=999)
  .map(gift=>Object.freeze({name:gift.giftName.trim().slice(0,120),quantity:gift.quantity})):[];
 const timing=projectTiming(order);
 return imageUrl||gifts.length||timing?Object.freeze({imageUrl,gifts:Object.freeze(gifts),...(timing?{timing}:{})}):undefined;
}
function isImageRequest(details){return details?.resourceType==='image'&&Boolean(safeImage(details.url));}
module.exports={safeImage,projectVisual,isImageRequest};

function projectTiming(order){
 if(!['PAID','PREPARING','READY_TO_SHIP','WAITING_FOR_CARRIER'].includes(order?.stage))return null;
 const estimate=order.shippingEstimate;const source=order.timingBadge||(order.stage==='WAITING_FOR_CARRIER'&&estimate?.status==='OVERDUE'?{type:'DELAYED',detail:'배송 출발 확인 전 · 예정 출고일 '+estimate.plannedShipDate}:null);
 if(!source||!['DELAYED','SAME_DAY','SAME_DAY_PARTIAL','CHECK_REQUIRED','SCHEDULED'].includes(source.type))return null;
 const known=estimate?.confidence==='READY',day=estimate?.plannedShipDate;
 let type=source.type,label;
 if(type==='DELAYED'){const parsed=new Date(order.orderedAt);const local=Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).format(parsed):'';const cutoffConflict=local&&local.slice(0,10)===day&&Number(local.slice(-2))>=15;if(!known||cutoffConflict){type='CHECK_REQUIRED';label=known?'출고 기준 확인':'출고 지연 확인';}else label='배송지연';}
 else if(type==='SAME_DAY'||type==='SAME_DAY_PARTIAL'){
  const date=new Date(order.orderedAt);const parts=Number.isFinite(date.getTime())?Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value])):null;
  const before=parts&&Number(parts.hour)<15,orderedDay=parts?parts.year+'-'+parts.month+'-'+parts.day:null;
  label=before&&day===orderedDay?(known?'당일출고':'당일출고 예정'):'오늘 출고 예정';if(!parts||day===orderedDay&&!before){type='CHECK_REQUIRED';label='출고 기준 확인';}
 }else label=({SAME_DAY_PARTIAL:'당일출고 예정',CHECK_REQUIRED:estimate?.status==='OVERDUE'?'출고 지연 확인':'출고 기준 확인',SCHEDULED:'배송출발 예정'})[type];
 return Object.freeze({type,label,detail:(typeof source.detail==='string'?source.detail.slice(0,240):'출고 기준 확인 필요')+' · 당일배송은 15시 이전 주문의 당일 배송 출발 기준입니다. 송장 등록만으로 출발을 확정하지 않습니다.'});
}
