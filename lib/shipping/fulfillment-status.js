'use strict';

const operationQueue=require('../coupang/operation-queue.js');

const ISSUE_OPERATION='EPOST_LIVE_ISSUE';
const CAFE24_TRANSFER='CAFE24_UPLOAD_INVOICE';
const COUPANG_TRANSFER='UPLOAD_INVOICE';
const text=value=>value==null?'':String(value).trim();
const dateValue=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:0;};
const platformLabel=value=>({CAFE24:'Cafe24',COUPANG:'쿠팡',NAVER:'네이버'})[value]||'쇼핑몰';
const activeStatus=value=>['PENDING','RUNNING','EXECUTING'].includes(text(value).toUpperCase());
const updatedAt=row=>row?.executed_at||row?.started_at||row?.created_at||null;

function normalizeOperationStatus(row,now=new Date()){
  const status=text(row?.status).toUpperCase();
  const nextAttempt=dateValue(row?.next_attempt_at);
  if(status==='PENDING'&&nextAttempt>now.getTime())return 'RETRY_WAITING';
  if(status==='PENDING')return 'QUEUED';
  if(['RUNNING','EXECUTING'].includes(status))return 'RUNNING';
  return status||'UNKNOWN';
}

function latestBy(rows,keyFor){
  const sorted=[...(rows||[])].sort((a,b)=>dateValue(b.created_at)-dateValue(a.created_at));
  const result=new Map();
  for(const row of sorted){const key=keyFor(row);if(key&&!result.has(key))result.set(key,row);}
  return result;
}

function safeOpen(envelope,secret){
  try{return operationQueue.open(envelope,secret);}catch{return {};}
}

function invoiceFromRows(order,issue,transfer,secret){
  const registered=text(order?.invoiceNumber).replace(/\D/g,'');
  const issued=text(order?.issuedInvoiceNumber).replace(/\D/g,'');
  const issueResult=safeOpen(issue?.result_json,secret);
  const issueNumber=text(issueResult.epostLive?.trackingNo).replace(/\D/g,'');
  const transferPayload=safeOpen(transfer?.payload,secret);
  const transferNumber=text(transferPayload.invoiceNumber).replace(/\D/g,'');
  return [registered,transferNumber,issued,issueNumber].find(value=>/^\d{13}$/.test(value))||'';
}

function issueState(order,row,trackingNo,now){
  const status=normalizeOperationStatus(row,now);
  const base={hubOrderId:order.hubOrderId,platform:order.platform,phase:'ISSUE',status,active:activeStatus(row.status),needsAttention:false,progress:2,trackingNo,requestId:row.id,updatedAt:updatedAt(row),error:''};
  if(status==='RETRY_WAITING')return {...base,label:'우체국 재시도 대기',detail:'우체국 연결을 자동으로 다시 시도할 예정이에요.'};
  if(status==='QUEUED')return {...base,label:'우체국 송장 발급 대기',detail:'고정 IP 출고 서버가 작업을 받을 때까지 기다리고 있어요.'};
  if(status==='RUNNING')return {...base,label:'우체국 송장 발급 중',detail:'우체국 계약소포 접수와 송장번호를 확인하고 있어요.'};
  if(['FAILED','CANCELLED'].includes(status))return {...base,label:'우체국 송장 발급 실패',detail:'주소·연락처 또는 우체국 연결 상태를 확인해주세요.',active:false,needsAttention:true,error:text(row.error_message)||'우체국 송장 발급 결과를 확인해주세요.'};
  return null;
}

function transferState(order,row,trackingNo,now){
  const status=normalizeOperationStatus(row,now);
  const channel=platformLabel(order.platform);
  const base={hubOrderId:order.hubOrderId,platform:order.platform,phase:'TRANSFER',status,active:activeStatus(row.status),needsAttention:false,progress:3,trackingNo,requestId:row.id,updatedAt:updatedAt(row),error:''};
  if(status==='RETRY_WAITING')return {...base,label:`${channel} 등록 재시도 대기`,detail:`송장 ${trackingNo||'번호'} 등록을 자동으로 다시 시도할 예정이에요.`};
  if(status==='QUEUED')return {...base,label:`${channel} 송장 등록 대기`,detail:`발급 송장 ${trackingNo||'번호'}을 쇼핑몰에 전송할 차례예요.`};
  if(status==='RUNNING')return {...base,label:`${channel} 송장 등록 중`,detail:`발급 송장 ${trackingNo||'번호'}을 쇼핑몰에 등록하고 있어요.`};
  if(['FAILED','CANCELLED'].includes(status))return {...base,label:`${channel} 송장 등록 실패`,detail:`발급된 송장 ${trackingNo||'번호'}은 보존되어 있어 채널 등록만 다시 시도하면 됩니다.`,active:false,needsAttention:true,error:text(row.error_message)||'쇼핑몰 송장 등록 결과를 확인해주세요.'};
  return null;
}

