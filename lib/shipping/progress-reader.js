'use strict';
const {hubOrderId}=require('../orders/unified-orders.js');
const {encodeTargets}=require('../../desktop/shipping-progress-contract.cjs');
const OPERATIONS=['EPOST_LIVE_ISSUE','CAFE24_UPLOAD_INVOICE','UPLOAD_INVOICE','ACKNOWLEDGE'];
const columns='id,operation_type,target_type,target_id,status,created_at,started_at,executed_at,next_attempt_at';
function createShippingProgressReader({db}={}){
 if(!db||typeof db.from!=='function')throw TypeError('Database required');
 return async(targets,{signal}={})=>{
  encodeTargets(targets);const cp=targets.filter(t=>t.shipmentId),ids=targets.map(t=>t.hubOrderId),byShipment=new Map();
  const check=()=>{if(signal?.aborted)throw Error('Stopped');};
  check();
  if(cp.length){
   let query=db.from('coupang_orders').select('shipment_box_id,order_id').in('shipment_box_id',cp.map(t=>t.shipmentId)).limit(21);if(signal)query=query.abortSignal(signal);
   const r=await query;check();if(r.error||!Array.isArray(r.data)||r.data.length!==cp.length)throw Error('Identity unavailable');
   for(const row of r.data){const shipmentId=String(row.shipment_box_id),target=cp.find(t=>t.shipmentId===shipmentId);if(!target||byShipment.has(shipmentId)||hubOrderId('COUPANG',String(row.order_id),shipmentId)!==target.hubOrderId)throw Error('Identity mismatch');byShipment.set(shipmentId,target.hubOrderId);}
  }
  let query=db.from('coupang_operation_requests').select(columns).in('target_type',['HUB_ORDER','ORDER']).in('target_id',[...ids,...byShipment.keys()]).in('operation_type',OPERATIONS).order('created_at',{ascending:false}).limit(2001);if(signal)query=query.abortSignal(signal);
  const result=await query;check();if(result.error||!Array.isArray(result.data)||result.data.length>2000)throw Error('Incomplete operation read');
  const latest=new Map(),priority={PREPARE:1,ISSUE:2,REGISTER:3};
  for(const row of result.data){
   let id,phase;
   if(row.operation_type==='EPOST_LIVE_ISSUE'&&row.target_type==='HUB_ORDER'){id=row.target_id;phase='ISSUE';}
   else if(row.operation_type==='CAFE24_UPLOAD_INVOICE'&&row.target_type==='HUB_ORDER'){id=row.target_id;phase='REGISTER';}
   else if(['UPLOAD_INVOICE','ACKNOWLEDGE'].includes(row.operation_type)&&row.target_type==='ORDER'){id=byShipment.get(String(row.target_id));phase=row.operation_type==='UPLOAD_INVOICE'?'REGISTER':'PREPARE';}
   if(!ids.includes(id)||phase==='REGISTER'&&row.operation_type==='CAFE24_UPLOAD_INVOICE'&&!id.startsWith('HR-C24-'))continue;
   const previous=latest.get(id),created=Date.parse(row.created_at);if(!Number.isFinite(created))throw Error('Operation time');
   if(!previous||created>previous.created||created===previous.created&&priority[phase]>priority[previous.phase])latest.set(id,{row,phase,created});
  }
  return targets.map(target=>{
   const base={hubOrderId:target.hubOrderId,platform:target.hubOrderId.startsWith('HR-CP-')?'COUPANG':'CAFE24'},selected=latest.get(target.hubOrderId);
   if(!selected)return {...base,phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null};
   const {row,phase}=selected,status={PENDING:'PENDING',RUNNING:'RUNNING',EXECUTING:'RUNNING',SUCCESS:phase==='REGISTER'?'REGISTERED':'SUCCESS',FAILED:'FAILED',CANCELLED:'CANCELLED'}[row.status];if(!status)throw Error('Operation status');
   return {...base,phase,status,requestId:row.id,createdAt:row.created_at,updatedAt:row.executed_at||row.started_at||row.created_at,nextAttemptAt:row.next_attempt_at||null};
  });
 };
}
module.exports={createShippingProgressReader};
