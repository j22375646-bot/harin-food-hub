'use strict';

const projects=require('./projects.js');
const configModule=require('../raw-market-evidence/config.js');
const customs=require('../raw-market-evidence/customs-trade.js');
const exim=require('../raw-market-evidence/exim-fx.js');
const kosis=require('../raw-market-evidence/kosis-search.js');
const utils=require('../public-evidence/candidate-utils.js');

const ADAPTERS=Object.freeze({KCS_TRADE:customs,KOREA_EXIM_FX:exim,KOSIS_SEARCH:kosis});
const PROVIDER_SET=new Set(Object.values(configModule.PROVIDERS));
const SOURCE_SELECT='id,project_id,display_name,source_url,ingest_status,ocr_engine,owner_confirmed,created_at';
const EVIDENCE_SELECT='id,project_id,source_id,evidence_type,label,value_text,unit,source_locator,confidence,owner_confirmed,status,captured_at,created_at,updated_at';

class RawMarketEvidenceError extends Error{
  constructor(message,status=400,code='RAW_MARKET_EVIDENCE_INVALID'){super(message);this.name='RawMarketEvidenceError';this.status=status;this.code=code;}
}

function normalizeProviders(value){
  const source=Array.isArray(value)?value:Object.values(configModule.PROVIDERS),providers=[...new Set(source.map(item=>utils.cleanText(item,40).toUpperCase()).filter(item=>PROVIDER_SET.has(item)))];
  if(!providers.length)throw new RawMarketEvidenceError('확인할 원재료·시장 자료를 1개 이상 선택해주세요.');return providers;
}

function providerError(provider,error){const definition=configModule.DEFINITIONS.find(item=>item.provider===provider);return {provider,label:definition?.label||provider,code:utils.cleanText(error?.code||'RAW_MARKET_READ_FAILED',80),message:utils.cleanText(error?.message||'시장환경 자료를 읽지 못했습니다.',220)};}

function readinessFor(definition,{env,sources=[]}){
  const config=configModule.providerConfig(definition.provider,env),missing=configModule.missingFields(definition.provider,config),providerSources=sources.filter(item=>item.ocr_engine===definition.provider),latest=providerSources[0]||null,status=!config.enabled?'LOCKED':missing.length?'SETUP_REQUIRED':latest?'READY':'VERIFY_REQUIRED';
  return {...definition,status,configured:missing.length===0,enabled:config.enabled,missing_fields:missing,saved_count:providerSources.length,last_success_at:latest?.created_at||null,summary:{LOCKED:'서버 안전 스위치로 중지되어 있어요.',SETUP_REQUIRED:'마지막 키 입력 단계에서 함께 연결해요.',VERIFY_REQUIRED:'키 설정 후 첫 수동 읽기 확인이 필요해요.',READY:'이 상품에 저장된 시장환경 근거가 있어요.'}[status],detail:missing.length?`필요한 설정 · ${missing.join(' · ')}`:providerSources.length?`이 상품 전용 저장 근거 ${providerSources.length}개`:'저장된 원재료·시장환경 근거가 아직 없습니다.'};
}

const firstIngredient=value=>utils.cleanText(value,2000).split(/[,;·]/u).map(item=>item.replace(/\([^)]*\)/gu,'').trim()).find(Boolean)||'';
const yymm=date=>`${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}`;
const ymd=date=>`${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}${String(date.getUTCDate()).padStart(2,'0')}`;

async function evidenceDefaults(db,projectId){
  const result=await db.from('market_evidence').select('source_locator,created_at').eq('project_id',projectId).order('created_at',{ascending:false}).limit(160);if(result.error)throw result.error;
  const locators=(result.data||[]).map(item=>item.source_locator).filter(Boolean),product=locators.find(item=>item.provider==='FOOD_SAFETY_PRODUCT')?.metadata||{},ingredient=locators.find(item=>item.provider==='FOOD_SAFETY_INGREDIENT')?.metadata||{};
  return {raw_material:utils.cleanText(ingredient.ingredient_name,100)||firstIngredient(product.ingredients),ingredients:utils.cleanText(product.ingredients,2000)};
}

async function loadWorkbench({db,projectId,env=process.env,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId}),[saved,defaults]=await Promise.all([db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').in('ocr_engine',Object.values(configModule.PROVIDERS)).order('created_at',{ascending:false}).limit(160),evidenceDefaults(db,project.id)]);if(saved.error)throw saved.error;
  const end=new Date(now),start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-11,1)),sources=saved.data||[],providers=configModule.DEFINITIONS.map(definition=>readinessFor(definition,{env,sources})),productName=product?.name||project.product_snapshot?.name||'선택 상품',rawMaterial=defaults.raw_material||productName;
  return {phase:'20-3',product:{id:project.master_product_id,name:productName},defaults:{raw_material:rawMaterial,hs_code:'',country_code:'CN',start_yymm:yymm(start),end_yymm:yymm(end),exchange_date:ymd(end),currencies:['USD','CNY','JPY'],kosis_query:rawMaterial,providers:Object.values(configModule.PROVIDERS)},providers,saved_sources:sources,summary:{configured:providers.filter(item=>item.enabled&&item.configured).length,saved:sources.length,waiting:providers.filter(item=>item.status==='SETUP_REQUIRED').length}};
}

