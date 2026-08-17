'use strict';

const crypto=require('node:crypto');
const projects=require('./projects.js');
const configModule=require('../market-context/config.js');
const kamis=require('../market-context/kamis-price.js');
const weather=require('../market-context/kma-weather.js');
const youtube=require('../market-context/youtube-search.js');
const utils=require('../public-evidence/candidate-utils.js');

const ADAPTERS=Object.freeze({KAMIS_PRICE:kamis,KMA_WEATHER:weather,YOUTUBE_SEARCH:youtube});
const PROVIDER_SET=new Set(Object.values(configModule.PROVIDERS));
const SNAPSHOT_SELECT='id,project_id,master_product_id,provider,query_key,query_text,status,result_count,result_payload,error_code,error_message,fetched_at,expires_at,created_at';
const SOURCE_SELECT='id,project_id,display_name,source_url,ingest_status,ocr_engine,owner_confirmed,created_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';

class MarketContextEvidenceError extends Error{constructor(message,status=400,code='MARKET_CONTEXT_INVALID'){super(message);this.name='MarketContextEvidenceError';this.status=status;this.code=code;}}
function normalizeProviders(value){const source=Array.isArray(value)?value:Object.values(configModule.PROVIDERS);const providers=[...new Set(source.map(item=>utils.cleanText(item,40).toUpperCase()).filter(item=>PROVIDER_SET.has(item)))];if(!providers.length)throw new MarketContextEvidenceError('확인할 시장 자료를 1개 이상 선택해주세요.');return providers;}
function defaultPriceQuery(name){return utils.cleanText(name,100).replace(/\([^)]*\)|\[[^\]]*\]/gu,' ').split(/[\s·,/]+/u)[0].replace(/(티백|분말|환|즙|차)$/u,'').trim().slice(0,50)||utils.cleanText(name,50);}
function snapshotKey(provider,query){return crypto.createHash('sha256').update(`${provider}\n${utils.cleanText(query,200)}`).digest('hex');}
function configOrError(provider,env){const config=configModule.providerConfig(provider,env),missing=configModule.missingFields(provider,config);if(!config.enabled)throw new MarketContextEvidenceError('이 자료 공급자는 서버 안전 스위치로 중지되어 있습니다.',423,'MARKET_CONTEXT_PROVIDER_DISABLED');if(missing.length)throw new MarketContextEvidenceError(`필요한 서버 설정: ${missing.join(', ')}`,412,'MARKET_CONTEXT_CONFIG_REQUIRED');return config;}
function providerError(provider,error){const definition=configModule.DEFINITIONS.find(item=>item.provider===provider);return {provider,label:definition?.label||provider,code:utils.cleanText(error?.code||'MARKET_CONTEXT_READ_FAILED',80),message:utils.cleanText(error?.message||'시장 자료를 읽지 못했습니다.',220)};}
function readinessFor(definition,{env,snapshots=[]}){
  const config=configModule.providerConfig(definition.provider,env),missing=configModule.missingFields(definition.provider,config),rows=snapshots.filter(item=>item.provider===definition.provider),latest=rows[0]||null,latestSuccess=rows.find(item=>['READY','PARTIAL'].includes(item.status)&&Number(item.result_count)>0)||null;
  let status=!config.enabled?'LOCKED':missing.length?'SETUP_REQUIRED':!latest?'VERIFY_REQUIRED':latest.status;
  if(latest?.status==='FAILED'&&latestSuccess)status='STALE';
  const summary={LOCKED:'서버 안전 스위치로 중지되어 있어요.',SETUP_REQUIRED:'개발계획 완료 뒤 키를 한 번에 연결해요.',VERIFY_REQUIRED:'설정 후 첫 읽기 확인이 필요해요.',READY:'최근 공식 자료를 확인했어요.',PARTIAL:'일부 자료만 확인했어요.',NO_DATA:'조건에 맞는 자료가 없어요.',FAILED:'최근 확인이 실패했어요.',STALE:'최근 실패해 이전 성공 자료를 보존해요.'}[status];
  return {...definition,status,configured:missing.length===0,enabled:config.enabled,missing_fields:missing,last_attempt_at:latest?.fetched_at||null,last_success_at:latestSuccess?.fetched_at||null,result_count:Number((status==='STALE'?latestSuccess:latest)?.result_count||0),summary,detail:missing.length?`필요한 설정 · ${missing.join(' · ')}`:latest?.error_message||summary};
}

