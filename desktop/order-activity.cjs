'use strict';
// A bounded reading of the four existing list responses, never a historical sales total.
function projectOrderActivity(scopes,checkedAt){
 const unavailable={status:'UNAVAILABLE',days:[],checkedAt};
 const values=['ACTIVE','REGISTER','IN_TRANSIT','COMPLETED'].map(k=>scopes[k]);
 if(values.some(v=>!['READY','PARTIAL'].includes(v?.status)||!Array.isArray(v.orders)))return unavailable;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(checkedAt));
 const end=Date.parse(today+'T00:00:00Z'),days=Array.from({length:7},(_,i)=>({date:new Date(end-(6-i)*86400000).toISOString().slice(0,10),count:0}));
 const seen=new Set();
 for(const scope of values)for(const order of scope.orders){
  if(typeof order.hubOrderId!=='string'||!order.hubOrderId||typeof order.orderedAt!=='string'||!Number.isFinite(Date.parse(order.orderedAt)))return unavailable;
  if(seen.has(order.hubOrderId))continue;seen.add(order.hubOrderId);
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(order.orderedAt)),day=days.find(d=>d.date===date);if(day)day.count++;
 }
 return {status:values.every(v=>v.status==='READY'&&v.total===v.orders.length)?'READY':'PARTIAL',days,checkedAt};
}
module.exports={projectOrderActivity};
