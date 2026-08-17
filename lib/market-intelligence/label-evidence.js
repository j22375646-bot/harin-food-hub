'use strict';

const projects=require('./projects.js');
const configModule=require('../label-evidence/config.js');
const mfdsNutrition=require('../label-evidence/mfds-nutrition.js');
const haccp=require('../label-evidence/haccp.js');
const ingredient=require('../label-evidence/ingredient.js');
const usda=require('../label-evidence/usda.js');
const utils=require('../public-evidence/candidate-utils.js');

const ADAPTERS=Object.freeze({MFDS_NUTRITION:mfdsNutrition,FOOD_SAFETY_HACCP:haccp,FOOD_SAFETY_INGREDIENT:ingredient,USDA_FDC:usda});
const PROVIDER_SET=new Set(Object.values(configModule.PROVIDERS));
const SOURCE_SELECT='id,project_id,display_name,source_url,ingest_status,ocr_engine,owner_confirmed,created_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';
const ALLERGENS=Object.freeze(['난류','우유','메밀','땅콩','대두','밀','고등어','게','새우','돼지고기','복숭아','토마토','아황산류','호두','닭고기','쇠고기','오징어','조개류','잣']);

class MarketLabelEvidenceError extends Error{
  constructor(message,status=400,code='LABEL_EVIDENCE_INVALID'){super(message);this.name='MarketLabelEvidenceError';this.status=status;this.code=code;}
}

function normalizeProviders(value){
  const source=Array.isArray(value)?value:Object.values(configModule.PROVIDERS),providers=[...new Set(source.map(item=>utils.cleanText(item,40).toUpperCase()).filter(item=>PROVIDER_SET.has(item)))];
  if(!providers.length)throw new MarketLabelEvidenceError('확인할 표시정보 자료를 1개 이상 선택해주세요.');return providers;
}
function providerError(provider,error){const definition=configModule.DEFINITIONS.find(item=>item.provider===provider);return {provider,label:definition?.label||provider,code:utils.cleanText(error?.code||'LABEL_EVIDENCE_READ_FAILED',80),message:utils.cleanText(error?.message||'표시정보 자료를 읽지 못했습니다.',220)};}
function readinessFor(definition,{env,sources=[]}){
  const config=configModule.providerConfig(definition.provider,env),missing=configModule.missingFields(definition.provider,config),providerSources=sources.filter(item=>item.ocr_engine===definition.provider),latest=providerSources[0]||null,status=!config.enabled?'LOCKED':missing.length?'SETUP_REQUIRED':latest?'READY':'VERIFY_REQUIRED';
  return {...definition,status,configured:missing.length===0,enabled:config.enabled,missing_fields:missing,saved_count:providerSources.length,last_success_at:latest?.created_at||null,summary:{LOCKED:'서버 안전 스위치로 중지되어 있어요.',SETUP_REQUIRED:'마지막 키 연결 단계에서 한 번에 설정해요.',VERIFY_REQUIRED:'설정 후 첫 수동 읽기 확인이 필요해요.',READY:'이 상품에 저장된 비교 근거가 있어요.'}[status],detail:missing.length?`필요한 설정 · ${missing.join(' · ')}`:providerSources.length?`이 상품 전용 저장 근거 ${providerSources.length}개`:'저장된 표시정보 근거가 아직 없습니다.'};
}
function scanAllergens(value){const text=utils.cleanText(value,4000);return ALLERGENS.filter(term=>text.includes(term));}
function firstIngredient(value){return utils.cleanText(value,1000).split(/[,;·]/u).map(item=>item.replace(/\([^)]*\)/gu,'').trim()).find(Boolean)||'';}

