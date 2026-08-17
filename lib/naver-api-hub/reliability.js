'use strict';

const crypto=require('node:crypto');

const OFFICIAL_SEARCH_DAILY_LIMIT=25_000;
const DEFAULT_SEARCH_DAILY_BUDGET=500;
const DEFAULT_SEARCH_CACHE_MINUTES=360;

function boundedInteger(value,fallback,min,max){
  const parsed=Number.parseInt(value,10);
  return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

function searchEnabled(env=process.env){
  return String(env.NAVER_API_HUB_SEARCH_ENABLED??'true').trim().toLowerCase()!=='false';
}

function searchDailyBudget(env=process.env){
  return boundedInteger(env.NAVER_API_HUB_SEARCH_DAILY_BUDGET,DEFAULT_SEARCH_DAILY_BUDGET,1,OFFICIAL_SEARCH_DAILY_LIMIT);
}

function searchCacheMinutes(env=process.env){
  return boundedInteger(env.NAVER_API_HUB_SEARCH_CACHE_MINUTES,DEFAULT_SEARCH_CACHE_MINUTES,5,1_440);
}

function kstDateKey(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date(value)).reduce((result,item)=>({...result,[item.type]:item.value}),{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function kstDayStartIso(value=new Date()){
  const [year,month,day]=kstDateKey(value).split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day)-9*60*60*1000).toISOString();
}

function cacheKey({query,type,sort,display}){
  return crypto.createHash('sha256').update(JSON.stringify({
    query:String(query||'').trim().toLocaleLowerCase('ko-KR'),
    type:String(type||'').trim().toUpperCase(),sort:String(sort||'sim').trim().toLowerCase(),
    display:boundedInteger(display,5,1,10)
  })).digest('hex');
}

function requestCount(rows=[]){
  return rows.reduce((total,row)=>total+boundedInteger(row?.metadata?.request_count,0,0,100),0);
}

function quotaState({rows=[],env=process.env,now=new Date()}={}){
  const budget=searchDailyBudget(env),used=requestCount(rows.filter(row=>kstDateKey(row.started_at||row.finished_at)===kstDateKey(now)));
  return {used,budget,official_limit:OFFICIAL_SEARCH_DAILY_LIMIT,remaining:Math.max(0,budget-used),warning:used/budget>=.8,blocked:used>=budget};
}

module.exports={
  OFFICIAL_SEARCH_DAILY_LIMIT,DEFAULT_SEARCH_DAILY_BUDGET,DEFAULT_SEARCH_CACHE_MINUTES,
  boundedInteger,searchEnabled,searchDailyBudget,searchCacheMinutes,kstDateKey,kstDayStartIso,cacheKey,requestCount,quotaState
};
