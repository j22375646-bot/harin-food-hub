'use strict';

function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url:null;}catch{return null;}}
async function publicProbe(config,{fetchImpl=fetch}={}){
  const base=safeUrl(config.publicUrl);if(!base)return {ok:false,status:null,latencyMs:null};
  const url=new URL('/login',base);const started=Date.now();const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetchImpl(url,{method:'HEAD',redirect:'follow',signal:controller.signal,cache:'no-store'});return {ok:response.ok,status:response.status,latencyMs:Date.now()-started};}
  catch{return {ok:false,status:null,latencyMs:Date.now()-started};}
  finally{clearTimeout(timeout);}
}

async function deployments(config,{fetchImpl=fetch}={}){
  const url=new URL('https://api.vercel.com/v6/deployments');url.searchParams.set('projectId',config.projectId);url.searchParams.set('teamId',config.teamId);url.searchParams.set('target','production');url.searchParams.set('limit','5');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    const payload=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(payload.error?.message||`Vercel 응답 오류 (${response.status})`);error.code=payload.error?.code||'VERCEL_REQUEST_FAILED';error.status=response.status;throw error;}
    const rows=Array.isArray(payload.deployments)?payload.deployments:[];const latest=rows[0]||null;
    return {total:rows.length,ready:rows.filter(item=>(item.readyState||item.state)==='READY').length,error:rows.filter(item=>(item.readyState||item.state)==='ERROR').length,latestState:latest?.readyState||latest?.state||null,latestCreatedAt:latest?.createdAt?new Date(latest.createdAt).toISOString():null,latestReadyAt:latest?.ready?new Date(latest.ready).toISOString():null};
  }finally{clearTimeout(timeout);}
}

async function probe({config,missingFields=[],fetchImpl=fetch}={}){
  const site=await publicProbe(config,{fetchImpl});
  if(missingFields.length)return {status:'PARTIAL',sourceTimestamp:new Date().toISOString(),metricSummary:{public_ok:site.ok,public_status:site.status,public_latency_ms:site.latencyMs,deployment_state:null,deployment_total:null,setup_required:true}};
  const release=await deployments(config,{fetchImpl});
  const releaseReady=release.latestState==='READY';
  return {status:site.ok&&releaseReady?'SUCCESS':'PARTIAL',sourceTimestamp:release.latestReadyAt||release.latestCreatedAt||new Date().toISOString(),metricSummary:{public_ok:site.ok,public_status:site.status,public_latency_ms:site.latencyMs,deployment_state:release.latestState,deployment_total:release.total,deployment_ready:release.ready,deployment_error:release.error,deployment_created_at:release.latestCreatedAt,deployment_ready_at:release.latestReadyAt,setup_required:false}};
}

module.exports={deployments,probe,publicProbe};