async function officialDefaults(db,projectId){
  const result=await db.from('market_evidence').select('source_locator,created_at').eq('project_id',projectId).order('created_at',{ascending:false}).limit(120);if(result.error)throw result.error;
  const locator=(result.data||[]).map(item=>item.source_locator).find(item=>item?.provider==='FOOD_SAFETY_PRODUCT')||{},metadata=locator.metadata||{};
  return {report_number:utils.cleanText(metadata.report_no,80),license_number:utils.cleanText(metadata.license_no,80),manufacturer:utils.cleanText(metadata.manufacturer,180),ingredients:utils.cleanText(metadata.ingredients,4000)};
}
async function loadWorkbench({db,projectId,env=process.env}){
  const {project,product}=await projects.loadProject({db,projectId}),[saved,defaults]=await Promise.all([db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').in('ocr_engine',Object.values(configModule.PROVIDERS)).order('created_at',{ascending:false}).limit(120),officialDefaults(db,project.id)]);if(saved.error)throw saved.error;
  const sources=saved.data||[],providers=configModule.DEFINITIONS.map(definition=>readinessFor(definition,{env,sources})),productName=product?.name||project.product_snapshot?.name||'선택 상품';
  return {phase:'20-2',product:{id:project.master_product_id,name:productName},defaults:{query:productName,usda_query:'',report_number:defaults.report_number,license_number:defaults.license_number,ingredient_query:firstIngredient(defaults.ingredients)||productName,ingredients:defaults.ingredients,manufacturer:defaults.manufacturer,providers:Object.values(configModule.PROVIDERS)},providers,saved_sources:sources,allergen_candidates:scanAllergens(defaults.ingredients),summary:{configured:providers.filter(item=>item.enabled&&item.configured).length,saved:sources.length,waiting:providers.filter(item=>item.status==='SETUP_REQUIRED').length}};
}
function configOrError(provider,env){const config=configModule.providerConfig(provider,env),missing=configModule.missingFields(provider,config);if(!config.enabled)throw new MarketLabelEvidenceError('이 자료 공급자는 서버 안전 스위치로 중지되어 있습니다.',423,'LABEL_EVIDENCE_PROVIDER_DISABLED');if(missing.length)throw new MarketLabelEvidenceError(`필요한 서버 설정: ${missing.join(', ')}`,412,'LABEL_EVIDENCE_CONFIG_REQUIRED');return config;}
async function collectEvidence({db,projectId,input={},env=process.env,fetchImpl=fetch,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId}),productName=product?.name||project.product_snapshot?.name||'선택 상품',selected=normalizeProviders(input.providers),query=utils.cleanText(input.query||productName,140),reportNumber=utils.cleanText(input.report_number,80),licenseNumber=utils.cleanText(input.license_number,80),ingredientQuery=utils.cleanText(input.ingredient_query,100),usdaQuery=utils.cleanText(input.usda_query,140),results=[],errors=[];
  const jobs=selected.map(async provider=>{const config=configOrError(provider,env);if(provider===configModule.PROVIDERS.MFDS_NUTRITION)return mfdsNutrition.probe({config,query,reportNumber,fetchImpl,now});if(provider===configModule.PROVIDERS.FOOD_SAFETY_HACCP)return haccp.probe({config,licenseNumber,fetchImpl,now});if(provider===configModule.PROVIDERS.FOOD_SAFETY_INGREDIENT)return ingredient.probe({config,query:ingredientQuery,fetchImpl,now});return usda.probe({config,query:usdaQuery||query,fetchImpl,now});});
  const settled=await Promise.allSettled(jobs);settled.forEach((result,index)=>{if(result.status==='fulfilled')results.push(result.value);else errors.push(providerError(selected[index],result.reason));});
  const candidates=results.flatMap(result=>result.candidates||[]).map(candidate=>({...candidate,candidate_token:utils.signCandidate(candidate)})),allergenSource=utils.cleanText(input.ingredients,4000)||ingredientQuery;
  return {product:{id:project.master_product_id,name:productName},query,results:results.map(result=>({provider:result.provider,status:result.status,total_count:result.totalCount||0})),errors,candidates,allergen_candidates:scanAllergens(allergenSource),checklist:{product_report:Boolean(reportNumber),nutrition:candidates.some(item=>item.provider==='MFDS_NUTRITION'),haccp:candidates.some(item=>item.provider==='FOOD_SAFETY_HACCP'),ingredient:candidates.some(item=>item.provider==='FOOD_SAFETY_INGREDIENT'),package_original:false},summary:{providers:selected.length,success:results.filter(item=>item.status==='SUCCESS').length,no_data:results.filter(item=>item.status==='NO_DATA').length,failed:errors.length,candidates:candidates.length}};
}

const clean=(value,max=300)=>utils.cleanText(value,max);
const cleanNutrients=value=>typeof value==='object'&&value&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).slice(0,30).map(([key,item])=>[clean(key,40),{label:clean(item?.label,100),unit:clean(item?.unit,30),value:item?.value==null?null:clean(item.value,80)}])):[];
function metadataFromInput(provider,value={}){
  if(provider==='MFDS_NUTRITION')return {product_name:clean(value.product_name,180),report_no:clean(value.report_no,80),manufacturer:clean(value.manufacturer,180),serving_size:clean(value.serving_size,100),nutrition_amount_serving:clean(value.nutrition_amount_serving,100),database_class:clean(value.database_class,120),food_category:clean(value.food_category,120),nutrients:cleanNutrients(value.nutrients)};
  if(provider==='FOOD_SAFETY_HACCP')return {business_name:clean(value.business_name,180),license_no:clean(value.license_no,80),designation_no:clean(value.designation_no,100),industry:clean(value.industry,160),food_type:clean(value.food_type,180),address:clean(value.address,500),designation_date:value.designation_date?clean(value.designation_date,40):null,certificate_end_date:value.certificate_end_date?clean(value.certificate_end_date,40):null,business_status:clean(value.business_status,100),cancelled_at:value.cancelled_at?clean(value.cancelled_at,40):null};
  if(provider==='FOOD_SAFETY_INGREDIENT')return {ingredient_name:clean(value.ingredient_name,180),nicknames:clean(value.nicknames,500),scientific_name:clean(value.scientific_name,180),english_name:clean(value.english_name,180),classification:clean(value.classification,160),region:clean(value.region,160),use_condition:clean(value.use_condition,1600),use_condition_name:clean(value.use_condition_name,300)};
  return {fdc_id:clean(value.fdc_id,60),description:clean(value.description,240),data_type:clean(value.data_type,80),brand_owner:clean(value.brand_owner,180),ingredients:clean(value.ingredients,1200),serving_size:value.serving_size==null?null:Number(value.serving_size),serving_unit:clean(value.serving_unit,40),nutrients:Array.isArray(value.nutrients)?value.nutrients.slice(0,20).map(item=>({name:clean(item?.name,120),value:item?.value==null?null:Number(item.value),unit:clean(item?.unit,30)})):[]};
}
function candidateFromInput(input={}){
  const provider=utils.cleanText(input.provider,40).toUpperCase();if(!PROVIDER_SET.has(provider))throw new MarketLabelEvidenceError('지원하지 않는 표시정보 공급자입니다.');const sourceUrl=utils.safeUrl(input.source_url),host=sourceUrl?new URL(sourceUrl).hostname.toLowerCase():'';
  const allowed=provider==='MFDS_NUTRITION'?host==='www.data.go.kr':provider==='USDA_FDC'?host==='fdc.nal.usda.gov':host==='www.foodsafetykorea.go.kr';if(!sourceUrl||!allowed)throw new MarketLabelEvidenceError('공식 표시정보 원문 주소를 확인하지 못했습니다.',400,'LABEL_EVIDENCE_URL_INVALID');
  const fetchedDate=new Date(input.fetched_at);if(Number.isNaN(fetchedDate.getTime()))throw new MarketLabelEvidenceError('표시정보 수집 시각을 확인하지 못했습니다. 다시 조회해주세요.');
  const candidate={provider,evidence_kind:clean(input.evidence_kind,60),title:clean(input.title,300),summary:clean(input.summary,4000),source_url:sourceUrl,source_name:clean(input.source_name,160),source_date:input.source_date?utils.dateValue(input.source_date):null,image_url:null,external_id:clean(input.external_id,160),fetched_at:fetchedDate.toISOString(),metadata:metadataFromInput(provider,input.metadata)};
  if(!candidate.title||!candidate.summary||!candidate.external_id)throw new MarketLabelEvidenceError('표시정보 후보의 필수 정보를 확인하지 못했습니다.');candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}
