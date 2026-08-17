'use strict';

const projects=require('./projects.js');
const configModule=require('../public-evidence/config.js');
const foodProduct=require('../public-evidence/food-product.js');
const foodRecall=require('../public-evidence/food-recall.js');
const koreanLaw=require('../public-evidence/korean-law.js');
const utils=require('../public-evidence/candidate-utils.js');

const ADAPTERS=Object.freeze({
  FOOD_SAFETY_PRODUCT:foodProduct,
  FOOD_SAFETY_RECALL:foodRecall,
  KOREAN_LAW:koreanLaw
});
const PROVIDER_SET=new Set(Object.values(configModule.PROVIDERS));
const SOURCE_SELECT='id,project_id,display_name,source_url,ingest_status,ocr_engine,owner_confirmed,created_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';

class MarketOfficialEvidenceError extends Error{
  constructor(message,status=400,code='OFFICIAL_EVIDENCE_INVALID'){super(message);this.name='MarketOfficialEvidenceError';this.status=status;this.code=code;}
}

function normalizeProviders(value){
  const source=Array.isArray(value)?value:Object.values(configModule.PROVIDERS);
  const providers=[...new Set(source.map(item=>utils.cleanText(item,40).toUpperCase()).filter(item=>PROVIDER_SET.has(item)))];
  if(!providers.length)throw new MarketOfficialEvidenceError('확인할 공식 자료를 1개 이상 선택해주세요.');
  return providers;
}

function normalizeReportNumbers(value){
  const source=Array.isArray(value)?value:String(value||'').split(/[\s,;]+/u);
  return [...new Set(source.map(item=>utils.cleanText(item,80)).filter(Boolean))].slice(0,5);
}

function providerError(provider,error){
  const definition=configModule.DEFINITIONS.find(item=>item.provider===provider);
  return {provider,label:definition?.label||provider,code:utils.cleanText(error?.code||'OFFICIAL_EVIDENCE_READ_FAILED',80),message:utils.cleanText(error?.message||'공식 자료를 읽지 못했습니다.',220)};
}

function readinessFor(definition,{env,sources=[]}){
  const config=configModule.providerConfig(definition.provider,env),missing=configModule.missingFields(definition.provider,config);
  const providerSources=sources.filter(item=>item.ocr_engine===definition.provider),latest=providerSources[0]||null;
  const status=!config.enabled?'LOCKED':missing.length?'SETUP_REQUIRED':latest?'READY':'VERIFY_REQUIRED';
  return {...definition,status,configured:missing.length===0,enabled:config.enabled,missing_fields:missing,saved_count:providerSources.length,last_success_at:latest?.created_at||null,
    summary:{LOCKED:'서버 안전 스위치로 중지되어 있어요.',SETUP_REQUIRED:'마지막 키 연결 단계에서 한 번에 설정해요.',VERIFY_REQUIRED:'설정 후 첫 읽기 확인이 필요해요.',READY:'이 상품에 저장된 공식 근거가 있어요.'}[status],
    detail:missing.length?`필요한 설정 · ${missing.join(' · ')}`:providerSources.length?`이 상품 전용 저장 근거 ${providerSources.length}개`:'저장된 공식 근거가 아직 없습니다.'};
}

async function loadWorkbench({db,projectId,env=process.env}){
  const {project,product}=await projects.loadProject({db,projectId});
  const saved=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').in('ocr_engine',Object.values(configModule.PROVIDERS)).order('created_at',{ascending:false}).limit(120);
  if(saved.error)throw saved.error;
  const sources=saved.data||[],providers=configModule.DEFINITIONS.map(definition=>readinessFor(definition,{env,sources}));
  return {phase:'19-2',product:{id:project.master_product_id,name:product?.name||project.product_snapshot?.name||'선택 상품'},defaults:{query:product?.name||project.product_snapshot?.name||'',law_terms:koreanLaw.DEFAULT_TERMS,providers:Object.values(configModule.PROVIDERS)},providers,saved_sources:sources,summary:{configured:providers.filter(item=>item.configured&&item.enabled).length,saved:sources.length,attention:providers.filter(item=>!['READY'].includes(item.status)).length}};
}

