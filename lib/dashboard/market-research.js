'use strict';
const contract=require('../../desktop/research-contract.cjs');
const metric=v=>typeof v==='string'&&/^<\s*10$/.test(v)?'LT_10':['number','string'].includes(typeof v)&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const state=(key,status)=>({status,[key]:[]});
const failure=(error,key)=>state(key,/(CONFIG|SETUP)_REQUIRED/.test(error?.code||'')?'SETUP_REQUIRED':'UNAVAILABLE');
async function shop(){throw Object.assign(Error('Shopping search retired'),{code:'SERVICE_RETIRED'});}
function createResearch({ads=require('../naver/client.js'),hub=require('../naver-api-hub/client.js'),shopping=shop,now=()=>new Date()}={}){
 return async input=>{
  if(!contract.valid(input))throw Object.assign(Error('Invalid'),{code:'INVALID_REQUEST'});
  const end=new Date(now().getTime()+9*60*60*1000);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-input.days+1);
  const [keywords,trend,products]=await Promise.all([
   (async()=>{try{const r=await ads.request('GET','/keywordstool',{hintKeywords:input.query.replace(/\s/g,''),showDetail:1});if(!Array.isArray(r.data?.keywordList))throw Error('Invalid');const seen=new Set(),rows=[];for(const v of r.data.keywordList){const keyword=contract.text(v.relKeyword,80);if(!keyword||seen.has(keyword))continue;seen.add(keyword);rows.push({keyword,pc:metric(v.monthlyPcQcCnt),mobile:metric(v.monthlyMobileQcCnt),competition:({높음:'HIGH',중간:'MEDIUM',낮음:'LOW',HIGH:'HIGH',MEDIUM:'MEDIUM',LOW:'LOW'})[v.compIdx]||null});}const key=input.query.replace(/\s/g,'').toLowerCase();rows.sort((a,b)=>(b.keyword.toLowerCase()===key)-(a.keyword.toLowerCase()===key));return {status:rows.length?'READY':'EMPTY',rows:rows.slice(0,50)};}catch(e){return failure(e,'rows');}})(),
   (async()=>{try{const r=await hub.fetchSearchTrend({startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),timeUnit:'date',keywordGroups:[{groupName:input.query,keywords:[input.query]}]});const values=r.data?.results?.[0]?.data;if(!Array.isArray(values))throw Error('Invalid');const points=values.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v.period)&&v.period>=start.toISOString().slice(0,10)&&v.period<=end.toISOString().slice(0,10)&&typeof v.ratio==='number'&&v.ratio>=0&&v.ratio<=100).map(v=>({date:v.period,ratio:v.ratio}));return {status:points.length?'READY':'EMPTY',points:points.slice(0,90)};}catch(e){return failure(e,'points');}})(),
   (async()=>{try{const r=await shopping(input);if(!Array.isArray(r.items)||!Number.isSafeInteger(r.total)||r.total<0)throw Error('Invalid');const rows=r.items.slice(0,40).map(v=>({id:contract.text(v.productId,80),title:contract.text(v.title,240),store:contract.text(v.mallName,100),brand:contract.text(v.brand,100),category:[v.category1,v.category2,v.category3,v.category4].filter(Boolean).join(' > '),price:metric(v.lprice)>0?metric(v.lprice):null}));return {status:rows.length?'READY':'EMPTY',total:r.total,rows};}catch(e){return {...failure(e,'rows'),total:null,retired:e?.code==='SERVICE_RETIRED'};}})()
  ]);
  return contract.project({query:input.query,days:input.days,sort:input.sort,checkedAt:now().toISOString(),keywords,trend,products},input);
 };
}
const research=createResearch();
module.exports={metric,shop,createResearch,research};
