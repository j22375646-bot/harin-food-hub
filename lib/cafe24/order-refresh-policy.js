'use strict';

const CAFE24_ORDER_REFRESH_INTERVAL_MS=120000;
const CAFE24_ORDER_REFRESH_FRESHNESS_MS=90000;
const CAFE24_ORDER_REFRESH_RUNNING_MS=5*60*1000;
const FAST_SYNC_OPTIONS=Object.freeze({
  days:2,
  includeCustomerService:false,
  jobType:'ORDERS_FAST'
});

function timestamp(value){
  const parsed=Date.parse(String(value||''));
  return Number.isFinite(parsed)?parsed:null;
}

function refreshDecision({latest=null,now=Date.now()}={}){
  const current=Number(now);
  const status=String(latest?.status||'').toUpperCase();
  const startedAt=timestamp(latest?.started_at);
  const finishedAt=timestamp(latest?.finished_at);
  if(status==='RUNNING'&&startedAt!=null&&current-startedAt<CAFE24_ORDER_REFRESH_RUNNING_MS){
    return Object.freeze({refresh:false,reason:'RUNNING',lastCheckedAt:latest.started_at});
  }
  if(['SUCCESS','PARTIAL'].includes(status)&&finishedAt!=null&&current-finishedAt<CAFE24_ORDER_REFRESH_FRESHNESS_MS){
    return Object.freeze({refresh:false,reason:'FRESH',lastCheckedAt:latest.finished_at});
  }
  return Object.freeze({refresh:true,reason:'STALE',lastCheckedAt:latest?.finished_at||latest?.started_at||null});
}

module.exports={
  CAFE24_ORDER_REFRESH_FRESHNESS_MS,
  CAFE24_ORDER_REFRESH_INTERVAL_MS,
  CAFE24_ORDER_REFRESH_RUNNING_MS,
  FAST_SYNC_OPTIONS,
  refreshDecision
};
