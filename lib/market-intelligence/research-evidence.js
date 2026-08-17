'use strict';

const projects=require('./projects.js');
const configModule=require('../research-evidence/config.js');
const pubmed=require('../research-evidence/pubmed.js');
const clinicalTrials=require('../research-evidence/clinical-trials.js');
const crossref=require('../research-evidence/crossref.js');
const utils=require('../public-evidence/candidate-utils.js');

const ADAPTERS=Object.freeze({PUBMED:pubmed,CLINICAL_TRIALS:clinicalTrials,CROSSREF:crossref});
const SEARCH_PROVIDER_SET=new Set(configModule.SEARCH_PROVIDERS);
const PROVIDER_SET=new Set(Object.values(configModule.PROVIDERS));
const SOURCE_SELECT='id,project_id,display_name,source_url,ingest_status,ocr_engine,owner_confirmed,created_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';

class MarketResearchEvidenceError extends Error{
  constructor(message,status=400,code='RESEARCH_EVIDENCE_INVALID'){super(message);this.name='MarketResearchEvidenceError';this.status=status;this.code=code;}
}

function normalizeProviders(value){
  const source=Array.isArray(value)?value:configModule.SEARCH_PROVIDERS;
  const providers=[...new Set(source.map(item=>utils.cleanText(item,40).toUpperCase()).filter(item=>SEARCH_PROVIDER_SET.has(item)))];
  if(!providers.length)throw new MarketResearchEvidenceError('확인할 연구자료를 1개 이상 선택해주세요.');
  return providers;
}

function providerError(provider,error){
  const definition=configModule.DEFINITIONS.find(item=>item.provider===provider);
  return {provider,label:definition?.label||provider,code:utils.cleanText(error?.code||'RESEARCH_EVIDENCE_READ_FAILED',80),message:utils.cleanText(error?.message||'연구자료를 읽지 못했습니다.',220)};
}

function readinessFor(definition,{env,sources=[]}){
  const config=configModule.providerConfig(definition.provider,env),providerSources=sources.filter(item=>item.ocr_engine===definition.provider),latest=providerSources[0]||null;
  const optionalKey=definition.provider===configModule.PROVIDERS.PUBMED&&!config.apiKey;
  const status=!config.enabled?'LOCKED':latest?'READY':optionalKey?'FREE_READY':'VERIFY_REQUIRED';
  const summary={LOCKED:'서버 안전 스위치로 중지되어 있어요.',READY:'이 상품에 저장된 연구 근거가 있어요.',FREE_READY:'키 없이 저속 수동 조회가 가능해요.',VERIFY_REQUIRED:'무료 수동 읽기 확인이 필요해요.'}[status];
  return {...definition,status,configured:config.enabled,enabled:config.enabled,missing_fields:[],saved_count:providerSources.length,last_success_at:latest?.created_at||null,optional_key:optionalKey,summary,detail:definition.provider===configModule.PROVIDERS.PUBMED?(config.apiKey?'API 키 적용 · 높은 호출 한도':'API 키 선택 · 현재 무료 기본 한도 사용'):definition.provider===configModule.PROVIDERS.CROSSREF?'키 없는 DOI 메타데이터 보완':providerSources.length?`이 상품 전용 저장 근거 ${providerSources.length}개`:'키 없는 공식 등록자료 수동 조회'};
}

async function loadWorkbench({db,projectId,env=process.env}){
  const {project,product}=await projects.loadProject({db,projectId});
  const saved=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').in('ocr_engine',configModule.SEARCH_PROVIDERS).order('created_at',{ascending:false}).limit(120);
  if(saved.error)throw saved.error;
  const sources=saved.data||[],providers=configModule.DEFINITIONS.map(definition=>readinessFor(definition,{env,sources}));
  return {phase:'20-1',product:{id:project.master_product_id,name:product?.name||project.product_snapshot?.name||'선택 상품'},defaults:{query:product?.name||project.product_snapshot?.name||'',providers:configModule.SEARCH_PROVIDERS,include_citation_metadata:true},providers,saved_sources:sources,summary:{available:providers.filter(item=>item.enabled).length,saved:sources.length,free:providers.filter(item=>item.enabled&&!item.optional_key).length,pubmed_optional_key:providers.find(item=>item.provider==='PUBMED')?.optional_key||false}};
}

