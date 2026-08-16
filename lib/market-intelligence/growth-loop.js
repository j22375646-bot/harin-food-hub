'use strict';

const baselineModule=require('./baseline.js');
const profile=require('./market-profile.js');
const projects=require('./projects.js');
const retentionModule=require('../customers/retention-validation.js');

const LEVER_TYPES=Object.freeze([
  {id:'NDELIVERY',label:'N배송 준비',platform:'NAVER',icon:'truck',tone:'blue',description:'도착일·배송 혜택이 구매 이유가 되는지 확인'},
  {id:'MEMBERSHIP',label:'멤버십 혜택',platform:'NAVER',icon:'customer',tone:'lavender',description:'회원 혜택이 첫 구매와 다음 구매를 잇는지 확인'},
  {id:'BUNDLE',label:'묶음구성',platform:'ALL',icon:'shoppingBag',tone:'pink',description:'1개·세트 구성이 고객 선택과 이익에 맞는지 확인'},
  {id:'REPURCHASE',label:'재구매',platform:'CAFE24',icon:'sync',tone:'mint',description:'실제 반복 구매 간격으로 다음 확인 시점을 계산'}
]);
const LEVER_MAP=new Map(LEVER_TYPES.map(item=>[item.id,item]));
const LEVER_SELECT='id,project_id,master_product_id,lever_type,platform,current_state,hypothesis,next_action,success_metric,linked_offer_id,evidence_ids,status,owner_confirmed,owner_confirmed_at,created_at,updated_at';

class GrowthLoopError extends Error{
  constructor(message,status=400,code='GROWTH_LOOP_INVALID'){super(message);this.name='GrowthLoopError';this.status=status;this.code=code;}
}