async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);if(!utils.verifyCandidate(candidate,input.candidate_token))throw new MarketLabelEvidenceError('표시정보 후보 확인값이 달라 저장을 중지했습니다. 다시 조회해주세요.',409,'LABEL_EVIDENCE_SIGNATURE_MISMATCH');
  let sourceResult=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();if(sourceResult.error)throw sourceResult.error;let source=sourceResult.data;
  if(!source){const context=[`[${candidate.source_name}]`,candidate.source_date&&`기준일: ${candidate.source_date}`,`공급자: ${candidate.provider}`,candidate.summary].filter(Boolean).join('\n'),inserted=await db.from('market_sources').insert({project_id:project.id,source_kind:'API',display_name:candidate.title.slice(0,180),source_url:candidate.source_url,ingest_status:'REVIEW_REQUIRED',ocr_text:context.slice(0,200000),ocr_confidence:.78,ocr_engine:candidate.provider,ocr_error:'공식 자료라도 실제 포장 표시와 선택 상품의 동일성은 사장님 확인 후 확정합니다.',uploaded_at:candidate.fetched_at,created_by:clean(actor,160)||'OWNER'}).select(SOURCE_SELECT).single();if(inserted.error)throw inserted.error;source=inserted.data;}
  const existing=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {source,evidence:existing.data,duplicate:true};
  const confidence=candidate.provider==='USDA_FDC'?.62:candidate.provider==='FOOD_SAFETY_HACCP'?.82:.78,evidenceResult=await db.from('market_evidence').insert({project_id:project.id,source_id:source.id,evidence_type:'PROXY',label:`${candidate.source_name} · ${candidate.title}`.slice(0,160),value_text:candidate.summary,source_locator:{provider:candidate.provider,evidence_kind:candidate.evidence_kind,external_id:candidate.external_id,source_url:candidate.source_url,source_date:candidate.source_date,metadata:candidate.metadata},confidence,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:clean(actor,160)||'OWNER'}).select(EVIDENCE_SELECT).single();if(evidenceResult.error){if(!sourceResult.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw evidenceResult.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'LABEL_EVIDENCE_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:evidenceResult.data.id,provider:candidate.provider,external_id:candidate.external_id,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:clean(actor,160)||'OWNER'});if(version.error)throw version.error;return {source,evidence:evidenceResult.data,duplicate:false};
}

module.exports={ADAPTERS,ALLERGENS,MarketLabelEvidenceError,normalizeProviders,providerError,readinessFor,scanAllergens,loadWorkbench,collectEvidence,metadataFromInput,candidateFromInput,saveCandidate};