function configOrError(provider,env){
  const config=configModule.providerConfig(provider,env),missing=configModule.missingFields(provider,config);
  if(!config.enabled)throw new MarketOfficialEvidenceError('이 공식 자료 공급자는 서버 안전 스위치로 중지되어 있습니다.',423,'OFFICIAL_EVIDENCE_PROVIDER_DISABLED');
  if(missing.length)throw new MarketOfficialEvidenceError(`필요한 서버 설정: ${missing.join(', ')}`,412,'OFFICIAL_EVIDENCE_CONFIG_REQUIRED');
  return config;
}

async function collectEvidence({db,projectId,input={},env=process.env,fetchImpl=fetch,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId});
  const productName=product?.name||project.product_snapshot?.name||'선택 상품';
  const query=utils.cleanText(input.query||productName,100),selected=normalizeProviders(input.providers),results=[],errors=[];
  let reportNumbers=normalizeReportNumbers(input.report_numbers),productResult=null;

  if(selected.includes(configModule.PROVIDERS.FOOD_SAFETY_PRODUCT)){
    try{productResult=await foodProduct.probe({config:configOrError(configModule.PROVIDERS.FOOD_SAFETY_PRODUCT,env),query,fetchImpl,now});results.push(productResult);reportNumbers=normalizeReportNumbers([...reportNumbers,...productResult.candidates.map(item=>item.metadata.report_no)]);}
    catch(error){errors.push(providerError(configModule.PROVIDERS.FOOD_SAFETY_PRODUCT,error));}
  }
  if(selected.includes(configModule.PROVIDERS.FOOD_SAFETY_RECALL)){
    try{results.push(await foodRecall.probe({config:configOrError(configModule.PROVIDERS.FOOD_SAFETY_RECALL,env),reportNumbers,fetchImpl,now}));}
    catch(error){errors.push(providerError(configModule.PROVIDERS.FOOD_SAFETY_RECALL,error));}
  }
  if(selected.includes(configModule.PROVIDERS.KOREAN_LAW)){
    try{results.push(await koreanLaw.probe({config:configOrError(configModule.PROVIDERS.KOREAN_LAW,env),terms:input.law_terms,fetchImpl,now}));}
    catch(error){errors.push(providerError(configModule.PROVIDERS.KOREAN_LAW,error));}
  }

  const candidates=results.flatMap(result=>result.candidates||[]).map(candidate=>({...candidate,candidate_token:utils.signCandidate(candidate)}));
  return {product:{id:project.master_product_id,name:productName},query,report_numbers:reportNumbers,results:results.map(result=>({provider:result.provider,status:result.status,total_count:result.totalCount||0,reason:result.reason||null,partial_errors:result.errors||[]})),errors,candidates,summary:{providers:selected.length,success:results.filter(item=>item.status==='SUCCESS').length,no_data:results.filter(item=>item.status==='NO_DATA').length,failed:errors.length,candidates:candidates.length}};
}

const METADATA_KEYS=Object.freeze({
  FOOD_SAFETY_PRODUCT:['product_name','report_no','manufacturer','food_type','ingredients','permission_date','changed_at','license_no'],
  FOOD_SAFETY_RECALL:['product_name','report_no','manufacturer','recall_reason','recall_grade','recall_method','barcode','unit','manufactured_at','distribution_limit','product_type','recall_sequence'],
  KOREAN_LAW:['query','law_name','law_id','law_serial','law_type','department','revision_type','promulgation_no','promulgated_at','effective_at','history_status']
});

