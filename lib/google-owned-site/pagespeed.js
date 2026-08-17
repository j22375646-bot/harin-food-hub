'use strict';

const ENDPOINT='https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
function auditValue(audits,key){const value=audits?.[key]?.numericValue;return Number.isFinite(value)?value:null;}

async function probe({config,fetchImpl=fetch}){
  const url=new URL(ENDPOINT);url.searchParams.set('url',config.siteUrl);url.searchParams.set('strategy','mobile');url.searchParams.set('category','performance');
  if(config.apiKey)url.searchParams.set('key',config.apiKey);
  const response=await fetchImpl(url,{headers:{Accept:'application/json'}});const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    const publicQuotaExhausted=response.status===429&&!config.apiKey;
    const error=new Error(publicQuotaExhausted?'Google 공용 호출 한도가 소진되었습니다. PageSpeed API 키를 추가한 뒤 다시 확인해주세요.':payload.error?.message||'PageSpeed 자료를 읽지 못했습니다.');
    error.code=publicQuotaExhausted?'PAGESPEED_PUBLIC_QUOTA_EXHAUSTED':'PAGESPEED_READ_FAILED';error.status=response.status;throw error;
  }
  const lighthouse=payload.lighthouseResult;const audits=lighthouse?.audits||{};
  if(!lighthouse)return {status:'NO_DATA',metricSummary:{},quotaSummary:{},sourceTimestamp:new Date().toISOString()};
  return {status:'SUCCESS',metricSummary:{performanceScore:Math.round(Number(lighthouse.categories?.performance?.score||0)*100),fcpMs:auditValue(audits,'first-contentful-paint'),lcpMs:auditValue(audits,'largest-contentful-paint'),cls:auditValue(audits,'cumulative-layout-shift'),tbtMs:auditValue(audits,'total-blocking-time')},quotaSummary:{},sourceTimestamp:lighthouse.fetchTime||new Date().toISOString()};
}

module.exports={ ENDPOINT, probe };
