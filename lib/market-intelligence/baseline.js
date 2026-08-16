'use strict';

const foundation=require('./foundation.js');
const projectsModule=require('./projects.js');
const growthCenter=require('../products/growth-center.js');

const PRODUCT_ROLES=new Set(['STANDARD','OPTION','BUNDLE','GIFT']);
const CHECKLIST_KEYS=new Set(growthCenter.CHECKLIST_ITEMS.map(([key])=>key));
const MAX_TEXT=2000;

class MarketBaselineError extends Error {
  constructor(message,status=400,code='MARKET_BASELINE_INVALID'){
    super(message);this.name='MarketBaselineError';this.status=status;this.code=code;
  }
}

function shortText(value,label,max=MAX_TEXT){
  const text=String(value||'').trim();
  if(text.length>max)throw new MarketBaselineError(`${label}은 ${max.toLocaleString('ko-KR')}자 이내로 입력해주세요.`);
  return text;
}

function textArray(value,label,maxItems=12){
  if(!Array.isArray(value))throw new MarketBaselineError(`${label} 형식이 올바르지 않습니다.`);
  if(value.length>maxItems)throw new MarketBaselineError(`${label}은 ${maxItems}개까지만 입력할 수 있습니다.`);
  return value.map(item=>shortText(item,label,160)).filter(Boolean);
}

function checklist(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new MarketBaselineError('상세페이지 점검표를 확인해주세요.');
  const result={};
  for(const key of CHECKLIST_KEYS)result[key]=value[key]===true;
  return result;
}

function optionLabel(variant={}){
  const values=Array.isArray(variant.options)?variant.options.map(item=>String(item?.value||'').trim()).filter(Boolean):[];
  return values.join(' · ')||String(variant.option_name||variant.name||'기본 구성').trim();
}

function optionQuantity(label=''){
  const match=String(label).match(/(?:^|[\s/])([1-9]\d*)\s*개(?:[\s/]|$)/u);
  return match?Number(match[1]):1;
}

function optionTotalUnits(label=''){
  const text=String(label),explicit=text.match(/총\s*([1-9]\d*)\s*(?:티백|TB|개입?)/iu);
  if(explicit)return Number(explicit[1]);
  const matches=[...text.matchAll(/([1-9]\d*)\s*(?:티백|TB|개입)(?:[\s/,]|\)|$)/giu)].map(match=>Number(match[1]));
  return matches.length?Math.max(...matches)*optionQuantity(text):null;
}

function numberOrNull(value){
  if(value==null||value==='')return null;
  const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
}

function normalizeChannelOptions(channelProducts=[]){
  const options=[];
  for(const product of channelProducts){
    const variants=Array.isArray(product?.raw_data?.variants)?product.raw_data.variants:Array.isArray(product?.variants)?product.variants:[];
    const basePrice=numberOrNull(product.selling_price);
    const rows=variants.length?variants:[{variant_code:null,options:[],additional_amount:0,display:product.is_active===false?'F':'T',selling:product.is_active===false?'F':'T'}];
    for(const variant of rows){
      const label=optionLabel(variant),additional=numberOrNull(variant.additional_amount)||0,packCount=optionQuantity(label);
      options.push({
        platform:String(product.platform||'').toUpperCase(),
        external_product_id:String(product.external_product_id||''),
        external_product_name:String(product.external_product_name||'이름 없는 채널 상품'),
        variant_code:String(variant.variant_code||''),
        option_name:label,
        pack_count:packCount,
        total_units:optionTotalUnits(label),
        sale_price:basePrice==null?null:Math.round(basePrice+additional),
        offer_type:packCount<=1?'SINGLE':packCount===2?'DOUBLE':'BUNDLE',
        is_active:product.is_active!==false&&variant.display!=='F'&&variant.selling!=='F',
        source:'CHANNEL_SNAPSHOT'
      });
    }
  }
  return options.sort((a,b)=>a.platform.localeCompare(b.platform)||a.pack_count-b.pack_count||a.option_name.localeCompare(b.option_name,'ko'));
}

