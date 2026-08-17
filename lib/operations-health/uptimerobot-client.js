'use strict';

function normalizedUrl(value){try{const url=new URL(value);return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/,'')}`.toLowerCase();}catch{return '';}}
async function probe({config,fetchImpl=fetch}={}){
  const url=new URL('https://api.uptimerobot.com/v3/monitors');url.searchParams.set('limit','50');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(url,{headers:{Accept:'application/json',Authorization:`Bearer ${config.apiKey}`},signal:controller.signal,cache:'no-store'});const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(payload.message||payload.error||`UptimeRobot 응답 오류 (${response.status})`);error.code='UPTIMEROBOT_READ_FAILED';error.status=response.status;throw error;}
    const monitors=Array.isArray(payload.data)?payload.data:Array.isArray(payload.monitors)?payload.monitors:[];const targetUrl=normalizedUrl(config.publicUrl);const target=monitors.find(item=>normalizedUrl(item.url)===targetUrl)||null;
    const state=item=>String(item?.status||item?.state||'UNKNOWN').toUpperCase();const counts=monitors.reduce((sum,item)=>{const key=state(item);if(key==='UP')sum.up+=1;else if(['DOWN','LOOKS_DOWN'].includes(key))sum.down+=1;else if(['PAUSED','STARTED'].includes(key))sum.paused+=1;else sum.unknown+=1;return sum;},{up:0,down:0,paused:0,unknown:0});
    return {status:target?(['DOWN','LOOKS_DOWN'].includes(state(target))?'PARTIAL':'SUCCESS'):'NO_DATA',sourceTimestamp:new Date().toISOString(),metricSummary:{monitor_count:monitors.length,...counts,target_found:Boolean(target),target_name:target?.friendlyName||target?.friendly_name||null,target_status:target?state(target):null,target_url:target?config.publicUrl:null,has_next_page:Boolean(payload.nextLink||payload.next_cursor)}};
  }finally{clearTimeout(timeout);}
}
module.exports={probe,normalizedUrl};