function configOrError(provider,env){
  const config=configModule.providerConfig(provider,env);
  if(!config.enabled)throw new MarketResearchEvidenceError('이 연구자료 공급자는 서버 안전 스위치로 중지되어 있습니다.',423,'RESEARCH_EVIDENCE_PROVIDER_DISABLED');
  return config;
}

async function enrichPubmed(candidates,{env,fetchImpl,errors}){
  let config;try{config=configOrError(configModule.PROVIDERS.CROSSREF,env);}catch(error){errors.push(providerError(configModule.PROVIDERS.CROSSREF,error));return candidates;}
  const settled=await Promise.allSettled(candidates.slice(0,10).map(candidate=>crossref.enrichCandidate(candidate,{config,fetchImpl})));
  return settled.map((result,index)=>{
    if(result.status==='fulfilled')return result.value;
    errors.push(providerError(configModule.PROVIDERS.CROSSREF,result.reason));return candidates[index];
  });
}

async function collectEvidence({db,projectId,input={},env=process.env,fetchImpl=fetch,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId}),productName=product?.name||project.product_snapshot?.name||'선택 상품';
  const query=utils.cleanText(input.query||productName,140),selected=normalizeProviders(input.providers),limit=Math.min(10,Math.max(1,Number(input.limit)||6)),results=[],errors=[];
  const jobs=selected.map(async provider=>{
    if(provider===configModule.PROVIDERS.PUBMED)return pubmed.probe({config:configOrError(provider,env),query,limit,fetchImpl,now});
    return clinicalTrials.probe({config:configOrError(provider,env),query,limit,fetchImpl,now});
  });
  const settled=await Promise.allSettled(jobs);
  settled.forEach((result,index)=>{if(result.status==='fulfilled')results.push(result.value);else errors.push(providerError(selected[index],result.reason));});
  const pubmedResult=results.find(item=>item.provider===configModule.PROVIDERS.PUBMED);
  if(pubmedResult&&input.include_citation_metadata!==false)pubmedResult.candidates=await enrichPubmed(pubmedResult.candidates,{env,fetchImpl,errors});
  const candidates=results.flatMap(result=>result.candidates||[]).map(candidate=>({...candidate,candidate_token:utils.signCandidate(candidate)}));
  return {product:{id:project.master_product_id,name:productName},query,results:results.map(result=>({provider:result.provider,status:result.status,total_count:result.totalCount||0,has_more:Boolean(result.hasMore)})),errors,candidates,summary:{providers:selected.length,success:results.filter(item=>item.status==='SUCCESS').length,no_data:results.filter(item=>item.status==='NO_DATA').length,failed:errors.length,candidates:candidates.length}};
}

const cleanArray=(value,max=8,length=180)=>(Array.isArray(value)?value:[]).map(item=>utils.cleanText(item,length)).filter(Boolean).slice(0,max);
function metadataFromInput(provider,metadata={}){
  if(provider===configModule.PROVIDERS.PUBMED)return {pmid:utils.cleanText(metadata.pmid,40),doi:utils.cleanText(metadata.doi,200)||null,journal:utils.cleanText(metadata.journal,180),authors:cleanArray(metadata.authors,8,120),publication_types:cleanArray(metadata.publication_types,8,100),languages:cleanArray(metadata.languages,6,30),publication_date:utils.cleanText(metadata.publication_date,40)||null,citation_count:metadata.citation_count==null?null:Math.max(0,Number(metadata.citation_count)||0),crossref_publisher:utils.cleanText(metadata.crossref_publisher,180)||null,crossref_type:utils.cleanText(metadata.crossref_type,80)||null,crossref_issued:utils.cleanText(metadata.crossref_issued,40)||null,crossref_container_title:utils.cleanText(metadata.crossref_container_title,180)||null};
  return {nct_id:utils.cleanText(metadata.nct_id,40),overall_status:utils.cleanText(metadata.overall_status,80),study_type:utils.cleanText(metadata.study_type,80),phases:cleanArray(metadata.phases,6,60),conditions:cleanArray(metadata.conditions,8,160),interventions:cleanArray(metadata.interventions,8,160),enrollment:metadata.enrollment==null?null:Math.max(0,Number(metadata.enrollment)||0),lead_sponsor:utils.cleanText(metadata.lead_sponsor,180),start_date:utils.cleanText(metadata.start_date,40)||null,completion_date:utils.cleanText(metadata.completion_date,40)||null,updated_date:utils.cleanText(metadata.updated_date,40)||null};
}

