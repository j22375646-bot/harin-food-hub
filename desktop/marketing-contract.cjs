'use strict';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function projectMarketing(value){
 if(value==null)return null;
 const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max)throw Error('Marketing text');return v;};
 const number=v=>{if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('Marketing number');return v;};
 const date=v=>{if(v===null)return null;text(v,40);if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Marketing date');return v;};
 const list=(v,max,fn)=>{if(!Array.isArray(v)||v.length>max)throw Error('Marketing list');return v.map(fn);};
 const m=r=>{if(!object(r))throw Error('Marketing metric');return Object.fromEntries(['impressions','clicks','cost','conversions','revenue','ctr','cpc','cvr','cpa','roas'].map(k=>[k,number(r[k])]));};
 if(!object(value)||value.version!==1||value.conversionBasis!=='ALL_CONVERSIONS')throw Error('Marketing version');
 return {version:1,asOf:date(value.asOf),sourceAt:date(value.sourceAt),conversionBasis:value.conversionBasis,notes:list(value.notes,8,v=>text(v)),windows:list(value.windows,3,w=>{
  if(!['WEEK','D7','D30'].includes(w.id)||!['UNAVAILABLE','NO_DATA','PARTIAL','OBSERVED'].includes(w.status))throw Error('Marketing window');
  return {id:w.id,label:text(w.label),status:w.status,start:date(w.start),end:date(w.end),previousStart:date(w.previousStart),previousEnd:date(w.previousEnd),days:number(w.days),coveredDays:number(w.coveredDays),previousCoveredDays:number(w.previousCoveredDays),campaignCount:number(w.campaignCount),metrics:m(w.metrics),previous:m(w.previous),series:list(w.series,31,d=>({date:date(d.date),...m(d)})),campaigns:list(w.campaigns,50,c=>({id:text(c.id,120),name:text(c.name,120),type:text(c.type,120),decision:text(c.decision,120),...m(c)}))};
 }),keywords:{status:text(value.keywords.status,30),start:date(value.keywords.start),end:date(value.keywords.end),rows:list(value.keywords.rows,40,k=>({name:text(k.name,120),type:text(k.type,120),cost:number(k.cost),clicks:number(k.clicks),conversions:number(k.conversions),revenue:number(k.revenue)}))},automation:{schedule:text(value.automation.schedule),status:text(value.automation.status,30),finishedAt:date(value.automation.finishedAt)}};
}
module.exports={projectMarketing};