async function loadWorkbench({db,projectId,env=process.env}){
  const {project,product}=await projects.loadProject({db,projectId}),productName=product?.name||project.product_snapshot?.name||'선택 상품';
  const query=await db.from('market_context_snapshots').select(SNAPSHOT_SELECT).eq('project_id',project.id).eq('master_product_id',project.master_product_id).order('fetched_at',{ascending:false}).limit(120);if(query.error)throw query.error;
  const savedQuery=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').in('ocr_engine',Object.values(configModule.PROVIDERS)).order('created_at',{ascending:false}).limit(120);if(savedQuery.error)throw savedQuery.error;
  const snapshots=query.data||[],providers=configModule.DEFINITIONS.map(definition=>readinessFor(definition,{env,snapshots})),savedSources=savedQuery.data||[];
  return {phase:'19-5',product:{id:project.master_product_id,name:productName},defaults:{price_query:defaultPriceQuery(productName),video_query:productName,weather_region:'광주·전남',providers:Object.values(configModule.PROVIDERS)},providers,saved_sources:savedSources,summary:{configured:providers.filter(item=>item.configured&&item.enabled).length,attention:providers.filter(item=>!['READY','PARTIAL'].includes(item.status)).length,recent_results:providers.reduce((sum,item)=>sum+item.result_count,0),saved:savedSources.length}};
}
async function storeSnapshot({db,project,provider,queryText,result,error,now,ttlHours=12}){
  const fetchedAt=new Date(now),expiresAt=new Date(fetchedAt.getTime()+ttlHours*3600000),payload=(result?.candidates||[]).slice(0,20).map(({candidate_token,...candidate})=>candidate);
  const insert=await db.from('market_context_snapshots').insert({project_id:project.id,master_product_id:project.master_product_id,provider,query_key:snapshotKey(provider,queryText),query_text:utils.cleanText(queryText,200),status:error?'FAILED':result?.status||'NO_DATA',result_count:payload.length,result_payload:payload,error_code:error?utils.cleanText(error.code||'MARKET_CONTEXT_READ_FAILED',80):null,error_message:error?utils.cleanText(error.message,500):null,fetched_at:fetchedAt.toISOString(),expires_at:expiresAt.toISOString()}).select(SNAPSHOT_SELECT).single();
  if(insert.error)throw insert.error;return insert.data;
}
async function collectEvidence({db,projectId,input={},env=process.env,fetchImpl=fetch,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId}),productName=product?.name||project.product_snapshot?.name||'선택 상품',selected=normalizeProviders(input.providers),priceQuery=utils.cleanText(input.price_query||defaultPriceQuery(productName),80),videoQuery=utils.cleanText(input.video_query||productName,100),results=[],errors=[];
  await Promise.all(selected.map(async provider=>{
    const queryText=provider===configModule.PROVIDERS.KAMIS_PRICE?priceQuery:provider===configModule.PROVIDERS.YOUTUBE_SEARCH?videoQuery:(env.KMA_FORECAST_REGION_LABEL||'광주·전남');let config;
    try{config=configOrError(provider,env);const result=provider===configModule.PROVIDERS.KAMIS_PRICE?await kamis.probe({config,query:priceQuery,fetchImpl,now}):provider===configModule.PROVIDERS.YOUTUBE_SEARCH?await youtube.probe({config,query:videoQuery,fetchImpl,now}):await weather.probe({config,fetchImpl,now});await storeSnapshot({db,project,provider,queryText,result,now,ttlHours:config.ttlHours});results.push(result);}
    catch(error){errors.push(providerError(provider,error));if(config)try{await storeSnapshot({db,project,provider,queryText,error,now,ttlHours:config.ttlHours});}catch(snapshotError){errors.push(providerError(provider,snapshotError));}}
  }));
  const candidates=results.flatMap(result=>result.candidates||[]).map(candidate=>({...candidate,candidate_token:utils.signCandidate(candidate)}));
  return {product:{id:project.master_product_id,name:productName},queries:{price:priceQuery,video:videoQuery,weather_region:env.KMA_FORECAST_REGION_LABEL||'광주·전남'},results:results.map(result=>({provider:result.provider,status:result.status,total_count:result.totalCount||0,reason:result.reason||null,quota_cost:result.quotaCost||0})),errors,candidates,summary:{providers:selected.length,success:results.filter(item=>item.status==='READY').length,no_data:results.filter(item=>item.status==='NO_DATA').length,failed:errors.filter((item,index,array)=>array.findIndex(other=>other.provider===item.provider)===index).length,candidates:candidates.length}};
}

