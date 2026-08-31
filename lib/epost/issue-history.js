'use strict';

const operationQueue=require('../coupang/operation-queue.js');

const text=value=>value==null?'':String(value).trim();
const OPERATION='EPOST_LIVE_ISSUE';

function successfulIssueIndex(rows=[],secret){
  const latest=new Map();
  for(const row of rows){
    if(row.operation_type!==OPERATION||row.target_type!=='HUB_ORDER'||row.status!=='SUCCESS')continue;
    const hubOrderId=text(row.target_id);
    if(!hubOrderId||latest.has(hubOrderId))continue;
    try{
      const opened=operationQueue.open(row.result_json,secret);
      const invoiceNumber=text(opened.epostLive?.trackingNo);
      if(/^\d{13}$/.test(invoiceNumber))latest.set(hubOrderId,{invoiceNumber,requestId:row.id});
    }catch{}
  }
  return latest;
}

module.exports={OPERATION,successfulIssueIndex};
