'use strict';

const crypto=require('node:crypto');
const configModule=require('../google-owned-site/config.js');
const ecommerce=require('../google-owned-site/ecommerce.js');
const requestGuard=require('../provider-operations/request-guard.js');

const SCHEDULE='매일 05:30 (한국시간)';
const KIND='GA4_ECOMMERCE_V1';
const STALE_MS=26*60*60*1000;
const ERROR_MESSAGES=Object.freeze({
  GA4_AUTH_FAILED:'GA4 읽기 권한을 확인해 주세요.',
  GA4_RATE_LIMITED:'GA4 읽기 요청이 일시적으로 제한됐습니다.',
  GA4_TIMEOUT:'GA4 읽기 시간이 초과됐습니다.',
  GA4_NETWORK_FAILED:'GA4 자료에 연결하지 못했습니다.',
  GA4_TOKEN_FAILED:'GA4 읽기 토큰을 발급받지 못했습니다.',
  GA4_CONFIG_INVALID:'GA4 읽기 설정을 확인해 주세요.',
  GA4_RESPONSE_INVALID:'GA4 응답 형식을 확인할 수 없습니다.',
  GA4_PROVIDER_FAILED:'GA4 제공자 응답을 확인할 수 없습니다.'
});
const inFlightByScope=new Map();

const iso=value=>new Date(value).toISOString();
function database(db){const value=typeof db==='function'?db():db;if(!value||typeof value.from!=='function')throw new Error('GA4 measurement storage is unavailable');return value;}
function configuredScope(config,now){
  const missing=[];
  let host='';
  try{
    const site=new URL(config.siteUrl);
    if(site.protocol!=='https:'||!site.hostname||site.username||site.password)missing.push('자사몰 주소');
    else host=site.hostname.toLowerCase();
  }catch{missing.push('자사몰 주소');}
  if(typeof config.propertyId!=='string'||!/^[0-9]+$/.test(config.propertyId))missing.push('GA4 속성 ID');
  if(typeof config.clientEmail!=='string'||!config.clientEmail.trim())missing.push('서비스 계정 이메일');
  if(typeof config.privateKey!=='string'||!config.privateKey.trim())missing.push('서비스 계정 비밀키');
  if(Number.isNaN(new Date(now).getTime()))missing.push('측정 시각');
  return {host,missingFields:[...new Set(missing)],scopeHash:host&&missing.length===0?crypto.createHash('sha256').update(`${config.propertyId}\0${host}`).digest('hex'):''};
}

function readiness(env,now){
  const config=configModule.providerConfig('GA4',env);
  const declared=configModule.missingFields('GA4',config);
  const scope=configuredScope(config,now);
  return {config,host:scope.host,scopeHash:scope.scopeHash,missingFields:[...new Set([...declared,...scope.missingFields])]};
}

function gatedState({config,missingFields}){
  const status=config.enabled?(missingFields.length?'SETUP_REQUIRED':'VERIFY_REQUIRED'):'LOCKED';
  return {
    status,missingFields,canRefresh:false,report:null,lastAttemptAt:null,lastSuccessAt:null,
    previousSuccess:false,error:null,trackingVerification:'VERIFY_REQUIRED',
    automation:{schedule:SCHEDULE,status:status==='LOCKED'?'LOCKED':'SETUP_REQUIRED'}
  };
}

function safeReport(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==ecommerce.MEASUREMENT_VERSION||value.source!=='GA4_DATA_API')return null;
  const stages=Array.isArray(value.stages)?value.stages.map(stage=>({
    eventName:typeof stage?.eventName==='string'?stage.eventName:null,
    label:typeof stage?.label==='string'?stage.label:null,
    eventCount:Number.isSafeInteger(stage?.eventCount)?stage.eventCount:null,
    users:Number.isSafeInteger(stage?.users)?stage.users:null,
    observed:stage?.observed===true
  })):[];
  return {
    version:value.version,source:value.source,host:typeof value.host==='string'?value.host:null,
    fetchedAt:typeof value.fetchedAt==='string'?value.fetchedAt:null,
    window:{startDate:value.window?.startDate??null,endDate:value.window?.endDate??null,timeZone:value.window?.timeZone??null},
    currencyCode:value.currencyCode??null,
    coverage:{events:value.coverage?.events??null,transactions:value.coverage?.transactions??null,reasons:Array.isArray(value.coverage?.reasons)?value.coverage.reasons.filter(item=>typeof item==='string'):[]},
    status:['OBSERVED','NO_DATA','PARTIAL'].includes(value.status)?value.status:'PARTIAL',stages,
    money:{grossPurchaseRevenue:Number.isFinite(value.money?.grossPurchaseRevenue)?value.money.grossPurchaseRevenue:null,refundAmount:Number.isFinite(value.money?.refundAmount)?value.money.refundAmount:null},
    diagnostics:{
      missingPurchaseIdEvents:Number.isSafeInteger(value.diagnostics?.missingPurchaseIdEvents)?value.diagnostics.missingPurchaseIdEvents:null,
      missingRefundIdEvents:Number.isSafeInteger(value.diagnostics?.missingRefundIdEvents)?value.diagnostics.missingRefundIdEvents:null,
      duplicatePurchaseIds:Number.isSafeInteger(value.diagnostics?.duplicatePurchaseIds)?value.diagnostics.duplicatePurchaseIds:null,
      repeatedRefundIds:Number.isSafeInteger(value.diagnostics?.repeatedRefundIds)?value.diagnostics.repeatedRefundIds:null
    },
    trackingVerification:'VERIFY_REQUIRED',notes:Array.isArray(value.notes)?value.notes.filter(item=>typeof item==='string').slice(0,12):[]
  };
}

