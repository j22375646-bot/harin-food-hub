'use strict';

const operationQueue=require('../coupang/operation-queue.js');

const OPERATION='EPOST_TRACKING';
const ORDER_DETAIL_OPERATION='ORDER_DETAIL';
const TRANSFER_OPERATIONS=['UPLOAD_INVOICE','CAFE24_UPLOAD_INVOICE'];
const ISSUE_OPERATION='EPOST_LIVE_ISSUE';
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

async function latestTrackingRows(db,{metadataLimit=1000,batchSize=100}={}) {
  const metadata=await db.from('coupang_operation_requests')
    .select('id,target_id,created_at')
    .eq('operation_type',OPERATION).order('created_at',{ascending:false}).limit(metadataLimit);
  if(metadata.error)throw metadata.error;
  const latestIds=[];
  const seenTargets=new Set();
  for(const row of metadata.data||[]){
    const targetId=text(row.target_id);
    if(!row.id||!targetId||seenTargets.has(targetId))continue;
    seenTargets.add(targetId);
    latestIds.push(row.id);
  }
  if(!latestIds.length)return [];
  const chunks=[];
  for(let index=0;index<latestIds.length;index+=batchSize)chunks.push(latestIds.slice(index,index+batchSize));
  const results=await Promise.all(chunks.map(ids=>db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,status,payload,result_json,error_message,created_at,started_at,executed_at,next_attempt_at')
    .in('id',ids)));
  const byId=new Map();
  for(const result of results){
    if(result.error)throw result.error;
    for(const row of result.data||[])byId.set(row.id,row);
  }
  return latestIds.map(id=>byId.get(id)).filter(Boolean);
}

async function latestOrderDetailRows(db,{metadataLimit=1000,batchSize=100}={}) {
  const metadata=await db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,status,error_message,created_at,executed_at')
    .eq('operation_type',ORDER_DETAIL_OPERATION).eq('target_type','ORDER')
    .order('created_at',{ascending:false}).limit(metadataLimit);
  if(metadata.error)throw metadata.error;
  const successIds=[];
  const terminalRows=[];
  const successTargets=new Set();
  const terminalTargets=new Set();
  for(const row of metadata.data||[]){
    const targetId=text(row.target_id);
    if(!targetId)continue;
    if(row.status==='SUCCESS'&&!successTargets.has(targetId)){
      successTargets.add(targetId);
      successIds.push(row.id);
    }
    if(['CANCELLED','FAILED'].includes(row.status)&&/order has been cance(?:lled|led) or returned/i.test(text(row.error_message))&&!terminalTargets.has(targetId)){
      terminalTargets.add(targetId);
      terminalRows.push(row);
    }
  }
  const chunks=[];
  for(let index=0;index<successIds.length;index+=batchSize)chunks.push(successIds.slice(index,index+batchSize));
  const results=await Promise.all(chunks.map(ids=>db.from('coupang_operation_requests')
    .select('id,operation_type,target_type,target_id,status,result_json,error_message,created_at,executed_at')
    .in('id',ids)));
  const byId=new Map();
  for(const result of results){
    if(result.error)throw result.error;
    for(const row of result.data||[])byId.set(row.id,row);
  }
  return [...successIds.map(id=>byId.get(id)).filter(Boolean),...terminalRows]
    .sort((left,right)=>String(right.created_at||'').localeCompare(String(left.created_at||'')));
}

async function latestTrackingByOrder(db) {
  return trackingStatesFromRows(await latestTrackingRows(db));
}

async function loadOrderOperationRows(db,{includeOrderDetails=true}={}) {
  const [orderDetails,transfers,issues,trackingRows]=await Promise.all([
    includeOrderDetails
      ? latestOrderDetailRows(db).then(data=>({data,error:null}))
      : Promise.resolve({data:[],error:null}),
    db.from('coupang_operation_requests')
      .select('id,operation_type,target_type,target_id,status,payload,error_message,created_at,started_at,executed_at,next_attempt_at')
      .in('operation_type',TRANSFER_OPERATIONS)
      .order('created_at',{ascending:false}).limit(1000),
    db.from('coupang_operation_requests')
      .select('id,operation_type,target_type,target_id,status,result_json,error_message,created_at,started_at,executed_at,next_attempt_at')
      .eq('operation_type',ISSUE_OPERATION).eq('target_type','HUB_ORDER')
      .order('created_at',{ascending:false}).limit(1000),
    latestTrackingRows(db)
  ]);
  for(const result of [orderDetails,transfers,issues])if(result.error)throw result.error;
  const data=[...(orderDetails.data||[]),...(transfers.data||[]),...(issues.data||[]),...trackingRows]
    .sort((left,right)=>String(right.created_at||'').localeCompare(String(left.created_at||'')));
  return {data,error:null};
}

function requestKind(input={}) {
  return text(input.mode).toLowerCase()==='automatic'?'automatic':'manual';
}

function bucketKey(kind='hourly',at=new Date()) {
  const iso=new Date(at).toISOString();
  if(kind==='manual')return iso.slice(0,16);
  if(kind==='automatic'){
    const minute=Math.floor(new Date(at).getUTCMinutes()/5)*5;
    return `${iso.slice(0,14)}${String(minute).padStart(2,'0')}`;
  }
  return iso.slice(0,13);
}

function idempotencyKey(kind,trackingNo,at=new Date()) {
  return `epost:tracking:${kind}:${trackingNo}:${bucketKey(kind,at)}`;
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
      idempotencyKey:idempotencyKey(kind,group.trackingNo,at),retryFailed:kind!=='automatic'
    });
    results.push({trackingNo:group.trackingNo,hubOrderIds:group.hubOrderIds,status:queued.completed?'SUCCESS':queued.request?.status||'PENDING',requestId:queued.request?.id||null,reused:Boolean(queued.existing)});
  }
  return results;
}

module.exports={OPERATION,requestKind,bucketKey,idempotencyKey,latestOrderDetailRows,latestTrackingByOrder,latestTrackingRows,loadOrderOperationRows,trackingStatesFromRows,queueTrackingForOrders,validTracking};
