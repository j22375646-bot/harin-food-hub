'use strict';
const TENANT='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const BASE='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/'+TENANT+'/shipping-progress';
const ID=/^HR-(?:C24|CP)-[A-F0-9]{8}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function encodeTargets(targets){
 if(!Array.isArray(targets)||targets.length<1||targets.length>20)throw Error('Targets');
 const seen=new Set();return targets.map(row=>{
  if(!row||typeof row.hubOrderId!=='string'||!ID.test(row.hubOrderId)||seen.has(row.hubOrderId))throw Error('Target');seen.add(row.hubOrderId);
  const cp=row.hubOrderId.startsWith('HR-CP-');
  if(Object.keys(row).length!==(cp?2:1)||cp&&(typeof row.shipmentId!=='string'||!/^\d{1,30}$/.test(row.shipmentId)))throw Error('Identity');
  return row.hubOrderId+(cp?':'+row.shipmentId:'');
 }).join(',');
}
function parseTargets(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Targets');
 const rows=value.split(',').map(v=>{const parts=v.split(':');if(parts.length>2)throw Error('Target');return {hubOrderId:parts[0],...(parts.length===2?{shipmentId:parts[1]}:{})};});
 if(encodeTargets(rows)!==value)throw Error('Canonical');return rows;
}
function date(value,nullable=false){if(nullable&&value===null)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Date');return new Date(value).toISOString();}
function projectFeed(value,targets){
 encodeTargets(targets);
 if(value?.ok!==true||value.contract!==1||value.tenantId!==TENANT||value.partial!==false||typeof value.scopeKey!=='string'||!/^([a-f0-9]{64})$/.test(value.scopeKey)||!Array.isArray(value.items)||value.items.length!==targets.length)throw Error('Feed');
 const expected=new Map(targets.map(t=>[t.hubOrderId,t])),seen=new Set();
 const items=value.items.map(row=>{
  if(!row||!expected.has(row.hubOrderId)||seen.has(row.hubOrderId)||row.platform!==(row.hubOrderId.startsWith('HR-CP-')?'COUPANG':'CAFE24'))throw Error('Order');seen.add(row.hubOrderId);
  if(!['QUEUE','PREPARE','ISSUE','REGISTER'].includes(row.phase)||!['UNKNOWN','PENDING','RUNNING','SUCCESS','REGISTERED','FAILED','CANCELLED'].includes(row.status))throw Error('State');
  if((row.phase==='QUEUE')!==(row.status==='UNKNOWN')||row.status==='REGISTERED'&&row.phase!=='REGISTER'||row.status==='SUCCESS'&&row.phase==='REGISTER')throw Error('Phase');
  if(row.status==='UNKNOWN'?(row.requestId!==null||row.createdAt!==null||row.updatedAt!==null||row.nextAttemptAt!==null):typeof row.requestId!=='string'||!UUID.test(row.requestId)||row.createdAt===null||row.updatedAt===null)throw Error('Request');
  return {hubOrderId:row.hubOrderId,platform:row.platform,phase:row.phase,status:row.status,requestId:row.requestId,createdAt:date(row.createdAt,true),updatedAt:date(row.updatedAt,true),nextAttemptAt:date(row.nextAttemptAt,true)};
 });
 return {contract:1,tenantId:TENANT,scopeKey:value.scopeKey,checkedAt:date(value.checkedAt),partial:false,items};
}
module.exports={TENANT,BASE,ID,encodeTargets,parseTargets,projectFeed};
