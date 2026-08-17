'use strict';

const research=require('../research-evidence/config.js');
const publicEvidence=require('../public-evidence/config.js');
const labelEvidence=require('../label-evidence/config.js');
const rawMarket=require('../raw-market-evidence/config.js');
const marketContext=require('../market-context/config.js');

const GUARDED=new Set(['SEARCH_CONSOLE','GA4','PAGESPEED','CRUX','AWS_CLOUDWATCH','VERCEL','GITHUB_RELEASES','UPTIMEROBOT','TELEGRAM_BOT','RESEND','HOLIDAY_CALENDAR','ROAD_ADDRESS','DEEPL']);
const time=value=>new Date(value||0).getTime()||0;
const latest=rows=>[...rows].sort((a,b)=>time(b.finished_at||b.fetched_at||b.uploaded_at||b.created_at)-time(a.finished_at||a.fetched_at||a.uploaded_at||a.created_at))[0]||null;
const latestBy=(rows,key,value)=>latest(rows.filter(row=>String(row[key]||'')===value));
const STATUS_READY=new Set(['READY','SUCCESS','PARTIAL']);
function normalizeStatus(value){const status=String(value||'VERIFY_REQUIRED').toUpperCase();if(status==='SUCCESS')return 'READY';if(status==='RUNNING')return 'RUNNING';if(['READY','PARTIAL','NO_DATA','FAILED','STALE','SETUP_REQUIRED','VERIFY_REQUIRED','LOCKED','NOT_NEEDED','ELIGIBILITY_REQUIRED','READ_PROBE_REQUIRED'].includes(status))return status;return 'VERIFY_REQUIRED';}
function genericServices(module,group,href,sources,contextSnapshots,env,now){return module.DEFINITIONS.map(def=>{const config=module.providerConfig(def.provider,env);const missing=module.missingFields(def.provider,config);const source=latestBy(sources,'ocr_engine',def.provider);const context=latestBy(contextSnapshots,'provider',def.provider);const observed=context||source;let status=!config.enabled?'LOCKED':missing.length?'SETUP_REQUIRED':observed?normalizeStatus(context?.status||'READY'):'VERIFY_REQUIRED';if(context?.expires_at&&time(context.expires_at)<time(now)&&STATUS_READY.has(status))status='STALE';return {provider:def.provider,label:def.label,subtitle:def.subtitle,icon:def.icon||'database',tone:def.tone||'lavender',group,href,status,missingFields:missing,killSwitchEnabled:Boolean(config.enabled),lastAttemptAt:context?.fetched_at||source?.uploaded_at||source?.created_at||null,lastSuccessAt:context?.status==='READY'?context.fetched_at:source?.uploaded_at||source?.created_at||null,sourceTimestamp:context?.fetched_at||source?.uploaded_at||source?.created_at||null,cacheExpiresAt:context?.expires_at||null,previousSuccess:false};});}
function centerServices(center,group,href,providerMap={}){return (center?.services||[]).map(service=>({...service,provider:service.provider||providerMap[service.key]||String(service.key||'').toUpperCase(),group,href,killSwitchEnabled:service.killSwitch?.enabled??service.killSwitchEnabled??service.status!=='LOCKED',sourceTimestamp:service.lastSuccessAt||service.lastAttemptAt||null,cacheExpiresAt:null}));}
function runtimeFor(provider,runs){const rows=runs.filter(row=>row.provider===provider),attempt=latest(rows.filter(row=>!['CACHED','DEDUPLICATED','STALE_FALLBACK'].includes(row.status))),success=latest(rows.filter(row=>['SUCCESS','NO_DATA'].includes(row.status))),events={cached:rows.filter(row=>row.status==='CACHED').length,deduplicated:rows.filter(row=>row.status==='DEDUPLICATED').length,failed:rows.filter(row=>row.status==='FAILED').length,staleFallback:rows.filter(row=>row.status==='STALE_FALLBACK').length};return {attempt,success,events};}
function applyRuntime(service,runs,now){const runtime=runtimeFor(service.provider,runs),attempt=runtime.attempt,success=runtime.success;let status=normalizeStatus(service.status);if(attempt?.status==='FAILED')status=success?'STALE':'FAILED';else if(attempt?.status==='NO_DATA')status='NO_DATA';else if(attempt?.status==='SUCCESS'&&attempt.expires_at&&time(attempt.expires_at)<time(now))status='STALE';else if(attempt?.status==='SUCCESS'&&['VERIFY_REQUIRED','FAILED','STALE'].includes(status))status='READY';const quota=Object.keys(attempt?.quota_summary||{}).length?attempt.quota_summary:service.quota||service.searchQuota||null;return {...service,status,guardMode:GUARDED.has(service.provider)?'CACHE_DEDUP_FALLBACK':service.provider==='NAVER_API_HUB'?'PROVIDER_CACHE_QUOTA':service.group==='market-context'?'PRODUCT_CACHE':'SNAPSHOT_HISTORY',lastAttemptAt:attempt?.started_at||service.lastAttemptAt||null,lastSuccessAt:success?.finished_at||service.lastSuccessAt||null,sourceTimestamp:success?.source_timestamp||service.sourceTimestamp||null,cacheExpiresAt:success?.expires_at||service.cacheExpiresAt||null,previousSuccess:Boolean(service.previousSuccess||(attempt?.status==='FAILED'&&success)),quota,runtimeEvents:runtime.events};}
function buildProviderOperationsCenter({runtimeRuns=[],ownedSiteCenter={},shippingReferenceCenter={},operationsHealthCenter={},optionalProviderCenter={},naverApiCenter={},sources=[],contextSnapshots=[],env=process.env,now=new Date()}={}){
  const naver=centerServices(naverApiCenter,'naver','/data-collection/naver-api',{commerce:'NAVER_COMMERCE',searchAds:'NAVER_SEARCH_ADS',apiHub:'NAVER_API_HUB'});
  const services=[
    ...naver,
    ...centerServices(ownedSiteCenter,'owned-site','/data-collection/owned-site'),
    ...centerServices(shippingReferenceCenter,'shipping','/data-collection/shipping-reference'),
    ...centerServices(operationsHealthCenter,'operations','/data-collection/operations-health'),
    ...genericServices(marketContext,'market-context','/market-intelligence',sources,contextSnapshots,env,now),
    ...genericServices(research,'research','/market-intelligence/research',sources,contextSnapshots,env,now),
    ...genericServices(publicEvidence,'official','/market-intelligence/evidence',sources,contextSnapshots,env,now),
    ...genericServices(labelEvidence,'label','/market-intelligence/labels',sources,contextSnapshots,env,now),
    ...genericServices(rawMarket,'raw-market','/market-intelligence/raw-materials',sources,contextSnapshots,env,now),
    ...centerServices(optionalProviderCenter,'optional','/data-collection/optional-providers')
  ].map(service=>applyRuntime(service,runtimeRuns,now));
  const groups=[
    ['naver','네이버 운영 API'],['owned-site','자사몰 분석'],['shipping','출고·주소'],['operations','서버·알림'],['market-context','시장 맥락'],['research','연구 근거'],['official','공식 식품·법령'],['label','표시·원재료'],['raw-market','무역·환율·통계'],['optional','조건형 API']
  ].map(([key,label])=>({key,label,services:services.filter(item=>item.group===key)})).filter(group=>group.services.length);
  const eventTotals=services.reduce((sum,item)=>({cached:sum.cached+item.runtimeEvents.cached,deduplicated:sum.deduplicated+item.runtimeEvents.deduplicated,failed:sum.failed+item.runtimeEvents.failed,staleFallback:sum.staleFallback+item.runtimeEvents.staleFallback}),{cached:0,deduplicated:0,failed:0,staleFallback:0});
  return {phase:'20-6',generatedAt:new Date(now).toISOString(),services,groups,summary:{providers:services.length,ready:services.filter(item=>STATUS_READY.has(item.status)).length,attention:services.filter(item=>['FAILED','STALE','NO_DATA'].includes(item.status)).length,setup:services.filter(item=>['SETUP_REQUIRED','VERIFY_REQUIRED','READ_PROBE_REQUIRED','ELIGIBILITY_REQUIRED'].includes(item.status)).length,locked:services.filter(item=>['LOCKED','NOT_NEEDED'].includes(item.status)).length,...eventTotals},rules:['제공처별 자격증명·자료·할당량·실행 기록을 서로 섞지 않습니다.','캐시가 유효하면 외부 호출을 반복하지 않고, 같은 요청이 진행 중이면 중복 호출을 막습니다.','새 요청 실패 시 이전 성공 자료임을 분명히 표시하며 실패를 0건이나 정상으로 바꾸지 않습니다.','주소 검색 응답과 고객 이름·연락처·주문정보는 이 실행 기록에 저장하지 않습니다.','외부 쓰기와 입찰 변경은 이 화면에서 실행하지 않으며 사장님 승인 잠금을 유지합니다.']};
}

module.exports={buildProviderOperationsCenter,normalizeStatus,runtimeFor};
