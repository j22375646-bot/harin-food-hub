'use strict';

const ENDPOINT='https://chromeuxreport.googleapis.com/v1/records:queryRecord';
function percentile(metric){const value=metric?.percentiles?.p75;return Number.isFinite(Number(value))?Number(value):null;}

async function probe({config,fetchImpl=fetch}){
  const response=await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(config.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:config.origin,formFactor:'PHONE'})});
  const payload=await response.json().catch(()=>({}));
  if(response.status===404)return {status:'NO_DATA',metricSummary:{reason:'CRUX_SAMPLE_UNAVAILABLE'},quotaSummary:{},sourceTimestamp:new Date().toISOString()};
  if(!response.ok){const error=new Error(payload.error?.message||'CrUX 실사용 자료를 읽지 못했습니다.');error.code='CRUX_READ_FAILED';error.status=response.status;throw error;}
  const metrics=payload.record?.metrics||{};
  return {status:Object.keys(metrics).length?'SUCCESS':'NO_DATA',metricSummary:{lcpMs:percentile(metrics.largest_contentful_paint),inpMs:percentile(metrics.interaction_to_next_paint),cls:percentile(metrics.cumulative_layout_shift)},quotaSummary:{},sourceTimestamp:payload.record?.collectionPeriod?.lastDate?`${payload.record.collectionPeriod.lastDate.year}-${String(payload.record.collectionPeriod.lastDate.month).padStart(2,'0')}-${String(payload.record.collectionPeriod.lastDate.day).padStart(2,'0')}`:new Date().toISOString()};
}

module.exports={ ENDPOINT, probe };