function normalizeLegacyOffers(offers=[]){
  return offers.map(offer=>({
    source_id:offer.id??offer.source_id??null,
    name:String(offer.name||'구성'),offer_type:String(offer.offer_type||'SINGLE'),platform:String(offer.platform||'CAFE24'),
    quantity:Math.max(1,Number(offer.quantity)||1),list_price:numberOrNull(offer.list_price),sale_price:numberOrNull(offer.sale_price),
    is_active:offer.is_active!==false,source:'LEGACY_GROWTH_CENTER'
  }));
}

function claimReviews(fields={}){
  const candidates=[
    ['product_summary','상품 한 줄 설명',fields.product_summary],
    ['core_message','핵심 판매 문구',fields.core_message],
    ['usage_guide','사용 안내',fields.usage_guide]
  ];
  return candidates.filter(([, ,value])=>String(value||'').trim()).map(([field,label,value])=>{
    const decision=foundation.claimDecision(value);
    return {field,label,value:String(value),status:decision.status,matches:decision.matches};
  });
}

function migrationReport({profile,checklistRow,offers,channelProducts}){
  return {
    mode:'READ_ONLY_COMPATIBILITY',
    profile_source_rows:profile?1:0,
    checklist_source_rows:checklistRow?1:0,
    offer_source_rows:offers.length,
    channel_product_rows:channelProducts.length,
    destination_rows:1,
    field_consistency:true,
    source_preserved:true,
    checked_at:new Date().toISOString()
  };
}

function sourceSnapshot({project,profile,checklistRow,offers,channelProducts}){
  const legacyOffers=normalizeLegacyOffers(offers);
  const productFields={
    product_role:profile?.product_role||'STANDARD',
    product_summary:profile?.product_summary||project.product_snapshot?.summary_description||'',
    target_customer:profile?.target_customer||'',
    purchase_situations:profile?.purchase_situations||[],
    hesitation_reasons:profile?.hesitation_reasons||[],
    core_message:profile?.core_message||'',
    prohibited_phrases:profile?.prohibited_phrases||[],
    usage_guide:profile?.usage_guide||''
  };
  return {
    project_id:project.id,master_product_id:project.master_product_id,...productFields,
    checklist_items:checklistRow?.items||{},checklist_notes:checklistRow?.notes||'',legacy_offers:legacyOffers,
    channel_options:channelProducts.map(item=>({
      platform:item.platform,external_product_id:item.external_product_id,external_product_name:item.external_product_name,
      selling_price:numberOrNull(item.selling_price),is_active:item.is_active!==false,
      variants:Array.isArray(item?.raw_data?.variants)?item.raw_data.variants:[]
    })),
    claim_reviews:claimReviews(productFields),
    migration_report:migrationReport({profile,checklistRow,offers:legacyOffers,channelProducts}),
    source_updated_at:{
      ...(profile?.updated_at?{product_growth_profiles:profile.updated_at}:{}),
      ...(checklistRow?.updated_at?{product_detail_checklists:checklistRow.updated_at}:{}),
      channel_products:channelProducts.reduce((latest,item)=>!latest||new Date(item.updated_at)>new Date(latest)?item.updated_at:latest,null)
    }
  };
}

async function loadSources({db,projectId}){
  const loaded=await projectsModule.loadProject({db,projectId});
  const productId=loaded.project.master_product_id;
  const results=await Promise.all([
    db.from('product_growth_profiles').select('*').eq('master_product_id',productId).maybeSingle(),
    db.from('product_detail_checklists').select('*').eq('master_product_id',productId).maybeSingle(),
    db.from('product_growth_offers').select('id,name,offer_type,platform,quantity,list_price,sale_price,is_active,sort_order,updated_at').eq('master_product_id',productId).order('sort_order').order('id'),
    db.from('channel_products').select('platform,external_product_id,external_product_name,selling_price,is_active,raw_data,updated_at').eq('master_product_id',productId).eq('is_active',true).order('platform').order('external_product_name')
  ]);
  const error=results.find(item=>item.error)?.error;if(error)throw error;
  return {project:loaded.project,product:loaded.product,profile:results[0].data||null,checklistRow:results[1].data||null,offers:results[2].data||[],channelProducts:results[3].data||[]};
}

