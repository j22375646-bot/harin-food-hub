'use strict';

const operationQueue=require('../coupang/operation-queue.js');

const OPERATION='EPOST_TRACKING';
const text=value=>value==null?'':String(value).trim();
const validTracking=value=>/^\d{13}$/.test(text(value));

function publicState(row,result,payload,hubOrderId) {
  const tracking=result?.epostTracking||null;
  const status=['PENDING','RUNNING'].includes(row.status)?'QUEUED':row.status;
  return {
    hubOrderId,
    trackingNo:text(payload.trackingNo||row.target_id),
    platform:text(payload.platform),
    status,
    statusCode:tracking?.statusCode||'',
    statusLabel:tracking?.statusLabel||(status==='FAILED'?'추적 실패':status==='QUEUED'?'확인 대기':'확인 전'),
    latestEvent:tracking?.latestEvent||null,
    events:Array.isArray(tracking?.events)?tracking.events:[],
    deliveredAt:tracking?.deliveredAt||null,
    checkedAt:tracking?.checkedAt||row.executed_at||null,
    error:row.status==='FAILED'?text(row.error_message)||'우체국 배송상태를 확인하지 못했습니다.':'',
    requestId:row.id
  };
}

function trackingStatesFromRows(rows=[]) {
  const latest={};
  for(const row of rows) {
    if(row.operation_type!==OPERATION)continue;
    let payload={};let result={};
    try{payload=operationQueue.open(row.payload);}catch{continue;}
    if(row.status==='SUCCESS'){try{result=operationQueue.open(row.result_json);}catch{}}
    const ids=Array.isArray(payload.hubOrderIds)?payload.hubOrderIds:[payload.hubOrderId];
    for(const hubOrderId of ids.map(text).filter(Boolean)) {
      if(!latest[hubOrderId])latest[hubOrderId]=publicState(row,result,payload,hubOrderId);
    }
  }
  return latest;
}

async function latestTrackingByOrder(db) {
  const query=await db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,status,payload,result_json,error_message,created_at,executed_at')
    .eq('operation_type',OPERATION).order('created_at',{ascending:false}).limit(1000);
  if(query.error)throw query.error;
  return trackingStatesFromRows(query.data||[]);
}

function bucketKey(kind='hourly',at=new Date()) {
  const iso=new Date(at).toISOString();
  return kind==='manual'?iso.slice(0,16):iso.slice(0,13);
}

async function queueTrackingForOrders(db,orders=[],{kind='hourly',at=new Date(),limit=100}={}) {
  const groups=new Map();
  for(const order of orders) {
    const trackingNo=text(order.invoiceNumber);
    if(!validTracking(trackingNo)||order.fulfillment==='ROCKET_GROWTH')continue;
    const current=groups.get(trackingNo)||{trackingNo,hubOrderIds:[],platforms:new Set()};
    current.hubOrderIds.push(order.hubOrderId);current.platforms.add(order.platform);groups.set(trackingNo,current);
    if(groups.size>=limit)break;
  }
  const results=[];
  for(const group of groups.values()) {
    const payload={trackingNo:group.trackingNo,hubOrderIds:group.hubOrderIds,platform:[...group.platforms].join(',')};
    const queued=await operationQueue.queueOperation(db,{
      operationType:OPERATION,targetType:'TRACKING',targetId:group.trackingNo,payload,
      idempotencyKey:`epost:tracking:${group.trackingNo}:${bucketKey(kind,at)}`
    });
    results.push({trackingNo:group.trackingNo,hubOrderIds:group.hubOrderIds,status:queued.completed?'SUCCESS':queued.request?.status||'PENDING',requestId:queued.request?.id||null,reused:Boolean(queued.existing)});
  }
  return results;
}

module.exports={OPERATION,bucketKey,latestTrackingByOrder,trackingStatesFromRows,queueTrackingForOrders,validTracking};