function errorMessage(code){return ERROR_MESSAGES[String(code||'')]||'GA4 측정 자료를 불러오지 못했습니다.';}

async function latestSnapshot(db,scopeHash,{usable=false}={}){
  let query=db.from('owned_site_api_snapshots')
    .select('id,provider,status,metric_summary,source_timestamp,fetched_at,error_code,metadata')
    .eq('provider','GA4').eq('metadata->>kind',KIND).eq('metadata->>scopeHash',scopeHash);
  if(usable)query=query.in('status',['SUCCESS','NO_DATA']);
  const result=await query.order('fetched_at',{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}

function configuredBase(missingFields=[]){
  return {
    status:'VERIFY_REQUIRED',missingFields,canRefresh:true,report:null,lastAttemptAt:null,lastSuccessAt:null,
    previousSuccess:false,error:null,trackingVerification:'VERIFY_REQUIRED',automation:{schedule:SCHEDULE,status:'SCHEDULED'}
  };
}

async function saveSnapshot(db,{config,scopeHash,report,error,now}){
  const code=String(error?.code||'GA4_READ_FAILED');
  const failed=Boolean(error);
  const row={
    provider:'GA4',site_url:new URL(config.siteUrl).origin,
    status:failed?'FAILED':report.status==='NO_DATA'?'NO_DATA':'SUCCESS',
    metric_summary:failed?{}:{ecommerce:report},quota_summary:{},
    source_timestamp:failed?null:report.fetchedAt,fetched_at:iso(now),
    error_code:failed?code:null,error_message:failed?errorMessage(code):null,
    metadata:{kind:KIND,scopeHash,calculationVersion:ecommerce.MEASUREMENT_VERSION,read_only:true,contains_customer_data:false}
  };
  const result=await db.from('owned_site_api_snapshots').insert(row).select('id,provider,status,fetched_at').single();
  if(result.error){const failure=new Error('GA4 측정 결과를 저장하지 못했습니다.');failure.code='GA4_SNAPSHOT_SAVE_FAILED';throw failure;}
  return result.data;
}

function kstDate(now){return new Date(new Date(now).getTime()+9*60*60*1000).toISOString().slice(0,10);}
function publicRuntime(runtime,extraWarning=null){
  if(!runtime&&!extraWarning)return undefined;
  const result={
    kind:runtime?.kind||null,cached:runtime?.cached===true,deduplicated:runtime?.deduplicated===true,
    staleFallback:runtime?.staleFallback===true
  };
  if(runtime?.ledgerWarning||extraWarning)result.warning='실행 기록 저장 상태를 확인해 주세요.';
  return result;
}

async function recoverStaleReadLease(db,requestInput,now){
  const requestHash=requestGuard.requestHash('GA4',requestInput);
  const cutoff=iso(new Date(new Date(now).getTime()-120*1000));
  try{
    const found=await db.from('provider_request_runs').select('id,status,started_at')
      .eq('provider','GA4').eq('request_hash',requestHash).eq('status','RUNNING')
      .lt('started_at',cutoff).order('started_at',{ascending:false}).limit(1).maybeSingle();
    if(found.error)throw found.error;
    const row=found.data;
    if(!row)return null;
    const updated=await db.from('provider_request_runs').update({
      status:'FAILED',finished_at:iso(now),error_code:'GA4_STALE_READ_LEASE',
      metadata:{provider_isolated:true,response_cached:false,contains_customer_data:false,stale_read_recovered:true}
    }).eq('provider','GA4').eq('request_hash',requestHash).eq('id',row.id)
      .eq('status','RUNNING').eq('started_at',row.started_at).select('id').maybeSingle();
    if(updated.error||!updated.data)return 'RUNTIME_LEDGER_UNAVAILABLE';
    return null;
  }catch{return 'RUNTIME_LEDGER_UNAVAILABLE';}
}

async function getState({db,env=process.env,now=new Date()}={}){
  const ready=readiness(env,now);
  if(!ready.config.enabled||ready.missingFields.length)return gatedState(ready);
  const base=configuredBase(ready.missingFields);
  try{
    const storage=database(db);
    const [attempt,usable]=await Promise.all([
      latestSnapshot(storage,ready.scopeHash),latestSnapshot(storage,ready.scopeHash,{usable:true})
    ]);
    if(!attempt)return base;
    const savedReport=safeReport(usable?.metric_summary?.ecommerce);
    const failed=attempt.status==='FAILED';
    let status=failed?'FAILED':(safeReport(attempt.metric_summary?.ecommerce)?.status||attempt.status||'VERIFY_REQUIRED');
    if(!failed&&savedReport&&new Date(now).getTime()-new Date(usable.fetched_at).getTime()>STALE_MS)status='STALE';
    return {...base,status,report:savedReport,lastAttemptAt:attempt.fetched_at||null,lastSuccessAt:usable?.fetched_at||null,
      previousSuccess:Boolean(failed&&savedReport),error:failed?errorMessage(attempt.error_code):null};
  }catch{
    return {...base,status:'FAILED',error:'저장된 측정 자료를 불러오지 못했습니다.'};
  }
}

async function performRefresh({db,env,now,fetchImpl},ready){
  const storage=database(db);
  const requestInput={kind:KIND,scopeHash:ready.scopeHash,date:kstDate(now)};
  const recoveryWarning=await recoverStaleReadLease(storage,requestInput,now);
  let guarded;
  try{
    guarded=await requestGuard.protectedRead({
      db:storage,provider:'GA4',requestInput,ttlMs:15*60*1000,allowStaleFallback:false,
      killSwitchEnabled:ready.config.enabled,missingFields:ready.missingFields,now,
      execute:async()=>{
        try{
          const collected=await ecommerce.collectEcommerce({config:ready.config,fetchImpl,now});
          const snapshot=await saveSnapshot(storage,{config:ready.config,scopeHash:ready.scopeHash,report:collected,now});
          return {provider:'GA4',status:collected.status,snapshot};
        }catch(error){
          await saveSnapshot(storage,{config:ready.config,scopeHash:ready.scopeHash,error,now});
          throw error;
        }
      }
    });
  }catch(error){
    const state=await getState({db:storage,env,now});
    if(state.status==='FAILED'){
      const runtime=publicRuntime(null,recoveryWarning);
      return {...state,...(runtime?{runtime:{...runtime,kind:'FAILED'}}:{})};
    }
    return {...state,status:'FAILED',previousSuccess:Boolean(state.report),error:errorMessage(error?.code),
      ...(recoveryWarning?{runtime:{kind:'FAILED',cached:false,deduplicated:false,staleFallback:false,warning:'실행 기록 저장 상태를 확인해 주세요.'}}:{})};
  }
  const state=await getState({db:storage,env,now});
  const runtime=publicRuntime(guarded?.runtime,recoveryWarning);
  if(guarded?.runtime?.kind==='DEDUPLICATED')return {...state,status:'IN_FLIGHT',canRefresh:false,runtime:{...runtime,kind:'IN_FLIGHT'}};
  return {...state,...(runtime?{runtime}: {})};
}

async function refresh({db,env=process.env,now=new Date(),fetchImpl=fetch}={}){
  const ready=readiness(env,now);
  if(!ready.config.enabled||ready.missingFields.length)return gatedState(ready);
  const existing=inFlightByScope.get(ready.scopeHash);
  if(existing)return existing;
  const promise=performRefresh({db,env,now,fetchImpl},ready)
    .catch(()=>({...configuredBase(ready.missingFields),status:'FAILED',error:'저장된 측정 자료를 불러오지 못했습니다.'}))
    .finally(()=>inFlightByScope.delete(ready.scopeHash));
  inFlightByScope.set(ready.scopeHash,promise);
  return promise;
}
async function runScheduled({db,env=process.env,now=new Date(),fetchImpl=fetch}={}){
  const ready=readiness(env,now);
  if(!ready.config.enabled)return {skipped:true,status:'LOCKED',reason:'GA4 자동 수집이 서버 안전 스위치로 잠겨 있습니다.'};
  if(ready.missingFields.length)return {skipped:true,status:'SETUP_REQUIRED',reason:'GA4 자동 수집에 필요한 서버 설정이 없습니다.'};
  return refresh({db,env,now,fetchImpl});
}

module.exports={getState,refresh,runScheduled};