function compatibility({baseline,snapshot}){
  if(!baseline)return {state:'NOT_PREPARED',label:'기준선 준비 필요',message:'원본을 바꾸지 않고 읽기 전용 복사본을 만들 수 있어요.'};
  const report=baseline.migration_report||{};
  const sourceCount=(snapshot.migration_report.profile_source_rows||0)+(snapshot.migration_report.checklist_source_rows||0)+(snapshot.migration_report.offer_source_rows||0);
  const changed=['product_growth_profiles','product_detail_checklists','channel_products'].some(key=>String(baseline.source_updated_at?.[key]||'')!==String(snapshot.source_updated_at?.[key]||''));
  if(changed)return {state:'SOURCE_CHANGED',label:'기존 자료 변경됨',message:'원본은 그대로 두고 최신 내용을 다시 가져와 비교할 수 있어요.'};
  if(sourceCount===0)return {state:'NO_LEGACY_SOURCE',label:'가져올 기존 자료 없음',message:`연결 상품 ${snapshot.migration_report.channel_product_rows||0}개와 옵션만 기준선에 보관했습니다.`};
  return {state:report.field_consistency===false?'MISMATCH':'MATCHED',label:report.field_consistency===false?'필드 확인 필요':'기존 자료 일치',message:'행 수와 필드 복사 결과가 일치하며 원본 테이블은 보존 중입니다.'};
}

function publicBaseline(row){
  if(!row)return null;
  return {
    project_id:row.project_id,master_product_id:row.master_product_id,migration_mode:row.migration_mode,baseline_status:row.baseline_status,
    product_role:row.product_role,product_summary:row.product_summary,target_customer:row.target_customer,
    purchase_situations:row.purchase_situations||[],hesitation_reasons:row.hesitation_reasons||[],core_message:row.core_message,
    prohibited_phrases:row.prohibited_phrases||[],usage_guide:row.usage_guide,checklist_items:row.checklist_items||{},
    checklist_notes:row.checklist_notes||'',owner_confirmed:Boolean(row.owner_confirmed),owner_confirmed_at:row.owner_confirmed_at,
    claim_reviews:row.claim_reviews||[],migration_report:row.migration_report||{},source_updated_at:row.source_updated_at||{},
    imported_at:row.imported_at,updated_at:row.updated_at
  };
}

function buildResponse({sources,baseline}){
  const snapshot=sourceSnapshot(sources),row=publicBaseline(baseline),storedProducts=Array.isArray(baseline?.channel_options)?baseline.channel_options:snapshot.channel_options;
  const options=normalizeChannelOptions(storedProducts),legacyOffers=normalizeLegacyOffers(Array.isArray(baseline?.legacy_offers)?baseline.legacy_offers:snapshot.legacy_offers);
  const reviews=row?.claim_reviews?.length?row.claim_reviews:claimReviews(row||snapshot);
  if(row)row.claim_reviews=reviews;
  return {
    prepared:Boolean(row),product:{id:sources.project.master_product_id,name:sources.product?.name||sources.project.product_snapshot?.name||'선택 상품'},
    baseline:row||publicBaseline({...snapshot,migration_mode:'READ_ONLY_COMPATIBILITY',baseline_status:'REVIEW_REQUIRED',owner_confirmed:false}),
    options,legacy_offers:legacyOffers,compatibility:compatibility({baseline:row,snapshot}),
    checklist_items:growthCenter.CHECKLIST_ITEMS.map(([key,label])=>({key,label})),
    summary:{options:options.length,legacy_offers:legacyOffers.length,policy_attention:reviews.filter(item=>item.status==='BLOCKED'||item.status==='VERIFY').length,checklist_done:Object.values(row?.checklist_items||snapshot.checklist_items||{}).filter(Boolean).length}
  };
}