function trackingState(order,tracking,trackingNo,transfer){
  const status=text(tracking?.status).toUpperCase();
  const statusCode=text(tracking?.statusCode).toUpperCase();
  const base={hubOrderId:order.hubOrderId,platform:order.platform,phase:'TRACKING',status:statusCode||status||'TRACKING_PENDING',active:status==='QUEUED',needsAttention:false,progress:4,trackingNo:text(tracking?.trackingNo)||trackingNo,requestId:tracking?.requestId||transfer?.id||null,updatedAt:tracking?.checkedAt||updatedAt(transfer),error:''};
  if(status==='QUEUED')return {...base,status:'QUEUED',label:'우체국 배송조회 중',detail:'우체국 접수·이동 상태를 확인하고 있어요.'};
  if(status==='FAILED')return {...base,status:'FAILED',label:'우체국 배송조회 실패',detail:'송장번호는 보존되어 있습니다. 잠시 뒤 배송조회만 다시 시도해주세요.',active:false,needsAttention:true,error:text(tracking.error)||'우체국 배송상태를 확인하지 못했습니다.'};
  if(statusCode==='DELIVERED')return {...base,label:tracking.statusLabel||'배달완료',detail:'우체국 배송이 완료됐어요.',active:false};
  if(statusCode==='IN_TRANSIT')return {...base,label:tracking.statusLabel||'배송중',detail:tracking.latestEvent?.name?`${tracking.latestEvent.name}${tracking.latestEvent.office?` · ${tracking.latestEvent.office}`:''}`:'우체국 배송 이동이 확인됐어요.',active:false};
  if(statusCode==='ACCEPTED')return {...base,label:tracking.statusLabel||'우체국 접수중',detail:'우체국 접수는 확인됐고 실제 이동을 기다리고 있어요.',active:false};
  if(statusCode==='NOT_FOUND')return {...base,label:tracking.statusLabel||'우체국 접수 확인 전',detail:'쇼핑몰 등록은 끝났고 우체국 첫 접수를 기다리고 있어요.',active:false};
  return {...base,status:'TRACKING_PENDING',label:'우체국 배송조회 대기',detail:'쇼핑몰 송장 등록이 끝나 첫 배송조회를 기다리고 있어요.',active:false};
}

function buildFulfillmentStatuses({orders=[],operationRows=[],trackingStates={},secret,now=new Date()}={}){
  const orderById=new Map((orders||[]).map(order=>[text(order.hubOrderId),order]));
  const issueByOrder=latestBy(operationRows.filter(row=>row.operation_type===ISSUE_OPERATION),row=>text(row.target_id));
  const transferByOrder=latestBy(operationRows.filter(row=>[CAFE24_TRANSFER,COUPANG_TRANSFER].includes(row.operation_type)),row=>{
    if(row.operation_type===CAFE24_TRANSFER)return text(row.target_id);
    const shipment=text(row.target_id);
    return [...orderById.values()].find(order=>text(order.shipmentId)===shipment)?.hubOrderId||'';
  });
  const ids=new Set([...issueByOrder.keys(),...transferByOrder.keys(),...Object.keys(trackingStates||{})]);
  const items=[];
  for(const hubOrderId of ids){
    const order=orderById.get(hubOrderId);
    if(!order)continue;
    const issue=issueByOrder.get(hubOrderId);
    const transfer=transferByOrder.get(hubOrderId);
    const tracking=trackingStates?.[hubOrderId];
    const trackingNo=invoiceFromRows(order,issue,transfer,secret);
    let item=null;
    if(issue&&text(issue.status).toUpperCase()!=='SUCCESS')item=issueState(order,issue,trackingNo,now);
    else if(transfer&&text(transfer.status).toUpperCase()!=='SUCCESS')item=transferState(order,transfer,trackingNo,now);
    else if(transfer&&text(transfer.status).toUpperCase()==='SUCCESS')item=trackingState(order,tracking,trackingNo,transfer);
    else if(issue&&text(issue.status).toUpperCase()==='SUCCESS')item={hubOrderId,platform:order.platform,phase:'TRANSFER',status:'TRANSFER_PENDING',label:`${platformLabel(order.platform)} 송장 등록 필요`,detail:`발급 송장 ${trackingNo||'번호'}을 쇼핑몰에 등록해야 해요.`,active:false,needsAttention:true,progress:3,trackingNo,requestId:issue.id,updatedAt:updatedAt(issue),error:''};
    if(item)items.push(Object.freeze(item));
  }
  items.sort((a,b)=>Number(b.active)-Number(a.active)||Number(b.needsAttention)-Number(a.needsAttention)||dateValue(b.updatedAt)-dateValue(a.updatedAt));
  return Object.freeze({
    items:Object.freeze(items),
    summary:Object.freeze({total:items.length,active:items.filter(item=>item.active).length,needsAttention:items.filter(item=>item.needsAttention).length,updatedAt:new Date(now).toISOString()})
  });
}

module.exports={ISSUE_OPERATION,CAFE24_TRANSFER,COUPANG_TRANSFER,buildFulfillmentStatuses,normalizeOperationStatus};

