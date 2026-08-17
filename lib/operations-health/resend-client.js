'use strict';

async function probe({config,fetchImpl=fetch}={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl('https://api.resend.com/domains',{headers:{Accept:'application/json',Authorization:`Bearer ${config.apiKey}`},signal:controller.signal,cache:'no-store'});const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(payload.message||payload.error||`Resend 응답 오류 (${response.status})`);error.code='RESEND_READ_FAILED';error.status=response.status;throw error;}
    const domains=Array.isArray(payload.data)?payload.data:[];const verified=domains.filter(item=>String(item.status||'').toLowerCase()==='verified');const sendable=domains.filter(item=>item.capabilities?.sending==='enabled');
    return {status:!domains.length?'NO_DATA':verified.length&&sendable.length?'SUCCESS':'PARTIAL',sourceTimestamp:new Date().toISOString(),metricSummary:{domain_count:domains.length,verified_domain_count:verified.length,sending_enabled_count:sendable.length,domain_names:domains.slice(0,5).map(item=>item.name).filter(Boolean)}};
  }finally{clearTimeout(timeout);}
}
module.exports={probe};
