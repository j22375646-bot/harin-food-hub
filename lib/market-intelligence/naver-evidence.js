'use strict';

const crypto=require('node:crypto');
const projects=require('./projects.js');
const naverTrends=require('./naver-trends.js');
const naverApiHub=require('../naver-api-hub/client.js');
const reliability=require('../naver-api-hub/reliability.js');

const SOURCE_TYPES=Object.freeze({
  BLOG:{label:'네이버 블로그',icon:'document'},
  CAFE:{label:'네이버 카페',icon:'customer'},
  KIN:{label:'네이버 지식iN',icon:'help'},
  NEWS:{label:'네이버 뉴스',icon:'news'}
});
const DEFAULT_TYPES=Object.freeze(Object.keys(SOURCE_TYPES));
const SORTS=new Set(['sim','date','point']);

class MarketNaverEvidenceError extends Error{
  constructor(message,status=400,code='MARKET_NAVER_EVIDENCE_INVALID'){
    super(message);this.name='MarketNaverEvidenceError';this.status=status;this.code=code;
  }
}

const cleanText=(value,max=4000)=>String(value??'')
  .replace(/<[^>]*>/gu,' ')
  .replace(/&nbsp;|&#160;/giu,' ')
  .replace(/&amp;/giu,'&').replace(/&quot;/giu,'"').replace(/&#39;|&apos;/giu,"'")
  .replace(/&lt;/giu,'<').replace(/&gt;/giu,'>')
  .replace(/&#(\d+);/gu,(_,code)=>{const point=Number(code);return Number.isInteger(point)&&point>=0&&point<=0x10ffff?String.fromCodePoint(point):' ';})
  .replace(/\s+/gu,' ').trim().slice(0,max);

function safeUrl(value){
  const text=String(value||'').trim();
  try{
    const url=new URL(text);
    if(!['http:','https:'].includes(url.protocol))throw new Error('protocol');
    url.hash='';
    return url.toString().slice(0,2000);
  }catch{throw new MarketNaverEvidenceError('원문 주소를 확인하지 못했습니다.',400,'NAVER_EVIDENCE_URL_INVALID');}
}

function normalizeQuery(value,{productName}={}){
  const query=cleanText(value||naverTrends.productKeyword(productName),100);
  if(!query)throw new MarketNaverEvidenceError('검색어를 입력해주세요.');
  return query;
}

function normalizeTypes(value){
  const source=Array.isArray(value)?value:DEFAULT_TYPES;
  const types=[...new Set(source.map(item=>cleanText(item,20).toUpperCase()).filter(type=>SOURCE_TYPES[type]))].slice(0,4);
  if(!types.length)throw new MarketNaverEvidenceError('수집할 네이버 자료를 1개 이상 선택해주세요.');
  return types;
}

function normalizePublishedAt(value,type){
  if(!value)return null;
  const text=String(value).trim();
  if(type==='BLOG'&&/^\d{8}$/u.test(text))return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`;
  const date=new Date(text);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function normalizeItem(type,row={},context={}){
  const sourceType=cleanText(type,20).toUpperCase();
  if(!SOURCE_TYPES[sourceType])throw new MarketNaverEvidenceError('지원하지 않는 네이버 자료 유형입니다.');
  const title=cleanText(row.title,240),description=cleanText(row.description,2000);
  const sourceUrl=safeUrl(sourceType==='NEWS'?(row.originallink||row.link):row.link);
  const sourceName=cleanText(sourceType==='BLOG'?row.bloggername:sourceType==='CAFE'?row.cafename:SOURCE_TYPES[sourceType].label,160);
  const publishedAt=normalizePublishedAt(sourceType==='BLOG'?row.postdate:sourceType==='NEWS'?row.pubDate:null,sourceType);
  const normalized={
    source_type:sourceType,source_label:SOURCE_TYPES[sourceType].label,query:cleanText(context.query,100),
    title:title||`${SOURCE_TYPES[sourceType].label} 검색 결과`,description:description||title||'원문에서 내용을 확인해주세요.',
    source_url:sourceUrl,source_name:sourceName||SOURCE_TYPES[sourceType].label,published_at:publishedAt,
    fetched_at:context.fetchedAt||new Date().toISOString()
  };
  normalized.external_key=crypto.createHash('sha256').update(`${sourceType}\n${sourceUrl}`).digest('hex');
  return normalized;
}

function signaturePayload(candidate){
  return ['source_type','query','title','description','source_url','source_name','published_at','fetched_at','external_key']
    .map(key=>String(candidate[key]??'')).join('\n');
}

function signingSecret(){
  try{return naverApiHub.getConfig().clientSecret;}
  catch(error){throw new MarketNaverEvidenceError(error.message,Number(error.status)||503,error.code||'NAVER_API_HUB_CONFIG_REQUIRED');}
}

function signCandidate(candidate,secret=signingSecret()){
  return crypto.createHmac('sha256',secret).update(signaturePayload(candidate)).digest('hex');
}

function verifyCandidate(candidate,token,secret=signingSecret()){
  const expected=Buffer.from(signCandidate(candidate,secret),'hex'),received=Buffer.from(String(token||''),'hex');
  return expected.length===received.length&&crypto.timingSafeEqual(expected,received);
}

async function startLog(db,metadata){
  const result=await db.from('sync_logs').insert({platform:'NAVER',job_type:'API_HUB_SEARCH_EVIDENCE_COLLECT',status:'RUNNING',metadata}).select('id').single();
  return result.error?null:result.data.id;
}
async function finishLog(db,id,values){if(id)await db.from('sync_logs').update({finished_at:new Date().toISOString(),...values}).eq('id',id);}

async function loadDailyUsage(db,now=new Date()){
  const result=await db.from('sync_logs').select('started_at,finished_at,metadata,status')
    .eq('platform','NAVER').eq('job_type','API_HUB_SEARCH_EVIDENCE_COLLECT')
    .gte('started_at',reliability.kstDayStartIso(now)).order('started_at',{ascending:false}).limit(1000);
  if(result.error)throw result.error;
  return reliability.quotaState({rows:result.data||[],now});
}

async function loadCacheRows(db,{projectId,productId,types}){
  const result=await db.from('market_naver_search_cache')
    .select('id,source_type,cache_key,result_payload,result_count,data_status,fetched_at,expires_at')
    .eq('project_id',projectId).eq('master_product_id',productId).in('source_type',types)
    .order('fetched_at',{ascending:false}).limit(40);
  if(result.error)throw result.error;
  return result.data||[];
}

async function storeCache(db,{project,sourceType,key,query,sort,display,items,fetchedAt,cacheMinutes}){
  const expiresAt=new Date(new Date(fetchedAt).getTime()+cacheMinutes*60*1000).toISOString();
  const result=await db.from('market_naver_search_cache').upsert({
    project_id:project.id,master_product_id:project.master_product_id,source_type:sourceType,cache_key:key,
    query_text:query,sort_mode:sort,display_count:display,result_payload:items,result_count:items.length,
    data_status:items.length?'READY':'NO_DATA',fetched_at:fetchedAt,expires_at:expiresAt,updated_at:fetchedAt
  },{onConflict:'project_id,source_type,cache_key'});
  if(result.error)throw result.error;
}

function signedResults(items,status){
  return (Array.isArray(items)?items:[]).map(item=>({...item,cache_status:status,candidate_token:signCandidate(item)}));
}

async function loadReliability(db,{project,now=new Date()}={}){
  const enabled=reliability.searchEnabled(),cacheMinutes=reliability.searchCacheMinutes();
  try{
    const [quota,cacheResult,lastResult]=await Promise.all([
      loadDailyUsage(db,now),
      db.from('market_naver_search_cache').select('id',{count:'exact',head:true}).eq('project_id',project.id).eq('master_product_id',project.master_product_id).gte('expires_at',now.toISOString()),
      db.from('sync_logs').select('finished_at,started_at,status').eq('platform','NAVER').eq('job_type','API_HUB_SEARCH_EVIDENCE_COLLECT').in('status',['SUCCESS','PARTIAL']).order('finished_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    if(cacheResult.error)throw cacheResult.error;
    if(lastResult.error)throw lastResult.error;
    return {enabled,cache_minutes:cacheMinutes,cache_rows:cacheResult.count||0,last_success_at:lastResult.data?.finished_at||lastResult.data?.started_at||null,...quota,status:enabled?quota.blocked?'QUOTA_BLOCKED':quota.warning?'WARNING':'READY':'DISABLED'};
  }catch(error){
    return {enabled,cache_minutes:cacheMinutes,cache_rows:null,last_success_at:null,used:null,budget:reliability.searchDailyBudget(),official_limit:reliability.OFFICIAL_SEARCH_DAILY_LIMIT,remaining:null,warning:false,blocked:false,status:'VERIFY_REQUIRED',message:'호출량과 캐시 상태를 확인하지 못했습니다. 검색 실행 전 다시 확인해주세요.'};
  }
}

async function loadWorkbench({db,projectId}){
  const {project,product}=await projects.loadProject({db,projectId});
  const saved=await db.from('market_sources').select('id,display_name,source_url,ingest_status,owner_confirmed,created_at').eq('project_id',project.id).eq('source_kind','API').eq('ocr_engine','NAVER_API_HUB_SEARCH').order('created_at',{ascending:false}).limit(40);
  if(saved.error)throw saved.error;
  const rows=saved.data||[];
  const reliabilityState=await loadReliability(db,{project});
  return {
    product:{id:project.master_product_id,name:product?.name||project.product_snapshot?.name||'선택 상품'},
    defaults:{query:naverTrends.productKeyword(product?.name||project.product_snapshot?.name),types:DEFAULT_TYPES,display:5,sort:'sim'},
    readiness:{configured:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),...reliabilityState},
    saved_sources:rows,
    summary:{saved:rows.length,verified:rows.filter(item=>item.ingest_status==='VERIFIED').length,review_required:rows.filter(item=>item.ingest_status!=='VERIFIED').length}
  };
}

async function searchEvidence({db,projectId,input={},actor='OWNER'}){
  const {project,product}=await projects.loadProject({db,projectId});
  const productName=product?.name||project.product_snapshot?.name||'선택 상품';
  const query=normalizeQuery(input.query,{productName}),types=normalizeTypes(input.types);
  const display=Math.min(10,Math.max(1,Number.parseInt(input.display,10)||5));
  const requestedSort=cleanText(input.sort||'sim',10),sort=SORTS.has(requestedSort)?requestedSort:'sim';
  const now=new Date(),fetchedAt=now.toISOString(),cacheMinutes=reliability.searchCacheMinutes(),enabled=reliability.searchEnabled();
  const keys=Object.fromEntries(types.map(type=>[type,reliability.cacheKey({query,type,sort:type==='KIN'?sort:sort==='point'?'sim':sort,display})]));
  const quota=await loadDailyUsage(db,now),results=[],errors=[],cacheWrites=[];
  let cacheRows=[];
  try{cacheRows=await loadCacheRows(db,{projectId:project.id,productId:project.master_product_id,types});}
  catch{errors.push({source_type:'CACHE',source_label:'재사용 캐시',code:'CACHE_READ_FAILED',message:'재사용 캐시를 확인하지 못해 새 검색 결과로 계속 진행합니다.'});}
  const logId=await startLog(db,{project_id:project.id,master_product_id:project.master_product_id,query,types,display,sort,actor:cleanText(actor,160)||'OWNER',request_count:0,cache_hits:0});
  const cacheByType=new Map(cacheRows.filter(row=>row.cache_key===keys[row.source_type]).map(row=>[row.source_type,row]));
  const liveTypes=[];
  for(const type of types){
    const cached=cacheByType.get(type),fresh=cached&&new Date(cached.expires_at).getTime()>now.getTime();
    if(fresh)results.push(...signedResults(cached.result_payload,'HIT'));
    else liveTypes.push(type);
  }
  let requestTypes=liveTypes;
  if(!enabled){
    requestTypes=[];
    for(const type of liveTypes){
      const cached=cacheByType.get(type);
      if(cached)results.push(...signedResults(cached.result_payload,'STALE_FALLBACK'));
      errors.push({source_type:type,source_label:SOURCE_TYPES[type].label,code:'NAVER_API_HUB_SEARCH_DISABLED',message:cached?'검색 수집이 일시 중지되어 이전 성공 자료를 표시합니다.':'검색 수집이 서버에서 일시 중지됐습니다.'});
    }
  }else if(liveTypes.length>quota.remaining){
    requestTypes=[];
    for(const type of liveTypes){
      const cached=cacheByType.get(type);
      if(cached)results.push(...signedResults(cached.result_payload,'STALE_FALLBACK'));
      errors.push({source_type:type,source_label:SOURCE_TYPES[type].label,code:'NAVER_API_HUB_SEARCH_QUOTA_BLOCKED',message:cached?'오늘 호출 예산에 도달해 이전 성공 자료를 표시합니다.':'오늘 검색 호출 예산에 도달했습니다.'});
    }
  }
  const settled=await Promise.allSettled(requestTypes.map(type=>naverApiHub.fetchSearch({type,query,display,sort:type==='KIN'?sort:sort==='point'?'sim':sort})));
  settled.forEach((result,index)=>{
    const type=requestTypes[index];
    if(result.status==='rejected'){
      const cached=cacheByType.get(type);
      if(cached)results.push(...signedResults(cached.result_payload,'STALE_FALLBACK'));
      errors.push({source_type:type,source_label:SOURCE_TYPES[type].label,code:result.reason?.code||'SEARCH_FAILED',message:cached?'새 자료를 가져오지 못해 이전 성공 자료를 표시합니다.':cleanText(result.reason?.message||'검색 실패',240)});
    }else{
      const normalized=[];
      for(const row of result.value.data?.items||[]){try{normalized.push(normalizeItem(type,row,{query,fetchedAt}));}catch(error){errors.push({source_type:type,source_label:SOURCE_TYPES[type].label,code:error.code||'ITEM_INVALID',message:error.message});}}
      results.push(...signedResults(normalized,'FRESH'));
      cacheWrites.push(storeCache(db,{project,sourceType:type,key:keys[type],query,sort:type==='KIN'?sort:sort==='point'?'sim':sort,display,items:normalized,fetchedAt,cacheMinutes}));
    }
  });
  const cacheWriteResults=await Promise.allSettled(cacheWrites);
  if(cacheWriteResults.some(item=>item.status==='rejected'))errors.push({source_type:'CACHE',source_label:'재사용 캐시',code:'CACHE_WRITE_FAILED',message:'검색 결과는 표시했지만 재사용 캐시 저장을 다시 확인해주세요.'});
  const deduped=[...new Map(results.map(item=>[item.external_key,item])).values()];
  const cacheSummary={hits:deduped.filter(item=>item.cache_status==='HIT').length,fresh:deduped.filter(item=>item.cache_status==='FRESH').length,stale:deduped.filter(item=>item.cache_status==='STALE_FALLBACK').length,ttl_minutes:cacheMinutes};
  const finalQuota={...quota,used:quota.used+requestTypes.length,remaining:Math.max(0,quota.remaining-requestTypes.length)};
  await finishLog(db,logId,{status:deduped.length?errors.length?'PARTIAL':'SUCCESS':errors.length?'FAILED':'SUCCESS',rows_received:deduped.length,error_message:errors.length?errors.map(item=>`${item.source_label}: ${item.message}`).join(' | ').slice(0,500):null,metadata:{project_id:project.id,master_product_id:project.master_product_id,query,types,display,sort,result_count:deduped.length,error_count:errors.length,request_count:requestTypes.length,cache_hits:cacheSummary.hits,stale_fallbacks:cacheSummary.stale,search_enabled:enabled,daily_budget:quota.budget}});
  if(!deduped.length&&errors.length){const first=errors[0],status=first.code==='NAVER_API_HUB_SEARCH_QUOTA_BLOCKED'?429:first.code==='NAVER_API_HUB_SEARCH_DISABLED'?503:502;throw new MarketNaverEvidenceError(first.message,status,first.code);}
  return {query,types,display,sort,fetched_at:fetchedAt,results:deduped,errors,cache_summary:cacheSummary,quota:finalQuota,data_status:deduped.length?errors.length?'PARTIAL':'READY':'NO_DATA',safety:{owner_verification_required:true,automatic_fact_confirmation:false,external_page_fetch:false,ai_calls:false}};
}

function candidateFromInput(input={}){
  const type=cleanText(input.source_type,20).toUpperCase();
  const candidate=normalizeItem(type,{title:input.title,description:input.description,link:input.source_url,originallink:input.source_url,bloggername:input.source_name,cafename:input.source_name,postdate:input.published_at,pubDate:input.published_at},{query:normalizeQuery(input.query),fetchedAt:input.fetched_at});
  candidate.source_name=cleanText(input.source_name,160)||candidate.source_name;
  candidate.published_at=input.published_at?normalizePublishedAt(input.published_at,type):candidate.published_at;
  candidate.external_key=crypto.createHash('sha256').update(`${type}\n${candidate.source_url}`).digest('hex');
  return candidate;
}

async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);
  if(!verifyCandidate(candidate,input.candidate_token))throw new MarketNaverEvidenceError('검색 결과 확인값이 달라 저장을 중지했습니다. 다시 검색해주세요.',409,'NAVER_EVIDENCE_SIGNATURE_MISMATCH');
  let sourceResult=await db.from('market_sources').select('id,project_id,display_name,source_url,ingest_status,owner_confirmed,created_at').eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();
  if(sourceResult.error)throw sourceResult.error;
  let source=sourceResult.data;
  if(!source){
    const context=[`[${candidate.source_label}]`,`검색어: ${candidate.query}`,candidate.published_at?`게시일: ${candidate.published_at}`:null,`출처: ${candidate.source_name}`,candidate.description].filter(Boolean).join('\n');
    const inserted=await db.from('market_sources').insert({
      project_id:project.id,source_kind:'API',display_name:candidate.title,source_url:candidate.source_url,
      ingest_status:'REVIEW_REQUIRED',ocr_text:context.slice(0,200000),ocr_confidence:1,ocr_engine:'NAVER_API_HUB_SEARCH',
      ocr_error:'검색 결과는 사실 확정이 아닙니다. 원문과 상품 관련성을 사장님이 확인해주세요.',uploaded_at:candidate.fetched_at,
      created_by:cleanText(actor,160)||'OWNER'
    }).select('id,project_id,display_name,source_url,ingest_status,owner_confirmed,created_at').single();
    if(inserted.error)throw inserted.error;source=inserted.data;
  }
  const existingEvidence=await db.from('market_evidence').select('id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at').eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();
  if(existingEvidence.error)throw existingEvidence.error;
  if(existingEvidence.data)return {source,evidence:existingEvidence.data,duplicate:true};
  const evidenceResult=await db.from('market_evidence').insert({
    project_id:project.id,source_id:source.id,evidence_type:'PROXY',label:`${candidate.source_label} 근거 후보 · ${candidate.title}`.slice(0,160),
    value_text:candidate.description.slice(0,4000),source_locator:{provider:'NAVER_API_HUB',source_type:candidate.source_type,query:candidate.query,published_at:candidate.published_at,source_name:candidate.source_name,source_url:candidate.source_url,external_key:candidate.external_key},
    confidence:0.75,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:cleanText(actor,160)||'OWNER'
  }).select('id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at').single();
  if(evidenceResult.error){if(!sourceResult.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw evidenceResult.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'NAVER_SEARCH_EVIDENCE_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:evidenceResult.data.id,source_type:candidate.source_type,query:candidate.query,source_url:candidate.source_url,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:cleanText(actor,160)||'OWNER'});
  if(version.error)throw version.error;
  return {source,evidence:evidenceResult.data,duplicate:false};
}

module.exports={
  SOURCE_TYPES,DEFAULT_TYPES,MarketNaverEvidenceError,cleanText,safeUrl,normalizeQuery,normalizeTypes,
  normalizePublishedAt,normalizeItem,signCandidate,verifyCandidate,loadDailyUsage,loadCacheRows,storeCache,loadReliability,loadWorkbench,searchEvidence,candidateFromInput,saveCandidate
};