const METADATA_KEYS=Object.freeze({KAMIS_PRICE:['product_name','product_no','unit','today_price','previous_price','direction','change'],KMA_WEATHER:['region_code','region_label','effective_at','temperature','precipitation_probability','sky','weather'],YOUTUBE_SEARCH:['video_id','channel_title','published_at']});
function candidateFromInput(input={}){
  const provider=utils.cleanText(input.provider,40).toUpperCase();if(!PROVIDER_SET.has(provider))throw new MarketContextEvidenceError('지원하지 않는 시장 자료 공급자입니다.');
  const sourceUrl=utils.safeUrl(input.source_url),host=sourceUrl?new URL(sourceUrl).hostname.toLowerCase():'';const allowed=provider==='KAMIS_PRICE'?host==='www.kamis.or.kr':provider==='KMA_WEATHER'?host==='apihub.kma.go.kr':host==='www.youtube.com'||host==='youtube.com';if(!sourceUrl||!allowed)throw new MarketContextEvidenceError('공식 원문 주소를 확인하지 못했습니다.',400,'MARKET_CONTEXT_URL_INVALID');
  const metadata=Object.fromEntries((METADATA_KEYS[provider]||[]).map(key=>[key,utils.cleanText(input.metadata?.[key],key==='weather'?500:180)||null]));const fetched=new Date(input.fetched_at);if(Number.isNaN(fetched.getTime()))throw new MarketContextEvidenceError('자료 수집 시각을 확인하지 못했습니다.');
  const candidate={provider,evidence_kind:utils.cleanText(input.evidence_kind,60),title:utils.cleanText(input.title,180),summary:utils.cleanText(input.summary,4000),source_url:sourceUrl,source_name:utils.cleanText(input.source_name,160),source_date:input.source_date?utils.dateValue(input.source_date):null,image_url:utils.safeUrl(input.image_url),external_id:utils.cleanText(input.external_id,160),fetched_at:fetched.toISOString(),metadata};if(!candidate.title||!candidate.summary||!candidate.external_id)throw new MarketContextEvidenceError('시장 근거 후보의 필수 정보를 확인하지 못했습니다.');candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);if(!utils.verifyCandidate(candidate,input.candidate_token))throw new MarketContextEvidenceError('시장 근거 후보 확인값이 달라 저장을 중지했습니다. 다시 조회해주세요.',409,'MARKET_CONTEXT_SIGNATURE_MISMATCH');
  let lookup=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();if(lookup.error)throw lookup.error;let source=lookup.data;
  if(!source){const inserted=await db.from('market_sources').insert({project_id:project.id,source_kind:'API',display_name:candidate.title,source_url:candidate.source_url,ingest_status:'REVIEW_REQUIRED',ocr_text:[`[${candidate.source_name}]`,candidate.source_date&&`기준일: ${candidate.source_date}`,candidate.summary].filter(Boolean).join('\n').slice(0,200000),ocr_confidence:1,ocr_engine:candidate.provider,ocr_error:'시장·날씨·영상 자료는 인과관계나 판매 문구가 아닙니다. 사장님 확인 후에만 근거로 사용합니다.',uploaded_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(SOURCE_SELECT).single();if(inserted.error)throw inserted.error;source=inserted.data;}
  const existing=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {source,evidence:existing.data,duplicate:true};
  const insertedEvidence=await db.from('market_evidence').insert({project_id:project.id,source_id:source.id,evidence_type:'PROXY',label:`${candidate.source_name} · ${candidate.title}`.slice(0,160),value_text:candidate.summary,source_locator:{provider:candidate.provider,evidence_kind:candidate.evidence_kind,external_id:candidate.external_id,source_url:candidate.source_url,source_date:candidate.source_date,metadata:candidate.metadata},confidence:.8,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(EVIDENCE_SELECT).single();if(insertedEvidence.error){if(!lookup.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw insertedEvidence.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'MARKET_CONTEXT_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:insertedEvidence.data.id,provider:candidate.provider,external_id:candidate.external_id,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:utils.cleanText(actor,160)||'OWNER'});if(version.error)throw version.error;return {source,evidence:insertedEvidence.data,duplicate:false};
}

module.exports={ADAPTERS,MarketContextEvidenceError,normalizeProviders,defaultPriceQuery,snapshotKey,readinessFor,loadWorkbench,collectEvidence,candidateFromInput,saveCandidate};
