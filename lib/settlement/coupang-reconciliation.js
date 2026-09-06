'use strict';
const {seoulDateKey}=require('../analytics/financial-date.js');
const DAY=86400000;
const paidStatus=row=>['DONE','COMPLETED','COMPLETE','PAID'].includes(String(row.status||'').toUpperCase());
function amount(value){
 if(value==null||String(value).trim()==='')return null;
 const n=Number(String(value).replace(/,/g,''));
 return Number.isFinite(n)?n:null;
}
function completeSum(rows,pick){
 if(!rows.length)return null;
 const values=rows.map(pick);
 return values.some(value=>value==null)?null:values.reduce((a,b)=>a+b,0);
}
function validDay(value){
 const day=String(value||'');
 return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;
}
function payoutEvidence(summaries,startMs,endMs){
 const first=seoulDateKey(new Date(startMs)),last=seoulDateKey(new Date(endMs));
 const relevant=summaries.filter(row=>!validDay(row.period_start)||!validDay(row.period_end)||(row.period_end>=first&&row.period_start<=last));
 const scoped=relevant.filter(row=>{
  const start=validDay(row.period_start),end=validDay(row.period_end);
  return start&&end&&start<=end&&start>=first&&end<=last;
 });
 const completed=scoped.filter(paidStatus),pending=scoped.filter(row=>!paidStatus(row));
 const knownPaid=completed.map(row=>amount(row.final_amount)).filter(value=>value!=null);
 const days=new Set();
 for(const row of scoped){
  for(let ms=Date.parse(row.period_start),end=Date.parse(row.period_end);ms<=end;ms+=DAY)days.add(new Date(ms).toISOString().slice(0,10));
 }
 const requiredDays=Math.round((Date.parse(last)-Date.parse(first))/DAY)+1;
 const complete=Boolean(scoped.length)&&scoped.length===relevant.length&&pending.length===0&&knownPaid.length===completed.length&&days.size===requiredDays&&scoped.every(row=>row.provenance?.coverage==='COMPLETE');
 return {
  actual_payout:knownPaid.length?knownPaid.reduce((a,b)=>a+b,0):null,
  pending_payout:completeSum(pending,row=>amount(row.final_amount)),
  payout_complete:complete,
  payout_evidence:{basis:'RECOGNITION_PERIOD',period_start:first,period_end:last,matched_documents:scoped.length,unmatched_documents:relevant.length-scoped.length,completed_documents:completed.length,pending_documents:pending.length,covered_days:days.size,required_days:requiredDays,source_keys:scoped.map(row=>row.summary_key||row.source_record_id).filter(Boolean)},
 };
}
module.exports={amount,completeSum,paidStatus,payoutEvidence};
