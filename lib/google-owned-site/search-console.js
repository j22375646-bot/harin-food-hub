'use strict';

const serviceAccount=require('./service-account.js');
const SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const ENDPOINT='https://www.googleapis.com/webmasters/v3/sites';

function isoDate(value){ return new Date(value).toISOString().slice(0,10); }
function daysBefore(now,days){ return isoDate(new Date(new Date(now).getTime()-days*86400000)); }

async function probe({config,fetchImpl=fetch,now=new Date()}){
  const token=await serviceAccount.accessToken({...config,scope:SCOPE,fetchImpl,now:new Date(now).getTime()});
  const site=encodeURIComponent(config.siteUrl);
  const response=await fetchImpl(`${ENDPOINT}/${site}/searchAnalytics/query`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({startDate:daysBefore(now,8),endDate:daysBefore(now,1),dimensions:['date'],dataState:'final',rowLimit:10})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error?.message||'Search Console 자료를 읽지 못했습니다.');error.code='SEARCH_CONSOLE_READ_FAILED';error.status=response.status;throw error;}
  const rows=Array.isArray(payload.rows)?payload.rows:[];
  const totals=rows.reduce((sum,row)=>({clicks:sum.clicks+Number(row.clicks||0),impressions:sum.impressions+Number(row.impressions||0)}),{clicks:0,impressions:0});
  return {status:rows.length?'SUCCESS':'NO_DATA',metricSummary:{...totals,ctr:totals.impressions?totals.clicks/totals.impressions:null,days:rows.length},quotaSummary:{},sourceTimestamp:daysBefore(now,1)};
}

module.exports={ SCOPE, ENDPOINT, probe };