function configOrError(provider,env){const config=configModule.providerConfig(provider,env),missing=configModule.missingFields(provider,config);if(!config.enabled)throw new RawMarketEvidenceError('이 자료 공급자는 서버 안전 스위치로 중지되어 있습니다.',423,'RAW_MARKET_PROVIDER_DISABLED');if(missing.length)throw new RawMarketEvidenceError(`필요한 서버 설정: ${missing.join(', ')}`,412,'RAW_MARKET_CONFIG_REQUIRED');return config;}

async function collectEvidence({db,projectId,input={},env=process.env,fetchImpl=fetch,now=new Date()}){
  const {project,product}=await projects.loadProject({db,projectId}),productName=product?.name||project.product_snapshot?.name||'선택 상품',selected=normalizeProviders(input.providers),rawMaterial=utils.cleanText(input.raw_material||productName,120),hsCode=utils.cleanText(input.hs_code,10),countryCode=utils.cleanText(input.country_code,2).toUpperCase(),startYymm=utils.cleanText(input.start_yymm,6),endYymm=utils.cleanText(input.end_yymm,6),exchangeDate=utils.cleanText(input.exchange_date,8),currencies=(Array.isArray(input.currencies)?input.currencies:[]).map(item=>utils.cleanText(item,12).toUpperCase()).filter(Boolean),kosisQuery=utils.cleanText(input.kosis_query||rawMaterial,120),results=[],errors=[];
  const jobs=selected.map(async provider=>{const config=configOrError(provider,env);if(provider===configModule.PROVIDERS.KCS_TRADE)return customs.probe({config,startYymm,endYymm,hsCode,countryCode,fetchImpl,now});if(provider===configModule.PROVIDERS.KOREA_EXIM_FX)return exim.probe({config,searchDate:exchangeDate,currencies,fetchImpl,now});return kosis.probe({config,query:kosisQuery,fetchImpl,now});});
  const settled=await Promise.allSettled(jobs);settled.forEach((result,index)=>{if(result.status==='fulfilled')results.push(result.value);else errors.push(providerError(selected[index],result.reason));});
  const candidates=results.flatMap(result=>result.candidates||[]).map(candidate=>({...candidate,candidate_token:utils.signCandidate(candidate)}));
  return {product:{id:project.master_product_id,name:productName},query:{raw_material:rawMaterial,hs_code:hsCode,country_code:countryCode,start_yymm:startYymm,end_yymm:endYymm,exchange_date:exchangeDate,currencies,kosis_query:kosisQuery},results:results.map(result=>({provider:result.provider,status:result.status,total_count:result.totalCount||0})),errors,candidates,summary:{providers:selected.length,success:results.filter(item=>item.status==='SUCCESS').length,no_data:results.filter(item=>item.status==='NO_DATA').length,failed:errors.length,candidates:candidates.length}};
}

const clean=(value,max=300)=>utils.cleanText(value,max);
const optionalNumber=value=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
function metadataFromInput(provider,value={}){
  if(provider==='KCS_TRADE')return {period:clean(value.period,20),country_name:clean(value.country_name,80),country_code:clean(value.country_code,10),item_name:clean(value.item_name,180),hs_code:clean(value.hs_code,20),import_weight_kg:optionalNumber(value.import_weight_kg),import_amount_usd:optionalNumber(value.import_amount_usd),export_weight_kg:optionalNumber(value.export_weight_kg),export_amount_usd:optionalNumber(value.export_amount_usd),trade_balance_usd:optionalNumber(value.trade_balance_usd)};
  if(provider==='KOREA_EXIM_FX')return {currency_unit:clean(value.currency_unit,30),currency_name:clean(value.currency_name,100),search_date:clean(value.search_date,8),deal_base_rate:optionalNumber(value.deal_base_rate),book_price:optionalNumber(value.book_price),kftc_book_price:optionalNumber(value.kftc_book_price),kftc_deal_base_rate:optionalNumber(value.kftc_deal_base_rate)};
  return {organization_id:clean(value.organization_id,40),organization_name:clean(value.organization_name,180),table_id:clean(value.table_id,80),table_name:clean(value.table_name,300),statistics_id:clean(value.statistics_id,80),statistics_name:clean(value.statistics_name,300),period_start:clean(value.period_start,30),period_end:clean(value.period_end,30),recommended_table:clean(value.recommended_table,20)};
}

