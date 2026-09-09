'use strict';
const ALLOWED_STATUS=new Set(['READY','PARTIAL','BLOCKED']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function metric(input,statusOverride){
 const value=finite(input?.value)?input.value:null;
 const proposed=statusOverride||input?.status;
 const status=value===null?'BLOCKED':ALLOWED_STATUS.has(proposed)?proposed:'BLOCKED';
 return {value,status};
}
function buildWorkspaceFinanceSummary(data={},model={}){
 const generatedAt=String(data.generatedAt||'');
 const month=/^\d{4}-\d{2}$/.test(data.pacing?.month)?data.pacing.month:generatedAt.slice(0,7);
 const salesValue=model.metrics?.current;
 const salesStatus=finite(salesValue?.value)?(data.pacing?.status==='READY'?'READY':'PARTIAL'):'BLOCKED';
 return {
  month,generatedAt,
  metrics:{
   sales:metric(salesValue,salesStatus),
   profit:metric(model.metrics?.profit),
   balance:metric(model.metrics?.balance)
  }
 };
}
module.exports={buildWorkspaceFinanceSummary};
