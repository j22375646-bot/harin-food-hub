'use strict';
const ALLOWED_STATUS=new Set(['READY','PARTIAL','BLOCKED']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function metric(input,statusOverride){
 const value=finite(input?.value)?input.value:null;
 const proposed=statusOverride||input?.status;
 const status=value===null?'BLOCKED':ALLOWED_STATUS.has(proposed)?proposed:'BLOCKED';
 return {value,status};
}
const REVENUE_COUNTS=['CAFE24','NAVER','COUPANG','COUPANG_RG'];
const REVENUE_CHANNELS=['CAFE24','NAVER','COUPANG'];
function collectionEvidence(data){
 const counts=data.pacing?.counts||{};
 const countValues=REVENUE_COUNTS.map(key=>counts[key]);
 const countsKnown=countValues.every(value=>Number.isFinite(value)&&value>=0);
 const collectedRows=countsKnown?countValues.reduce((sum,value)=>sum+value,0):null;
 const channels=new Map((data.dataHealth?.channels||[]).map(item=>[item.platform,item.status]));
 const channelsReady=REVENUE_CHANNELS.every(platform=>channels.get(platform)==='READY');
 const queriesReady=data.pacing?.status==='READY'&&!data.pacing?.issues?.length;
 return {ready:countsKnown&&channelsReady&&queriesReady,collectedRows};
}
function buildWorkspaceFinanceSummary(data={},model={}){
 const generatedAt=String(data.generatedAt||'');
 const month=/^\d{4}-\d{2}$/.test(data.pacing?.month)?data.pacing.month:generatedAt.slice(0,7);
 const salesValue=model.metrics?.current;
 const evidence=collectionEvidence(data);
 const uncollectedZero=input=>!evidence.ready&&evidence.collectedRows===0&&input?.value===0;
 const evidenceMetric=(input,readyStatus=input?.status)=>uncollectedZero(input)
  ?{value:null,status:'BLOCKED'}
  :metric(input,evidence.ready?readyStatus:(input?.status==='BLOCKED'?'BLOCKED':'PARTIAL'));
 return {
  month,generatedAt,
  metrics:{
   sales:evidenceMetric(salesValue,'READY'),
   profit:evidenceMetric(model.metrics?.profit),
   balance:evidenceMetric(model.metrics?.balance)
  }
 };
}
module.exports={buildWorkspaceFinanceSummary};