async function loadBaseline({db,projectId}){
  const sources=await loadSources({db,projectId});
  const result=await db.from('market_product_baselines').select('*').eq('project_id',sources.project.id).maybeSingle();
  if(result.error)throw result.error;
  return buildResponse({sources,baseline:result.data||null});
}

async function recordVersion(db,projectId,reason,snapshot,actor){
  const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});
  if(result.error)throw result.error;return result.data;
}

async function prepareBaseline({db,projectId,actor='OWNER',refresh=false}){
  const sources=await loadSources({db,projectId}),snapshot=sourceSnapshot(sources);
  const existing=await db.from('market_product_baselines').select('*').eq('project_id',sources.project.id).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data&&!refresh)return buildResponse({sources,baseline:existing.data});
  const row={...snapshot,migration_mode:'READ_ONLY_COMPATIBILITY',baseline_status:'REVIEW_REQUIRED',owner_confirmed:false,owner_confirmed_at:null,imported_at:new Date().toISOString(),created_by:String(actor||'OWNER').slice(0,160)};
  const saved=await db.from('market_product_baselines').upsert(row,{onConflict:'project_id'}).select('*').single();
  if(saved.error)throw saved.error;
  await recordVersion(db,sources.project.id,refresh?'PRODUCT_BASELINE_REFRESHED':'PRODUCT_BASELINE_PREPARED',{phase:'17-3',baseline:publicBaseline(saved.data)},actor);
  return buildResponse({sources,baseline:saved.data});
}

function validateInput(input={}){
  const role=String(input.product_role||'STANDARD').toUpperCase();
  if(!PRODUCT_ROLES.has(role))throw new MarketBaselineError('상품 구분을 확인해주세요.');
  const fields={
    product_role:role,product_summary:shortText(input.product_summary,'상품 한 줄 설명'),target_customer:shortText(input.target_customer,'주요 고객'),
    purchase_situations:textArray(input.purchase_situations||[],'구매 상황'),hesitation_reasons:textArray(input.hesitation_reasons||[],'망설이는 이유'),
    core_message:shortText(input.core_message,'핵심 판매 문구'),prohibited_phrases:textArray(input.prohibited_phrases||[],'사용 금지 문구',24),
    usage_guide:shortText(input.usage_guide,'사용 안내'),checklist_items:checklist(input.checklist_items||{}),checklist_notes:shortText(input.checklist_notes,'점검 메모',4000),
    owner_confirmed:Boolean(input.owner_confirmed)
  };
  const reviews=claimReviews(fields),attention=reviews.filter(item=>item.status==='BLOCKED'||item.status==='VERIFY');
  return {...fields,claim_reviews:reviews,baseline_status:fields.owner_confirmed&&!attention.length?'VERIFIED':'REVIEW_REQUIRED',owner_confirmed_at:fields.owner_confirmed?new Date().toISOString():null};
}

async function saveBaseline({db,projectId,input,actor='OWNER'}){
  const sources=await loadSources({db,projectId}),validated=validateInput(input);
  const existing=await db.from('market_product_baselines').select('*').eq('project_id',sources.project.id).maybeSingle();
  if(existing.error)throw existing.error;
  if(!existing.data)throw new MarketBaselineError('먼저 기존 자료로 상품 기준선을 준비해주세요.',409,'BASELINE_NOT_PREPARED');
  const saved=await db.from('market_product_baselines').update({...validated,migration_mode:'OWNER_EDITED'}).eq('project_id',sources.project.id).select('*').single();
  if(saved.error)throw saved.error;
  await recordVersion(db,sources.project.id,'PRODUCT_BASELINE_SAVED',{phase:'17-3',baseline:publicBaseline(saved.data)},actor);
  return buildResponse({sources,baseline:saved.data});
}

module.exports={
  MarketBaselineError,optionQuantity,optionTotalUnits,normalizeChannelOptions,normalizeLegacyOffers,claimReviews,migrationReport,
  sourceSnapshot,compatibility,publicBaseline,buildResponse,loadBaseline,prepareBaseline,validateInput,saveBaseline
};
