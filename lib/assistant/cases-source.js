'use strict';
const {orderStageIds}=require('../ui/phase28-adapters/orders.js');
async function load({db,ordersReader=require('../orders/unified-orders.js').loadUnifiedOrders}){
 const observations=[];const sources=[];
 try{const center=await ordersReader({db,summaryRead:true});for(const platform of ['NAVER','CAFE24','COUPANG']){
  if(!center.channels.some(c=>c.platform===platform&&c.status==='READY')){sources.push(platform+':ORDER_UNAVAILABLE');continue;}
  for(const o of center.orders.filter(o=>o.platform===platform&&o.fulfillment!=='ROCKET_GROWTH')){
   if(!o.hubOrderId)continue;const stages=orderStageIds(o);
   if(stages.includes('ACTIVE'))observations.push({platform,kind:'ORDER',sourceId:o.hubOrderId,state:'PENDING'});
   else if(stages.some(s=>['REGISTER','IN_TRANSIT','COMPLETED'].includes(s)))observations.push({platform,kind:'ORDER',sourceId:o.hubOrderId,state:'RESOLVED'});
  }
 }}catch{sources.push('ORDERS_UNAVAILABLE');}
 for(const [table,cols,date] of [['customer_service_items','source_key,platform,kind,completed','occurred_at'],['coupang_inquiries','inquiry_key,inquiry_id,answered','inquired_at']]){
  try{const r=await db.from(table).select(cols).order(date,{ascending:false}).limit(1001);if(r.error||!Array.isArray(r.data))throw Error();
   if(r.data.length>1000)sources.push(table+':TRUNCATED');
   for(const row of r.data.slice(0,1000)){const cp=table==='coupang_inquiries',platform=cp?'COUPANG':row.platform,done=cp?row.answered:row.completed,sourceId=cp?String(row.inquiry_key||row.inquiry_id||''):row.source_key;if(!['NAVER','CAFE24','COUPANG'].includes(platform)||(!cp&&(row.kind!=='INQUIRY'||platform==='COUPANG'))||!sourceId)continue;
    // Unknown completion flags must not create a falsely certain observation.
    if(typeof done==='boolean')observations.push({platform,kind:'CS',sourceId,state:done?'RESOLVED':'PENDING'});
   }
  }catch{sources.push(table+':UNAVAILABLE');}
 }
 const seen=new Set();const clean=observations.filter(x=>{const k=JSON.stringify([x.platform,x.kind,x.sourceId]);if(seen.has(k))return false;seen.add(k);return true;});
 if(clean.length>3000)sources.push('OBSERVATIONS_TRUNCATED');return {observations:clean.slice(0,3000),sources,sourcePolicy:'STORED_DATA'};
}
module.exports={load};
