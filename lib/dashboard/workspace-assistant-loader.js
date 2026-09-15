'use strict';
const {loadUnifiedOrders}=require('../orders/unified-orders.js');
const {orderCandidates}=require('../ui/phase28-adapters/orders.js');
const {loadWorkspaceCs}=require('./workspace-cs-loader.js');
const {buildWorkspaceInsightsSummary}=require('../tenancy/workspace-insights-summary.js');
const platforms=['NAVER','CAFE24','COUPANG'];
const unknown=()=>({status:'UNAVAILABLE',sourceAsOf:null});
async function query(result){const r=await result;if(r.error||!Array.isArray(r.data))throw Error('Read unavailable');return r.data;}
function summarizeOrders(center){
 if(!Array.isArray(center?.orders)||!Array.isArray(center?.channels))throw Error('Orders unavailable');
 return {status:center.channels.every(c=>c.status==='READY')?'READY':'PARTIAL',sourceAsOf:null,unit:'ORDER',channels:platforms.map(platform=>{
  const state=center.channels.find(c=>c.platform===platform)?.status;
  if(state!=='READY')return {platform,status:state==='SETUP_REQUIRED'?'SETUP_REQUIRED':'UNAVAILABLE',counts:null};
  return {platform,status:'READY',counts:Object.fromEntries(['ACTIVE','REGISTER','IN_TRANSIT'].map(stage=>[stage,orderCandidates(center.orders,[],{platform,stage}).length]))};
 })};
}
async function loadWorkspaceAssistant({db,context,now=new Date(),ordersReader=loadUnifiedOrders,csReader=loadWorkspaceCs}={}){
 if(!db||!context?.tenantId||!context?.userId)throw Error('Trusted context required');
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
 const readers={
  orders:async()=>summarizeOrders(await ordersReader({db,summaryRead:true})),
  tasks:async()=>{
   const rows=await query(db.from('moaon_tasks').select('due_date').eq('tenant_id',context.tenantId).eq('assigned_to',context.userId).eq('status','OPEN').is('deleted_at',null).lte('due_date',today).order('id').limit(1001));
   const truncated=rows.length>1000,observed=rows.slice(0,1000);
   return {status:truncated?'PARTIAL':'READY',sourceAsOf:null,today,scope:'ASSIGNED_TO_ME',counts:truncated?null:{dueToday:observed.filter(r=>r.due_date===today).length,overdue:observed.filter(r=>r.due_date<today).length},truncated};
  },
  cs:async()=>{
   const data=await csReader({db,now:()=>now,includeDetails:false});
   if(data.status!=='READY'||!Array.isArray(data.items))throw Error('CS unavailable');
   return {status:data.truncated?'PARTIAL':'READY',sourceAsOf:null,truncated:data.truncated,channels:platforms.map(platform=>({platform,unanswered:data.truncated?null:data.items.filter(r=>r.platform===platform&&r.kind==='INQUIRY').length}))};
  },
  reports:async()=>{
   const reports=await query(db.from('reports').select('id,platform,report_type,period_start,period_end,title,status,summary_json,created_at').eq('platform','NAVER').eq('report_type','WEEKLY').eq('is_latest',true).order('period_end',{ascending:false}).order('created_at',{ascending:false}).limit(20));
   const projected=buildWorkspaceInsightsSummary({reports,generatedAt:now.toISOString()});
   return {status:'READY',sourceAsOf:null,platform:'NAVER',limit:20,items:projected.reports};
  }
 };
 const entries=await Promise.all(Object.entries(readers).map(async([key,read])=>{try{return [key,await read()];}catch{return [key,unknown()];}}));
 const sources=Object.fromEntries(entries);
 return {writePolicy:'READ_ONLY',retrievedAt:now.toISOString(),sourcePolicy:'STORED_DATA',status:entries.every(([,v])=>v.status==='READY')?'READY':'PARTIAL',externalAgent:'NOT_CONNECTED',sources,caveats:['모아온에 저장된 자료를 조회합니다. 채널 실시간 수집을 실행하지 않습니다.','조회 시각은 원본 자료의 수집 시각이 아닙니다. 수집 시각은 확인 필요입니다.','주문은 판매자배송 주문 단위이며 채널별로 구분합니다.','확인 실패·조회 범위 초과는 0건으로 표시하지 않습니다.']};
}
module.exports={loadWorkspaceAssistant,summarizeOrders};