function candidateFromInput(input={}){
  const provider=clean(input.provider,40).toUpperCase();if(!PROVIDER_SET.has(provider))throw new RawMarketEvidenceError('지원하지 않는 원재료·시장 공급자입니다.');const sourceUrl=utils.safeUrl(input.source_url),host=sourceUrl?new URL(sourceUrl).hostname.toLowerCase():'';
  const allowed=provider==='KOSIS_SEARCH'?(host==='kosis.kr'||host.endsWith('.kosis.kr')):host==='www.data.go.kr';if(!sourceUrl||!allowed)throw new RawMarketEvidenceError('공식 원재료·시장 자료 원문 주소를 확인하지 못했습니다.',400,'RAW_MARKET_URL_INVALID');
  const fetched=new Date(input.fetched_at);if(Number.isNaN(fetched.getTime()))throw new RawMarketEvidenceError('자료 수집 시각을 확인하지 못했습니다. 다시 조회해주세요.');
  const candidate={provider,evidence_kind:clean(input.evidence_kind,60),title:clean(input.title,300),summary:clean(input.summary,4000),source_url:sourceUrl,source_name:clean(input.source_name,160),source_date:input.source_date?utils.dateValue(input.source_date):null,image_url:null,external_id:clean(input.external_id,180),fetched_at:fetched.toISOString(),metadata:metadataFromInput(provider,input.metadata)};
  if(!candidate.title||!candidate.summary||!candidate.external_id)throw new RawMarketEvidenceError('원재료·시장 후보의 필수 정보를 확인하지 못했습니다.');candidate.external_key=utils.externalKey(candidate.provider,candidate.external_id,candidate.source_url);return candidate;
}

async function saveCandidate({db,projectId,input={},actor='OWNER'}){
  const {project}=await projects.loadProject({db,projectId}),candidate=candidateFromInput(input);if(!utils.verifyCandidate(candidate,input.candidate_token))throw new RawMarketEvidenceError('원재료·시장 후보 확인값이 달라 저장을 중지했습니다. 다시 조회해주세요.',409,'RAW_MARKET_SIGNATURE_MISMATCH');
  let sourceResult=await db.from('market_sources').select(SOURCE_SELECT).eq('project_id',project.id).eq('source_kind','API').eq('source_url',candidate.source_url).limit(1).maybeSingle();if(sourceResult.error)throw sourceResult.error;let source=sourceResult.data;
  if(!source){const inserted=await db.from('market_sources').insert({project_id:project.id,source_kind:'API',display_name:candidate.title.slice(0,180),source_url:candidate.source_url,ingest_status:'REVIEW_REQUIRED',ocr_text:[`[${candidate.source_name}]`,candidate.source_date&&`기준일: ${candidate.source_date}`,candidate.summary].filter(Boolean).join('\n').slice(0,200000),ocr_confidence:.76,ocr_engine:candidate.provider,ocr_error:'무역·환율·국가통계는 외부 시장 맥락입니다. 자사 수요·원가·매출의 원인으로 자동 확정하지 않습니다.',uploaded_at:candidate.fetched_at,created_by:clean(actor,160)||'OWNER'}).select(SOURCE_SELECT).single();if(inserted.error)throw inserted.error;source=inserted.data;}
  const existing=await db.from('market_evidence').select(EVIDENCE_SELECT).eq('project_id',project.id).eq('source_id',source.id).limit(1).maybeSingle();if(existing.error)throw existing.error;if(existing.data)return {source,evidence:existing.data,duplicate:true};
  const confidence=candidate.provider==='KCS_TRADE'?.82:candidate.provider==='KOREA_EXIM_FX'?.8:.7,insertedEvidence=await db.from('market_evidence').insert({project_id:project.id,source_id:source.id,evidence_type:'PROXY',label:`${candidate.source_name} · ${candidate.title}`.slice(0,160),value_text:candidate.summary,source_locator:{provider:candidate.provider,evidence_kind:candidate.evidence_kind,external_id:candidate.external_id,source_url:candidate.source_url,source_date:candidate.source_date,metadata:candidate.metadata},confidence,owner_confirmed:false,status:'OWNER_CONFIRMATION_REQUIRED',captured_at:candidate.fetched_at,created_by:clean(actor,160)||'OWNER'}).select(EVIDENCE_SELECT).single();if(insertedEvidence.error){if(!sourceResult.data)await db.from('market_sources').delete().eq('id',source.id).eq('project_id',project.id);throw insertedEvidence.error;}
  const version=await db.rpc('record_market_project_version',{p_project_id:project.id,p_reason:'RAW_MARKET_EVIDENCE_CANDIDATE_SAVED',p_snapshot:{source_id:source.id,evidence_id:insertedEvidence.data.id,provider:candidate.provider,external_id:candidate.external_id,status:'OWNER_CONFIRMATION_REQUIRED'},p_actor:clean(actor,160)||'OWNER'});if(version.error)throw version.error;return {source,evidence:insertedEvidence.data,duplicate:false};
}

module.exports={ADAPTERS,RawMarketEvidenceError,normalizeProviders,providerError,readinessFor,evidenceDefaults,loadWorkbench,collectEvidence,metadataFromInput,candidateFromInput,saveCandidate};
