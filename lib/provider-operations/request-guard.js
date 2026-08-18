'use strict';

const crypto=require('node:crypto');

const TERMINAL_SUCCESS=new Set(['SUCCESS','NO_DATA']);
const iso=value=>new Date(value).toISOString();
const stable=value=>{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value==null?null:value;
};
function requestHash(provider,input={}){return crypto.createHash('sha256').update(JSON.stringify({provider,request:stable(input)})).digest('hex');}
function sourceTimestamp(result,now){return result?.sourceTimestamp||result?.source_timestamp||result?.snapshot?.source_timestamp||result?.snapshot?.fetched_at||iso(now);}
function quotaSummary(result){return result?.quotaSummary||result?.quota_summary||result?.usage||{};}
function safeSummary(result){
  if(!result||typeof result!=='object')return {};
  const safe={provider:result.provider||null,status:result.status||null,count:Number.isFinite(Number(result.count))?Number(result.count):undefined,usage:result.usage||undefined,snapshot:result.snapshot?{id:result.snapshot.id||null,provider:result.snapshot.provider||result.provider||null,status:result.snapshot.status||result.status||null,fetched_at:result.snapshot.fetched_at||null}:undefined};
  return Object.fromEntries(Object.entries(safe).filter(([,value])=>value!==undefined));
}
async function single(query){const result=await query.maybeSingle();if(result.error)throw result.error;return result.data||null;}
async function latestFresh(db,provider,hash,now){return single(db.from('provider_request_runs').select('id,status,response_summary,quota_summary,source_timestamp,finished_at,expires_at').eq('provider',provider).eq('request_hash',hash).in('status',['SUCCESS','NO_DATA']).gt('expires_at',iso(now)).order('finished_at',{ascending:false}).limit(1));}
async function latestRunning(db,provider,hash){return single(db.from('provider_request_runs').select('id,status,started_at').eq('provider',provider).eq('request_hash',hash).eq('status','RUNNING').order('started_at',{ascending:false}).limit(1));}
async function latestSuccess(db,provider,hash){return single(db.from('provider_request_runs').select('id,status,response_summary,quota_summary,source_timestamp,finished_at,expires_at').eq('provider',provider).eq('request_hash',hash).in('status',['SUCCESS','NO_DATA']).order('finished_at',{ascending:false}).limit(1));}
async function event(db,row){const result=await db.from('provider_request_runs').insert(row).select('id').single();if(result.error)throw result.error;return result.data||{id:null};}
async function mark(db,id,row){if(!id)return;const result=await db.from('provider_request_runs').update(row).eq('id',id);if(result.error)throw result.error;}
function runtime(kind,row,extra={}){return {kind,runId:row?.id||null,sourceTimestamp:row?.source_timestamp||null,expiresAt:row?.expires_at||null,...extra};}

async function protectedRead({db,provider,requestInput={},execute,ttlMs=15*60*1000,cacheResponse=true,allowStaleFallback=true,killSwitchEnabled=true,missingFields=[],now=new Date()}={}){
  if(!db||!provider||typeof execute!=='function')throw new Error('provider request guard requires db, provider and execute');
  if(!killSwitchEnabled){const error=new Error('이 공급자는 서버 안전 스위치로 중지되어 있습니다.');error.code='PROVIDER_DISABLED';error.status=423;throw error;}
  if(missingFields.length){const error=new Error(`필요한 서버 설정: ${missingFields.join(', ')}`);error.code='CONFIG_REQUIRED';error.status=412;throw error;}
  const hash=requestHash(provider,requestInput);
  if(cacheResponse){
    const cached=await latestFresh(db,provider,hash,now);
    if(cached){
      await event(db,{provider,request_hash:hash,status:'CACHED',parent_run_id:cached.id,source_timestamp:cached.source_timestamp,started_at:iso(now),finished_at:iso(now),metadata:{provider_isolated:true,cache_hit:true}}).catch(()=>{});
      const response=cached.response_summary||{};
      return {...response,status:response.status||cached.status,runtime:runtime('CACHE_HIT',cached,{cached:true,deduplicated:false,staleFallback:false})};
    }
  }
  const running=await latestRunning(db,provider,hash);
  if(running){
    await event(db,{provider,request_hash:hash,status:'DEDUPLICATED',parent_run_id:running.id,started_at:iso(now),finished_at:iso(now),metadata:{provider_isolated:true,duplicate_suppressed:true}}).catch(()=>{});
    return {provider,status:'RUNNING',runtime:runtime('DEDUPLICATED',running,{cached:false,deduplicated:true,staleFallback:false})};
  }
  let active;
  try{active=await event(db,{provider,request_hash:hash,status:'RUNNING',started_at:iso(now),metadata:{provider_isolated:true,response_cached:Boolean(cacheResponse)}});}
  catch(error){
    if(String(error?.code||'')!=='23505')throw error;
    const duplicate=await latestRunning(db,provider,hash);
    return {provider,status:'RUNNING',runtime:runtime('DEDUPLICATED',duplicate,{cached:false,deduplicated:true,staleFallback:false})};
  }
  try{
    const result=await execute();
    const status=String(result?.status||'SUCCESS').toUpperCase()==='NO_DATA'?'NO_DATA':'SUCCESS';
    const finished=iso(now),expires=iso(new Date(new Date(now).getTime()+Math.max(0,Number(ttlMs)||0))),source=sourceTimestamp(result,now),summary=cacheResponse?safeSummary(result):{};
    await mark(db,active.id,{status,response_summary:summary,quota_summary:quotaSummary(result),source_timestamp:source,finished_at:finished,expires_at:cacheResponse?expires:null,metadata:{provider_isolated:true,response_cached:Boolean(cacheResponse),contains_customer_data:false}});
    return {...result,runtime:runtime('LIVE',{id:active.id,source_timestamp:source,expires_at:cacheResponse?expires:null},{cached:false,deduplicated:false,staleFallback:false})};
  }catch(error){
    const code=String(error?.code||'PROVIDER_READ_FAILED').slice(0,100);
    await mark(db,active.id,{status:'FAILED',finished_at:iso(now),error_code:code,metadata:{provider_isolated:true,response_cached:false,contains_customer_data:false}}).catch(()=>{});
    const previous=cacheResponse&&allowStaleFallback?await latestSuccess(db,provider,hash).catch(()=>null):null;
    if(previous){
      await event(db,{provider,request_hash:hash,status:'STALE_FALLBACK',parent_run_id:previous.id,source_timestamp:previous.source_timestamp,started_at:iso(now),finished_at:iso(now),error_code:code,metadata:{provider_isolated:true,previous_success_used:true}}).catch(()=>{});
      return {...(previous.response_summary||{}),status:'STALE',previousSuccess:true,warning:'새 읽기 확인이 실패해 이전 성공 자료를 보여드려요.',runtime:runtime('STALE_FALLBACK',previous,{cached:true,deduplicated:false,staleFallback:true,errorCode:code})};
    }
    throw error;
  }
}

module.exports={protectedRead,requestHash,safeSummary};