function candidateFromInput(input={}){
  const provider=utils.cleanText(input.provider,40).toUpperCase();if(!SEARCH_PROVIDER_SET.has(provider))throw new MarketResearchEvidenceError('지원하지 않는 연구자료 공급자입니다.');
  const sourceUrl=utils.safeUrl(input.source_url),host=sourceUrl?new URL(sourceUrl).hostname.toLowerCase():'';
  const allowed=provider===configModule.PROVIDERS.PUBMED?host==='pubmed.ncbi.nlm.nih.gov':host==='clinicaltrials.gov';
  if(!sourceUrl||!allowed)throw new MarketResearchEvidenceError('공식 연구자료 원문 주소를 확인하지 못했습니다.',400,'RESEARCH_EVIDENCE_URL_INVALID');
  const fetchedDate=new Date(input.fetched_at);if(Number.isNaN(fetchedDate.getTime()))throw new MarketResearchEvidenceError('연구자료 수집 시각을 확인하지 못했습니다. 다시 조회해주세요.');
  const candidate={provider,evidence_kind:utils.cleanText(input.evidence_kind,60),title:utils.cleanText(input.title,300),summary:utils.cleanText(input.summary,4000),source_url:sourceUrl,source_name:utils.cleanText(input.source_name,160),source_date:input.source_date?utils.dateValue(input.source_date):null,image_url:null,external_id:utils.cleanText(input.external_id,160),fetched_at:fetchedDate.toISOString(),metadata:metadataFromInput(provider,input.metadata)};
  if(!candidate.title||!candidate.summary||!candidate.external_id)throw new MarketResearchEvidenceError('연구 근거 후보의 필수 정보를 확인하지 못했습니다.');
  candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);
  if(!utils.verifyCandidate(candidate,input.candidate_token))throw new MarketResearchEvidenceError('연구 근거 후보 확인값이 달라 저장을 중지했습니다. 다시 조회해주세요.',409,'RESEARCH_EVIDENCE_SIGNATURE_MISMATCH');
  let sourceResult=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();
  if(sourceResult.error)throw sourceResult.error;let source=sourceResult.data;
  if(!source){
    const context=[`[${candidate.source_name}]`,candidate.source_date&&`기준일: ${candidate.source_date}`,`공급자: ${candidate.provider}`,candidate.summary].filter(Boolean).join('\n');
    const inserted=await db.from('market_sources').insert({project_id:project.id,source_kind:'API',display_name:candidate.title.slice(0,180),source_url:candidate.source_url,ingest_status:'REVIEW_REQUIRED',ocr_text:context.slice(0,200000),ocr_confidence:.72,ocr_engine:candidate.provider,ocr_error:'연구 색인·등록자료는 건강기능, 치료효과 또는 판매문구가 아닙니다. 관련성과 해석은 사장님 확인 후 확정합니다.',uploaded_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(SOURCE_SELECT).single();
    if(inserted.error)throw inserted.error;source=inserted.data;
  }
  const existing=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)return {source,evidence:existing.data,duplicate:true};
  const evidenceResult=await db.from('market_evidence').insert({project_id:project.id,source_id:source.id,evidence_type:'PROXY',label:`${candidate.source_name} · ${candidate.title}`.slice(0,160),value_text:candidate.summary,source_locator:{provider:candidate.provider,evidence_kind:candidate.evidence_kind,external_id:candidate.external_id,source_url:candidate.source_url,source_date:candidate.source_date,metadata:candidate.metadata},confidence:.72,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:utils.cleanText(actor,160)||'OWNER'}).select(EVIDENCE_SELECT).single();
  if(evidenceResult.error){if(!sourceResult.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw evidenceResult.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'RESEARCH_EVIDENCE_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:evidenceResult.data.id,provider:candidate.provider,external_id:candidate.external_id,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:utils.cleanText(actor,160)||'OWNER'});
  if(version.error)throw version.error;return {source,evidence:evidenceResult.data,duplicate:false};
}

module.exports={ADAPTERS,MarketResearchEvidenceError,normalizeProviders,providerError,readinessFor,loadWorkbench,collectEvidence,metadataFromInput,candidateFromInput,saveCandidate};