function candidateFromInput(input={}){
  const provider=utils.cleanText(input.provider,40).toUpperCase();if(!PROVIDER_SET.has(provider))throw new MarketOfficialEvidenceError('지원하지 않는 공식 자료 공급자입니다.');
  const sourceUrl=utils.safeUrl(input.source_url),host=sourceUrl?new URL(sourceUrl).hostname.toLowerCase():'';
  const allowed=provider==='KOREAN_LAW'?host==='www.law.go.kr':host==='www.foodsafetykorea.go.kr';
  if(!sourceUrl||!allowed)throw new MarketOfficialEvidenceError('공식 원문 주소를 확인하지 못했습니다.',400,'OFFICIAL_EVIDENCE_URL_INVALID');
  const metadata=Object.fromEntries((METADATA_KEYS[provider]||[]).map(key=>[key,typeof input.metadata?.[key]==='string'?utils.cleanText(input.metadata[key],key==='ingredients'||key.includes('reason')||key.includes('method')?1800:180):input.metadata?.[key]??null]));
  const fetchedDate=new Date(input.fetched_at);if(Number.isNaN(fetchedDate.getTime()))throw new MarketOfficialEvidenceError('공식 근거 수집 시각을 확인하지 못했습니다. 다시 조회해주세요.');
  const candidate={provider,evidence_kind:utils.cleanText(input.evidence_kind,60),title:utils.cleanText(input.title,180),summary:utils.cleanText(input.summary,4000),source_url:sourceUrl,source_name:utils.cleanText(input.source_name,160),source_date:input.source_date?utils.dateValue(input.source_date):null,image_url:utils.safeUrl(input.image_url),external_id:utils.cleanText(input.external_id,160),fetched_at:fetchedDate.toISOString(),metadata};
  if(!candidate.title||!candidate.summary||!candidate.external_id)throw new MarketOfficialEvidenceError('공식 근거 후보의 필수 정보를 확인하지 못했습니다.');
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);
  if(!utils.verifyCandidate(candidate,input.candidate_token))throw new MarketOfficialEvidenceError('공식 근거 후보 확인값이 달라 저장을 중지했습니다. 다시 조회해주세요.',409,'OFFICIAL_EVIDENCE_SIGNATURE_MISMATCH');
  let sourceResult=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();
  if(sourceResult.error)throw sourceResult.error;let source=sourceResult.data;
  if(!source){
    const context=[`[${candidate.source_name}]`,candidate.source_date&&`기준일: ${candidate.source_date}`,`공급자: ${candidate.provider}`,candidate.summary].filter(Boolean).join('\n');
    const inserted=await db.from('market_sources').insert({project_id:project.id,source_kind:'API',display_name:candidate.title,source_url:candidate.source_url,ingest_status:'REVIEW_REQUIRED',ocr_text:context.slice(0,200000),ocr_confidence:1,ocr_engine:candidate.provider,ocr_error:'공식 API 자료라도 선택 상품과의 관련성 및 해석은 사장님 확인 후 확정합니다.',uploaded_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(SOURCE_SELECT).single();
    if(inserted.error)throw inserted.error;source=inserted.data;
  }
  const existing=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)return {source,evidence:existing.data,duplicate:true};
  const evidenceResult=await db.from('market_evidence').insert({project_id:project.id,source_id:source.id,evidence_type:'MEASURED',label:`${candidate.source_name} · ${candidate.title}`.slice(0,160),value_text:candidate.summary,source_locator:{provider:candidate.provider,evidence_kind:candidate.evidence_kind,external_id:candidate.external_id,source_url:candidate.source_url,source_date:candidate.source_date,metadata:candidate.metadata},confidence:.95,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(EVIDENCE_SELECT).single();
  if(evidenceResult.error){if(!sourceResult.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw evidenceResult.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'OFFICIAL_EVIDENCE_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:evidenceResult.data.id,provider:candidate.provider,external_id:candidate.external_id,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:utils.cleanText(actor,160)||'OWNER'});
  if(version.error)throw version.error;return {source,evidence:evidenceResult.data,duplicate:false};
}

module.exports={ADAPTERS,MarketOfficialEvidenceError,normalizeProviders,normalizeReportNumbers,providerError,readinessFor,loadWorkbench,collectEvidence,candidateFromInput,saveCandidate};
