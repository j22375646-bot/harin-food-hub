'use strict';
const platforms=['NAVER','CAFE24','COUPANG'];
const check=(v)=>{if(!v)throw Error('Invalid assistant response');};
const count=v=>v===null||Number.isInteger(v)&&v>=0&&v<=10000000;
const text=(v,max=500)=>{check(typeof v==='string'&&v.length<=max);return v;};
function projectAssistant(p){
 check(p?.ok===true&&p.writePolicy==='READ_ONLY'&&['READY','PARTIAL'].includes(p.status)&&p.sourcePolicy==='STORED_DATA'&&p.externalAgent==='NOT_CONNECTED'&&Number.isFinite(Date.parse(p.retrievedAt)));
 const sources={};
 for(const key of ['orders','tasks','cs','reports']){
  const s=p.sources?.[key];check(s&&['READY','PARTIAL','UNAVAILABLE'].includes(s.status)&&s.sourceAsOf===null);
  const out=sources[key]={status:s.status,sourceAsOf:null};if(s.status==='UNAVAILABLE')continue;
  if(key==='orders'){
   check(s.unit==='ORDER'&&s.channels?.length===3);out.channels=s.channels.map((c,i)=>{check(c.platform===platforms[i]&&['READY','UNAVAILABLE','SETUP_REQUIRED'].includes(c.status));const counts=c.counts===null?null:Object.fromEntries(['ACTIVE','REGISTER','IN_TRANSIT'].map(k=>{check(count(c.counts?.[k])&&c.counts[k]!==null);return [k,c.counts[k]];}));check((c.status==='READY')===(counts!==null));return {platform:c.platform,status:c.status,counts};});
  }else if(key==='tasks'){
   check(/^\d{4}-\d{2}-\d{2}$/.test(s.today)&&s.scope==='ASSIGNED_TO_ME'&&typeof s.truncated==='boolean');out.today=s.today;out.truncated=s.truncated;
   out.counts=s.counts===null?null:Object.fromEntries(['dueToday','overdue'].map(k=>{check(count(s.counts?.[k])&&s.counts[k]!==null);return [k,s.counts[k]];}));check(s.truncated===(out.counts===null));
  }else if(key==='cs'){
   check(typeof s.truncated==='boolean'&&s.channels?.length===3);out.truncated=s.truncated;out.channels=s.channels.map((c,i)=>{check(c.platform===platforms[i]&&count(c.unanswered)&&s.truncated===(c.unanswered===null));return {platform:c.platform,unanswered:c.unanswered};});
  }else{
   check(s.platform==='NAVER'&&Array.isArray(s.items)&&s.items.length<=20);out.items=s.items.map(r=>({id:text(r.id,128),title:text(r.title,240),periodStart:r.periodStart===null?null:text(r.periodStart,40),periodEnd:r.periodEnd===null?null:text(r.periodEnd,40)}));
  }
 }
 check(Array.isArray(p.caveats)&&p.caveats.length<=10);
 return {status:p.status,retrievedAt:p.retrievedAt,sources,caveats:p.caveats.map(v=>text(v))};
}
module.exports={projectAssistant};
