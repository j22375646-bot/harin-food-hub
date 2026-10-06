'use strict';
const finite=v=>!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const keys=['impressions','clicks','cost','conversions','revenue'];
const fields={impressions:'impCnt',clicks:'clkCnt',cost:'salesAmt',conversions:'ccnt',revenue:'convAmt'};
const clean=v=>String(v??'').slice(0,120);
function metrics(rows){
 const out={};for(const k of keys)out[k]=!rows.length||rows.some(r=>r[k]===null)?null:rows.reduce((n,r)=>n+r[k],0);
 const ratio=(a,b,m=1)=>out[a]!==null&&out[b]>0?out[a]/out[b]*m:null;
 return {...out,ctr:ratio('clicks','impressions',100),cpc:ratio('cost','clicks'),cvr:ratio('conversions','clicks',100),cpa:ratio('cost','conversions'),roas:ratio('revenue','cost',100)};
}
function buildNaverMarketing({stats=[],campaigns=[],keywords=[],run=null,statsReady=false,keywordsReady=false,now=new Date()}={}){
 const today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10),end=shift(today,-1),day=new Date(today+'T00:00:00Z').getUTCDay()||7,weekEnd=shift(today,-day);
 const meta=new Map(campaigns.map(r=>[r.ncc_campaign_id,r]));const seen=new Set();
 const rows=[];for(const r of stats){if(r.entity_type!=='CAMPAIGN'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!r.entity_id)continue;const id=r.date+':'+r.entity_id;if(seen.has(id))continue;seen.add(id);
  const item={date:r.date,id:clean(r.entity_id),updatedAt:r.updated_at};
  for(const k of keys){const raw=r.raw_data;item[k]=raw&&typeof raw==='object'&&Object.hasOwn(raw,fields[k])?finite(raw[fields[k]]):null;}
  rows.push(item);
 }
 const windows=[['WEEK','지난주',shift(weekEnd,-6),weekEnd],['D7','최근 7일',shift(end,-6),end],['D30','최근 30일',shift(end,-29),end]].map(([id,label,start,finish])=>{
  const days=Math.round((Date.parse(finish)-Date.parse(start))/86400000)+1,priorStart=shift(start,-days),priorEnd=shift(start,-1),current=rows.filter(r=>r.date>=start&&r.date<=finish),previous=rows.filter(r=>r.date>=priorStart&&r.date<=priorEnd);
  const covered=new Set(current.map(r=>r.date)).size,previousCovered=new Set(previous.map(r=>r.date)).size;
  const series=Array.from({length:days},(_,i)=>{const date=shift(start,i);return {date,...metrics(current.filter(r=>r.date===date))};});
  const campaignRows=[...new Set(current.map(r=>r.id))].map(id=>{const data=current.filter(r=>r.id===id),m=metrics(data),c=meta.get(id)||{};return {id,name:clean(c.name)||'캠페인명 확인 필요',type:clean(c.campaign_type)||'UNKNOWN',...m,decision:m.clicks===null||m.conversions===null?'자료 확인':m.clicks<30||m.conversions<3?'표본 관찰':m.revenue===null?'매출 확인':'효율 비교'};}).sort((a,b)=>(b.cost??-1)-(a.cost??-1));
  return {id,label,start,end:finish,previousStart:priorStart,previousEnd:priorEnd,days,coveredDays:covered,previousCoveredDays:previousCovered,status:!statsReady?'UNAVAILABLE':covered===0?'NO_DATA':covered<days||current.some(r=>keys.some(k=>r[k]===null))?'PARTIAL':'OBSERVED',metrics:metrics(current),previous:metrics(previous),series,campaigns:campaignRows.slice(0,50),campaignCount:campaignRows.length};
 });
 const keywordPeriod=keywords.map(r=>r.period_end).filter(Boolean).sort().at(-1),keywordStart=keywords.filter(r=>r.period_end===keywordPeriod).map(r=>r.period_start).sort().at(-1);
 const keywordRows=keywords.filter(r=>r.period_end===keywordPeriod&&r.period_start===keywordStart).slice(0,40).map(r=>({name:clean(r.keyword)||'자동 매칭',type:clean(r.campaign_type),cost:finite(r.cost),clicks:finite(r.clicks),conversions:finite(r.conversions),revenue:finite(r.conversion_revenue)}));
 return {version:1,asOf:new Date(now).toISOString(),sourceAt:rows.map(r=>r.updatedAt).filter(v=>typeof v==='string'&&Number.isFinite(Date.parse(v))).sort().at(-1)||null,conversionBasis:'ALL_CONVERSIONS',windows,keywords:{status:keywordsReady?'OBSERVED':'UNAVAILABLE',start:keywordStart||null,end:keywordPeriod||null,rows:keywordRows},automation:{schedule:'매일 오전 7:00 수집 · 지난주 보고서 자동 생성/누락 보완',status:['SUCCESS','PARTIAL','RUNNING','FAILED'].includes(run?.status)?run.status:'UNVERIFIED',finishedAt:run?.finished_at||null},notes:['네이버 광고 전환 기준입니다. 구매수·주문 전체 매출과 구분합니다.','관측된 캠페인 자료 기준이며 수집일 존재만으로 모든 캠페인의 수집 완료를 보장하지 않습니다.','원천 값이 없는 지표는 확인 필요로 표시합니다. VAT·전환 지연과 반품 반영은 광고 원천 기준을 확인하세요.']};
}
module.exports={buildNaverMarketing,metrics,shift};
