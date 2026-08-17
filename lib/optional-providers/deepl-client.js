'use strict';

async function readUsage({config,fetchImpl=fetch}={}){
  const endpoint=`${String(config.endpoint||'https://api-free.deepl.com').replace(/\/$/,'')}/v2/usage`;
  const response=await fetchImpl(endpoint,{headers:{Authorization:`DeepL-Auth-Key ${config.apiKey}`,Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.message||`DeepL usage HTTP ${response.status}`);error.code=response.status===456?'DEEPL_QUOTA_EXCEEDED':response.status===403?'DEEPL_AUTH_FAILED':'DEEPL_USAGE_FAILED';error.status=response.status;throw error;}
  const used=Math.max(0,Number(payload.character_count||0));const limit=Math.max(0,Number(payload.character_limit||0));
  return {status:'SUCCESS',metricSummary:{character_count:used,character_limit:limit,remaining_characters:Math.max(0,limit-used),usage_percent:limit?Number(((used/limit)*100).toFixed(1)):null}};
}

module.exports={readUsage};