const numberOrNull=value=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const dateOnly=value=>String(value||'').slice(0,10);
function addDays(value,days){const date=new Date(`${dateOnly(value)}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}

function compareOffers(options=[],legacyOffers=[]){
  const channel=(options||[]).filter(item=>item.is_active!==false).map(item=>({
    source:'CHANNEL_SNAPSHOT',source_id:null,platform:String(item.platform||''),name:String(item.option_name||item.external_product_name||'구성'),
    offer_type:String(item.offer_type||'SINGLE'),quantity:Math.max(1,Number(item.pack_count)||1),total_units:numberOrNull(item.total_units),
    sale_price:numberOrNull(item.sale_price),operational_owner:'상품 성장센터'
  }));
  const legacy=(legacyOffers||[]).filter(item=>item.is_active!==false).map(item=>({
    source:'PRODUCT_GROWTH_OFFER',source_id:item.source_id??item.id??null,platform:String(item.platform||'ALL'),name:String(item.name||'구성'),
    offer_type:String(item.offer_type||'SINGLE'),quantity:Math.max(1,Number(item.quantity)||1),total_units:null,
    sale_price:numberOrNull(item.sale_price),operational_owner:'상품 성장센터'
  }));
  const seen=new Set(),rows=[];
  for(const item of [...legacy,...channel]){
    const key=`${item.platform}|${item.source_id||''}|${item.name}|${item.quantity}`;
    if(seen.has(key))continue;seen.add(key);rows.push(item);
  }
  rows.sort((a,b)=>a.platform.localeCompare(b.platform)||a.quantity-b.quantity||a.name.localeCompare(b.name,'ko'));
  const base=rows.filter(item=>item.sale_price!=null).sort((a,b)=>a.quantity-b.quantity)[0]||null;
  return rows.map(item=>{
    const unitPrice=item.sale_price==null?null:Math.round(item.sale_price/item.quantity);
    const baseUnit=base?.sale_price==null?null:base.sale_price/base.quantity;
    const savingRate=unitPrice==null||!baseUnit||item.quantity===base.quantity?0:Number(((1-unitPrice/baseUnit)*100).toFixed(1));
    return {...item,unit_price:unitPrice,saving_rate:savingRate,status:item.sale_price==null?'REVIEW_REQUIRED':'AVAILABLE'};
  });
}

function productRetentionSummary({orders=[],items=[],orderHistoryPeriod=null,asOf=new Date()}={}){
  const result=retentionModule.buildCustomerRetention({orders,items,orderHistoryPeriod,asOf});
  const revenue=(items||[]).reduce((total,item)=>total+(Number(item.paid_amount??(Number(item.unit_price)||0)*(Number(item.quantity)||0))||0),0);
  const quantity=(items||[]).reduce((total,item)=>total+(Number(item.quantity)||0),0);
  return {
    status:result.summary.lifecycle_status==='READY'?'READY':orders.length?'PARTIAL':'BLOCKED',
    period:result.period,
    summary:{...result.summary,revenue,quantity},
    recommendations:result.recommendations,
    privacy:result.privacy
  };
}

function blockedRetention(reason){return {status:'BLOCKED',period:{start:null,end:null,days:0,order_activity_days:0},summary:{orders:null,identified_orders:null,anonymous_orders:null,identified_customers:null,one_order_customers:null,repeat_customers:null,repeat_rate:null,interval_samples:null,cycle_days:null,due_customers:null,dormant_customers:null,lifecycle_status:'BLOCKED',revenue:null,quantity:null},recommendations:[{level:'WAIT',title:'재구매 판단 보류',body:reason}],privacy:'고객 식별값은 서버 집계에만 사용하며 결과와 화면에는 포함하지 않습니다.'};}

async function loadProductRetention(db,masterProductId,asOf=new Date()){
  try{
    const mappings=await db.from('channel_products').select('external_product_id').eq('master_product_id',masterProductId).eq('platform','CAFE24').eq('is_active',true).limit(1000);
    if(mappings.error)throw mappings.error;
    const productIds=(mappings.data||[]).map(item=>String(item.external_product_id||'')).filter(Boolean);
    if(!productIds.length)return blockedRetention('Cafe24 판매상품이 선택 상품에 연결되지 않았습니다.');
    const itemsResult=await db.from('cafe24_order_items').select('order_id,external_product_no,product_name,option_name,quantity,unit_price,paid_amount').in('external_product_no',productIds).order('created_at',{ascending:false}).limit(20000);
    if(itemsResult.error)throw itemsResult.error;
    const items=itemsResult.data||[],orderIds=[...new Set(items.map(item=>item.order_id).filter(Boolean))];
    if(!orderIds.length)return productRetentionSummary({orders:[],items:[],asOf});
    const orders=[];
    for(let index=0;index<orderIds.length;index+=500){
      const result=await db.from('cafe24_orders').select('order_id,order_date,customer_id,paid_amount,order_price,raw_data').in('order_id',orderIds.slice(index,index+500)).order('order_date',{ascending:true}).limit(5000);
      if(result.error)throw result.error;orders.push(...(result.data||[]));
    }
    const syncs=await db.from('sync_logs').select('metadata,finished_at').eq('platform','CAFE24').eq('status','SUCCESS').order('finished_at',{ascending:false}).limit(20);
    if(syncs.error)throw syncs.error;
    const orderHistoryPeriod=(syncs.data||[]).map(item=>item.metadata?.order_period).find(period=>period?.start_date&&period?.end_date)||null;
    return productRetentionSummary({orders,items,orderHistoryPeriod,asOf});
  }catch(error){return blockedRetention(`Cafe24 재구매 자료 확인 필요 · ${error.message}`);}
}

function validateLever(input={}){
  const lever_type=String(input.lever_type||'').toUpperCase(),definition=LEVER_MAP.get(lever_type);
  if(!definition)throw new GrowthLoopError('성장 항목을 확인해주세요.');
  const linked_offer_id=input.linked_offer_id==null||input.linked_offer_id===''?null:Number(input.linked_offer_id);
  if(linked_offer_id!=null&&(!Number.isSafeInteger(linked_offer_id)||linked_offer_id<=0))throw new GrowthLoopError('연결할 상품 구성을 확인해주세요.');
  try{return {
      lever_type,platform:definition.platform,
      current_state:profile.shortText(input.current_state,'현재 상태',2000,{required:true}),
      hypothesis:profile.shortText(input.hypothesis,'성장 가설',2000,{required:true}),
      next_action:profile.shortText(input.next_action,'다음 행동',2000,{required:true}),
      success_metric:profile.shortText(input.success_metric,'성공 확인 지표',500,{required:true}),
      linked_offer_id,evidence_ids:profile.uuidArray(input.evidence_ids||[],'성장 항목 근거'),owner_confirmed:Boolean(input.owner_confirmed)
    };}
  catch(error){if(error?.name==='MarketProfileError')throw new GrowthLoopError(error.message,400,'GROWTH_LOOP_INVALID');throw error;}
}

function liveSignal(type,{offers,retention,hasNaverProduct}){
  if(type==='BUNDLE'){
    const bundles=offers.filter(item=>item.quantity>1&&item.status==='AVAILABLE');
    return bundles.length?{status:'READY',label:`세트 ${bundles.length}개`,description:'상품 성장센터의 현재 구성을 읽었습니다.'}:{status:'BLOCKED',label:'구성 확인 필요',description:'판매 중인 세트 구성을 상품 성장센터에서 먼저 확인해주세요.'};
  }
  if(type==='REPURCHASE')return retention.status==='READY'?{status:'READY',label:`대표 ${retention.summary.cycle_days}일`,description:'90일 이상 이력과 반복 간격 3개 이상입니다.'}:{status:retention.status,label:'판단 보류',description:retention.recommendations[0]?.body||'재구매 표본이 더 필요합니다.'};
  if(type==='NDELIVERY')return hasNaverProduct?{status:'PARTIAL',label:'상품 연결 확인',description:'N배송 실제 적용 여부는 사장님 근거 확인이 필요합니다.'}:{status:'BLOCKED',label:'네이버 상품 미연결',description:'네이버 상품 연결 전에는 N배송 적용 여부를 판단하지 않습니다.'};
  return hasNaverProduct?{status:'PARTIAL',label:'혜택 확인 필요',description:'멤버십 혜택 노출과 사용 근거를 연결해주세요.'}:{status:'BLOCKED',label:'네이버 상품 미연결',description:'네이버 상품 연결 전에는 멤버십 효과를 판단하지 않습니다.'};
}

function responseSummary({levers,offers,retention,hasNaverProduct}){
  const verified=levers.filter(item=>item.status==='VERIFIED').length;
  const signals=LEVER_TYPES.map(item=>liveSignal(item.id,{offers,retention,hasNaverProduct}));
  const liveReady=signals.filter(item=>item.status==='READY').length;
  return {verified_plans:verified,total_plans:LEVER_TYPES.length,live_ready:liveReady,bundle_options:offers.length,retention_status:retention.status,readiness:verified>0&&liveReady>0?'READY':'BLOCKED',readiness_message:verified===0?'Evidence와 사장님 확인을 연결한 성장 항목이 아직 없습니다.':liveReady===0?'실제 구성 또는 재구매 표본이 더 필요합니다.':'확인된 성장 가설과 실제 신호가 연결되었습니다.'};
}

async function verifiedEvidenceIds(db,projectId,ids){if(!ids.length)return [];const result=await db.from('market_evidence').select('id').eq('project_id',projectId).eq('status','VERIFIED').in('id',ids);if(result.error)throw result.error;return (result.data||[]).map(item=>item.id);}
async function recordVersion(db,projectId,reason,snapshot,actor){const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});if(result.error)throw result.error;return result.data;}

async function loadGrowthLoop({db,projectId,asOf=new Date()}){
  const loaded=await projects.loadProject({db,projectId}),project=loaded.project;
  const [baseline,leversResult,evidenceResult,retention,mappingsResult]=await Promise.all([
    baselineModule.loadBaseline({db,projectId:project.id}),
    db.from('market_growth_levers').select(LEVER_SELECT).eq('project_id',project.id).order('updated_at',{ascending:false}).limit(20),
    db.from('market_evidence').select('id,label,value_text,evidence_type,confidence,status,created_at').eq('project_id',project.id).eq('status','VERIFIED').order('created_at',{ascending:false}).limit(100),
    loadProductRetention(db,project.master_product_id,asOf),
    db.from('channel_products').select('platform').eq('master_product_id',project.master_product_id).eq('is_active',true).limit(1000)
  ]);
  const error=[leversResult,evidenceResult,mappingsResult].find(item=>item.error)?.error;if(error)throw error;
  const offers=compareOffers(baseline.options,baseline.legacy_offers),levers=leversResult.data||[],evidence=evidenceResult.data||[];
  const hasNaverProduct=(mappingsResult.data||[]).some(item=>item.platform==='NAVER');
  const leverTypes=LEVER_TYPES.map(item=>({...item,signal:liveSignal(item.id,{offers,retention,hasNaverProduct})}));
  return {product:{id:project.master_product_id,name:loaded.product?.name||project.product_snapshot?.name||'선택 상품'},lever_types:leverTypes,levers,evidence,offers,retention,summary:responseSummary({levers,offers,retention,hasNaverProduct}),safety:{platform_writes:false,customer_ids_returned:false,offer_owner:'/products/offers',retention_owner:'/validation'}};
}

async function saveLever({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),lever=validateLever(input),matched=await verifiedEvidenceIds(db,loaded.project.id,lever.evidence_ids);
  if(matched.length!==lever.evidence_ids.length)throw new GrowthLoopError('같은 상품 프로젝트에서 검증된 Evidence만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  if(lever.linked_offer_id!=null){const offer=await db.from('product_growth_offers').select('id').eq('id',lever.linked_offer_id).eq('master_product_id',loaded.project.master_product_id).maybeSingle();if(offer.error)throw offer.error;if(!offer.data)throw new GrowthLoopError('현재 상품의 구성만 연결할 수 있어요.',409,'OFFER_NOT_READY');}
  const status=lever.owner_confirmed&&lever.evidence_ids.length?'VERIFIED':'REVIEW_REQUIRED';
  const saved=await db.from('market_growth_levers').upsert({...lever,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,owner_confirmed_at:lever.owner_confirmed?new Date().toISOString():null,created_by:String(actor||'OWNER').slice(0,160)},{onConflict:'project_id,lever_type'}).select(LEVER_SELECT).single();
  if(saved.error)throw saved.error;
  await recordVersion(db,loaded.project.id,'MARKET_GROWTH_LEVER_SAVED',{phase:'17-7',lever:saved.data},actor);
  return loadGrowthLoop({db,projectId:loaded.project.id});
}

module.exports={LEVER_TYPES,LEVER_MAP,GrowthLoopError,compareOffers,productRetentionSummary,blockedRetention,loadProductRetention,validateLever,liveSignal,responseSummary,loadGrowthLoop,saveLever};
