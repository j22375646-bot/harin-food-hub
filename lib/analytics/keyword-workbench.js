'use strict';
const number=v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const text=v=>String(v??'').slice(0,120);
function keywordWorkbench({rows=[],total=null,ready=false}={}){
 const end=rows.map(r=>r.period_end).filter(Boolean).sort().at(-1)||null;
 const start=rows.filter(r=>r.period_end===end).map(r=>r.period_start).filter(Boolean).sort()[0]||null;
 const selected=rows.filter(r=>r.period_start===start&&r.period_end===end).slice(0,200);
 return {status:ready?'OBSERVED':'UNAVAILABLE',start,end,total:ready?number(total):null,rows:selected.map((r,i)=>{
  const raw=r.raw_data,points=Array.isArray(raw?.data)?raw.data:[raw?.data||raw];
  const value=field=>points.length&&points.every(p=>p&&number(p[field])!==null)?points.reduce((sum,p)=>sum+number(p[field]),0):null;
  const out={id:text(r.ncc_keyword_id)||'row-'+i,name:text(r.keyword)||'키워드명 확인 필요',type:text(r.campaign_type)||'UNKNOWN',impressions:value('impCnt'),clicks:value('clkCnt'),cost:value('salesAmt'),conversions:value('ccnt'),revenue:value('convAmt')};
  const ratio=(a,b,m=1)=>out[a]!==null&&out[b]>0?out[a]/out[b]*m:null;
  return {...out,ctr:ratio('clicks','impressions',100),cpc:ratio('cost','clicks'),cvr:ratio('conversions','clicks',100),cpa:ratio('cost','conversions'),roas:ratio('revenue','cost',100)};
 })};
}
module.exports={keywordWorkbench};
