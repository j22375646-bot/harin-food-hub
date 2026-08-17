'use strict';

const serviceAccount=require('./service-account.js');
const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const ENDPOINT='https://analyticsdata.googleapis.com/v1beta';

async function probe({config,fetchImpl=fetch}){
  const token=await serviceAccount.accessToken({...config,scope:SCOPE,fetchImpl});
  const response=await fetchImpl(`${ENDPOINT}/properties/${encodeURIComponent(config.propertyId)}:runReport`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({dateRanges:[{startDate:'7daysAgo',endDate:'yesterday'}],dimensions:[{name:'date'}],metrics:[{name:'sessions'},{name:'totalUsers'}],limit:'10',returnPropertyQuota:true})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error?.message||'GA4 자료를 읽지 못했습니다.');error.code='GA4_READ_FAILED';error.status=response.status;throw error;}
  const rows=Array.isArray(payload.rows)?payload.rows:[];
  const totals=rows.reduce((sum,row)=>({sessions:sum.sessions+Number(row.metricValues?.[0]?.value||0),users:sum.users+Number(row.metricValues?.[1]?.value||0)}),{sessions:0,users:0});
  return {status:rows.length?'SUCCESS':'NO_DATA',metricSummary:{...totals,days:rows.length},quotaSummary:{tokensRemaining:Number(payload.propertyQuota?.tokensPerDay?.remaining||0)||null},sourceTimestamp:new Date().toISOString()};
}

module.exports={ SCOPE, ENDPOINT, probe };
