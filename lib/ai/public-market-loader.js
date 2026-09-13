'use strict';
const {buildPublicMarketSnapshot,SOURCE_URL}=require('./public-market-snapshot');
function createPublicMarketLoader({hub=require('../naver-api-hub/client'),now=Date.now}={}){
 return async({query,days,signal})=>{
  if(signal?.aborted)throw Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'});
  if(![30,90].includes(days)||typeof query!=='string'||!query.trim()||query.length>60)throw Object.assign(Error('INVALID_REQUEST'),{code:'INVALID_REQUEST'});
  const end=new Date(now()+9*3600000);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days+1);
  let result;try{result=await hub.fetchSearchTrend({startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),timeUnit:'date',keywordGroups:[{groupName:query,keywords:[query]}],signal,maxResponseBytes:64*1024});}catch(e){throw Object.assign(Error('Public source unavailable'),{code:signal?.aborted?'TIMEOUT':/CONFIG_REQUIRED|SETUP_REQUIRED/.test(e?.code||'')?'SETUP_REQUIRED':'UNAVAILABLE'});}
  if(signal?.aborted)throw Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'});
  const rows=result?.data?.results?.[0]?.data;if(!Array.isArray(rows)||rows.length>90)throw Object.assign(Error('Public source invalid'),{code:'PUBLIC_SOURCE_REQUIRED'});
  // The provider may echo the user's query/title. Only date and ratio survive.
  const points=rows.map(p=>({date:p.period,ratio:p.ratio??null}));
  return buildPublicMarketSnapshot({approvedPublicSources:[{kind:'NAVER_SEARCH_TREND',id:'naver-search-trend',url:SOURCE_URL,observedAt:new Date(now()).toISOString(),period:{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)},points}],now:now()});
 };
}
module.exports={createPublicMarketLoader};
