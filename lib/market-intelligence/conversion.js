'use strict';

const profile=require('./market-profile.js');
const projects=require('./projects.js');

const BARRIER_TYPES=Object.freeze([
  {id:'TARGETING',label:'유입 대상',stage:'AD',description:'광고를 본 고객과 실제 구매 고객이 맞는지 확인'},
  {id:'MESSAGE',label:'검색·광고 문구',stage:'AD',description:'검색 의도와 광고 문구가 같은 약속을 하는지 확인'},
  {id:'PRICE_VALUE',label:'가격·가치',stage:'PRODUCT',description:'가격보다 구성과 가치가 먼저 이해되는지 확인'},
  {id:'TRUST_REVIEW',label:'신뢰·리뷰',stage:'PRODUCT',description:'원산지·제조·리뷰 등 믿을 근거가 충분한지 확인'},
  {id:'CONTENT_CLARITY',label:'상세 설명',stage:'PRODUCT',description:'누가 언제 어떻게 먹는지 빠르게 이해되는지 확인'},
  {id:'OPTION_CHOICE',label:'옵션 선택',stage:'PRODUCT',description:'수량·구성·옵션 차이를 쉽게 고를 수 있는지 확인'},
  {id:'SHIPPING',label:'배송 조건',stage:'CART',description:'배송비·도착일·당일출고 조건이 명확한지 확인'},
  {id:'STOCK',label:'재고·구매 가능',stage:'CART',description:'품절·재고 부족으로 구매가 막히지 않는지 확인'},
  {id:'CHECKOUT',label:'결제 단계',stage:'ORDER',description:'장바구니와 결제에서 이탈 원인이 없는지 확인'},
  {id:'CLAIM_SAFETY',label:'표현 안전',stage:'PRODUCT',description:'식품 광고 문구가 과장 없이 확인 가능한지 점검'}
]);
const BARRIER_IDS=new Set(BARRIER_TYPES.map(item=>item.id));
const STAGES=new Set(['AD','PRODUCT','CART','ORDER']);
const SEVERITIES=new Set(['LOW','WATCH','HIGH','BLOCKED']);
const FEEDBACK_AREAS=new Set(['HERO','TRUST','BENEFIT','USAGE','OFFER','SHIPPING','FAQ','CTA','OTHER']);
const BARRIER_SELECT='id,project_id,master_product_id,barrier_type,funnel_stage,severity,title,observation,recommendation,evidence_ids,status,owner_confirmed,created_at,updated_at';
const FEEDBACK_SELECT='id,project_id,master_product_id,area,title,current_issue,recommended_change,success_metric,source_barrier_ids,evidence_ids,status,owner_confirmed,created_at,updated_at';

class ConversionError extends Error{
  constructor(message,status=400,code='CONVERSION_INVALID'){super(message);this.name='ConversionError';this.status=status;this.code=code;}
}

const number=value=>value==null||value===''?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
const isoDate=value=>String(value||'').slice(0,10);
function addDays(value,days){const date=new Date(`${isoDate(value)}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function rate(numerator,denominator){return numerator==null||denominator==null||denominator<=0?null:Number((numerator/denominator*100).toFixed(2));}

function blockedFunnel(platform,label,reason){return {platform,label,status:'BLOCKED',period_start:null,period_end:null,period_aligned:false,stages:[
  {key:'IMPRESSIONS',label:'광고 노출',value:null,kind:'MEASURED',status:'NOT_AVAILABLE'},
  {key:'VISITS',label:'상품 방문',value:null,kind:'PROXY',status:'NOT_AVAILABLE'},
  {key:'ORDERS',label:'주문',value:null,kind:'MEASURED',status:'NOT_AVAILABLE'}
],rates:{click_through:null,visit_to_order:null,overall:null},spend:null,revenue:null,reason};}

function createFunnel({platform,label,periodStart,periodEnd,impressions=null,visits=null,orders=null,spend=null,revenue=null,visitKind='PROXY',reason=''}){
  const stages=[
    {key:'IMPRESSIONS',label:'광고 노출',value:number(impressions),kind:'MEASURED',status:impressions==null?'NOT_AVAILABLE':'AVAILABLE'},
    {key:'VISITS',label:'상품 방문',value:number(visits),kind:visitKind,status:visits==null?'NOT_AVAILABLE':'AVAILABLE'},
    {key:'ORDERS',label:'주문',value:number(orders),kind:'MEASURED',status:orders==null?'NOT_AVAILABLE':'AVAILABLE'}
  ];
  const available=stages.filter(item=>item.status==='AVAILABLE').length;
  return {platform,label,status:available===3?'READY':available?'PARTIAL':'BLOCKED',period_start:periodStart||null,period_end:periodEnd||null,period_aligned:Boolean(periodStart&&periodEnd),stages,rates:{click_through:rate(visits,impressions),visit_to_order:rate(orders,visits),overall:rate(orders,impressions)},spend:number(spend),revenue:number(revenue),reason:reason||(available===3?'같은 기간의 상품 연결 자료입니다.':'일부 단계의 상품별 자료가 없어 판단을 보류합니다.')};
}

function validateBarrier(input={}){
  const barrier_type=String(input.barrier_type||'').toUpperCase(),funnel_stage=String(input.funnel_stage||'PRODUCT').toUpperCase(),severity=String(input.severity||'WATCH').toUpperCase();
  if(!BARRIER_IDS.has(barrier_type))throw new ConversionError('구매 장벽 유형을 확인해주세요.');
  if(!STAGES.has(funnel_stage))throw new ConversionError('전환 단계를 확인해주세요.');
  if(!SEVERITIES.has(severity))throw new ConversionError('장벽 중요도를 확인해주세요.');
  return {barrier_type,funnel_stage,severity,title:profile.shortText(input.title,'장벽 이름',160,{required:true}),observation:profile.shortText(input.observation,'관찰 내용',2000),recommendation:profile.shortText(input.recommendation,'다음 행동',2000),evidence_ids:profile.uuidArray(input.evidence_ids||[],'장벽 근거'),owner_confirmed:Boolean(input.owner_confirmed)};
}

function validateFeedback(input={}){
  const area=String(input.area||'OTHER').toUpperCase();
  if(!FEEDBACK_AREAS.has(area))throw new ConversionError('상세페이지 영역을 확인해주세요.');
  const source_barrier_ids=profile.uuidArray(input.source_barrier_ids||[],'연결 장벽',10);
  return {area,title:profile.shortText(input.title,'수정안 이름',160,{required:true}),current_issue:profile.shortText(input.current_issue,'현재 문제',2000),recommended_change:profile.shortText(input.recommended_change,'추천 수정',2000),success_metric:profile.shortText(input.success_metric,'확인할 지표',500),source_barrier_ids,evidence_ids:profile.uuidArray(input.evidence_ids||[],'수정안 근거'),owner_confirmed:Boolean(input.owner_confirmed)};
}

async function verifiedEvidenceIds(db,projectId,ids){if(!ids.length)return [];const result=await db.from('market_evidence').select('id').eq('project_id',projectId).eq('status','VERIFIED').in('id',ids);if(result.error)throw result.error;return (result.data||[]).map(item=>item.id);}
async function recordVersion(db,projectId,reason,snapshot,actor){const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});if(result.error)throw result.error;return result.data;}

async function loadNaverFunnel(db,masterProductId){
  try{
    const links=await db.from('naver_keyword_product_links').select('ncc_keyword_id').eq('master_product_id',masterProductId).limit(5000);
    if(links.error)throw links.error;const ids=(links.data||[]).map(item=>item.ncc_keyword_id);
    if(!ids.length)return blockedFunnel('NAVER','네이버 광고','네이버 광고 키워드가 이 상품에 연결되지 않았습니다. 키워드 관리에서 상품 연결을 먼저 확인해주세요.');
    const latest=await db.from('naver_keyword_stats').select('period_start,period_end').in('ncc_keyword_id',ids).order('period_end',{ascending:false}).limit(1).maybeSingle();
    if(latest.error)throw latest.error;if(!latest.data)return blockedFunnel('NAVER','네이버 광고','연결 키워드의 수집 실적이 없습니다.');
    const rows=await db.from('naver_keyword_stats').select('impressions,clicks,cost,conversions,conversion_revenue').in('ncc_keyword_id',ids).eq('period_start',latest.data.period_start).eq('period_end',latest.data.period_end).limit(10000);
    if(rows.error)throw rows.error;
    return createFunnel({platform:'NAVER',label:'네이버 광고',periodStart:latest.data.period_start,periodEnd:latest.data.period_end,impressions:sum(rows.data||[],'impressions'),visits:sum(rows.data||[],'clicks'),orders:sum(rows.data||[],'conversions'),spend:sum(rows.data||[],'cost'),revenue:sum(rows.data||[],'conversion_revenue'),visitKind:'PROXY',reason:'광고 클릭을 상품 방문의 대리 지표로 사용합니다. 광고 실적과 기간은 일치합니다.'});
  }catch(error){return blockedFunnel('NAVER','네이버 광고',`네이버 전환자료 확인 필요 · ${error.message}`);}
}

async function loadCoupangFunnel(db,masterProductId){
  try{
    const links=await db.from('channel_products').select('external_product_id').eq('master_product_id',masterProductId).eq('platform','COUPANG').eq('is_active',true).limit(1000);
    if(links.error)throw links.error;const sellerIds=(links.data||[]).map(item=>item.external_product_id);
    if(!sellerIds.length)return blockedFunnel('COUPANG','쿠팡 광고','쿠팡 판매상품이 이 상품에 연결되지 않았습니다. 상품관리에서 매칭을 먼저 확인해주세요.');
    const items=await db.from('coupang_product_items').select('vendor_item_id').in('seller_product_id',sellerIds).limit(5000);
    if(items.error)throw items.error;const vendorIds=(items.data||[]).map(item=>item.vendor_item_id).filter(Boolean);
    if(!vendorIds.length)return blockedFunnel('COUPANG','쿠팡 광고','연결 상품의 쿠팡 옵션 ID를 확인할 수 없습니다.');
    const latest=await db.from('coupang_ad_keyword_daily').select('date').in('advertised_option_id',vendorIds).order('date',{ascending:false}).limit(1).maybeSingle();
    if(latest.error)throw latest.error;if(!latest.data)return blockedFunnel('COUPANG','쿠팡 광고','연결 상품의 쿠팡 광고 실적이 없습니다.');
    const periodEnd=latest.data.date,periodStart=addDays(periodEnd,-29);
    const rows=await db.from('coupang_ad_keyword_daily').select('impressions,clicks,ad_spend,orders_14d,revenue_14d').in('advertised_option_id',vendorIds).gte('date',periodStart).lte('date',periodEnd).limit(10000);
    if(rows.error)throw rows.error;
    return createFunnel({platform:'COUPANG',label:'쿠팡 광고',periodStart,periodEnd,impressions:sum(rows.data||[],'impressions'),visits:sum(rows.data||[],'clicks'),orders:sum(rows.data||[],'orders_14d'),spend:sum(rows.data||[],'ad_spend'),revenue:sum(rows.data||[],'revenue_14d'),visitKind:'PROXY',reason:'광고 클릭과 14일 기여 주문을 같은 상품 옵션·조회기간으로 묶었습니다.'});
  }catch(error){return blockedFunnel('COUPANG','쿠팡 광고',`쿠팡 전환자료 확인 필요 · ${error.message}`);}
}

async function loadCafe24Funnel(db,masterProductId,asOf=new Date()){
  try{
    const links=await db.from('channel_products').select('external_product_id').eq('master_product_id',masterProductId).eq('platform','CAFE24').eq('is_active',true).limit(1000);
    if(links.error)throw links.error;const productIds=(links.data||[]).map(item=>item.external_product_id);
    if(!productIds.length)return blockedFunnel('CAFE24','Cafe24 주문','Cafe24 판매상품이 이 상품에 연결되지 않았습니다.');
    const items=await db.from('cafe24_order_items').select('order_id').in('external_product_no',productIds).order('created_at',{ascending:false}).limit(10000);
    if(items.error)throw items.error;const orderIds=[...new Set((items.data||[]).map(item=>item.order_id).filter(Boolean))];
    const periodEnd=asOf.toISOString().slice(0,10),periodStart=addDays(periodEnd,-29);
    if(!orderIds.length)return createFunnel({platform:'CAFE24',label:'Cafe24 주문',periodStart,periodEnd,orders:0,reason:'상품 매칭은 확인됐지만 최근 30일 주문이 없습니다. 방문 단계는 상품별 수집이 필요합니다.'});
    const rows=[];for(let index=0;index<orderIds.length;index+=500){const result=await db.from('cafe24_orders').select('order_id,order_date,paid_amount,order_price').in('order_id',orderIds.slice(index,index+500)).gte('order_date',`${periodStart}T00:00:00Z`).lte('order_date',`${periodEnd}T23:59:59Z`).limit(5000);if(result.error)throw result.error;rows.push(...(result.data||[]));}
    return createFunnel({platform:'CAFE24',label:'Cafe24 주문',periodStart,periodEnd,orders:new Set(rows.map(item=>item.order_id)).size,revenue:rows.reduce((total,row)=>total+(Number(row.paid_amount??row.order_price)||0),0),reason:'최근 30일 상품 주문은 확인됐습니다. 상품별 광고 노출·방문 자료가 없어 전환율은 판단 보류입니다.'});
  }catch(error){return blockedFunnel('CAFE24','Cafe24 주문',`Cafe24 전환자료 확인 필요 · ${error.message}`);}
}

function responseSummary({funnels,barriers,feedback,evidence}){
  const ready=funnels.filter(item=>item.status==='READY').length,partial=funnels.filter(item=>item.status==='PARTIAL').length,verifiedBarriers=barriers.filter(item=>item.status==='VERIFIED').length,verifiedFeedback=feedback.filter(item=>item.status==='VERIFIED').length;
  const summary={channels_ready:ready,channels_partial:partial,channels_total:funnels.length,barriers_verified:verifiedBarriers,barriers_total:BARRIER_TYPES.length,feedback_verified:verifiedFeedback,evidence_verified:evidence.length};
  return {...summary,readiness:ready>0&&verifiedBarriers>0?'READY':'BLOCKED',readiness_message:ready===0?'광고→상품→주문이 같은 상품·기간으로 연결된 채널이 필요해요.':verifiedBarriers===0?'전환자료와 Evidence로 구매 장벽을 확인해주세요.':'전환 흐름과 확인된 구매 장벽이 준비되었습니다.'};
}

async function loadConversion({db,projectId,asOf=new Date()}){
  const loaded=await projects.loadProject({db,projectId}),project=loaded.project;
  const [naver,cafe24,coupang,barriersResult,feedbackResult,evidenceResult]=await Promise.all([
    loadNaverFunnel(db,project.master_product_id),loadCafe24Funnel(db,project.master_product_id,asOf),loadCoupangFunnel(db,project.master_product_id),
    db.from('market_barriers').select(BARRIER_SELECT).eq('project_id',project.id).order('updated_at',{ascending:false}).limit(100),
    db.from('market_feedback_cards').select(FEEDBACK_SELECT).eq('project_id',project.id).order('updated_at',{ascending:false}).limit(100),
    db.from('market_evidence').select('id,label,value_text,evidence_type,confidence,status,created_at').eq('project_id',project.id).eq('status','VERIFIED').order('created_at',{ascending:false}).limit(100)
  ]);
  const error=[barriersResult,feedbackResult,evidenceResult].find(item=>item.error)?.error;if(error)throw error;
  const funnels=[naver,cafe24,coupang],barriers=barriersResult.data||[],feedback=feedbackResult.data||[],evidence=evidenceResult.data||[];
  return {product:{id:project.master_product_id,name:loaded.product?.name||project.product_snapshot?.name||'선택 상품'},funnels,barrier_types:BARRIER_TYPES,barriers,feedback,evidence,summary:responseSummary({funnels,barriers,feedback,evidence})};
}

async function saveBarrier({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),barrier=validateBarrier(input),matched=await verifiedEvidenceIds(db,loaded.project.id,barrier.evidence_ids);
  if(matched.length!==barrier.evidence_ids.length)throw new ConversionError('같은 상품 프로젝트에서 검증된 Evidence만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const status=barrier.severity==='BLOCKED'?'BLOCKED':barrier.owner_confirmed&&barrier.evidence_ids.length&&barrier.observation&&barrier.recommendation?'VERIFIED':'REVIEW_REQUIRED';
  const saved=await db.from('market_barriers').upsert({...barrier,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)},{onConflict:'project_id,barrier_type'}).select(BARRIER_SELECT).single();
  if(saved.error)throw saved.error;await recordVersion(db,loaded.project.id,'MARKET_BARRIER_SAVED',{phase:'17-6',barrier:saved.data},actor);return loadConversion({db,projectId:loaded.project.id});
}

async function saveFeedback({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),feedback=validateFeedback(input),matched=await verifiedEvidenceIds(db,loaded.project.id,feedback.evidence_ids);
  if(matched.length!==feedback.evidence_ids.length)throw new ConversionError('같은 상품 프로젝트의 검증 Evidence만 상세페이지 수정안에 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  let barriers=[];if(feedback.source_barrier_ids.length){const result=await db.from('market_barriers').select('id,status').eq('project_id',loaded.project.id).in('id',feedback.source_barrier_ids);if(result.error)throw result.error;barriers=result.data||[];}
  if(barriers.length!==feedback.source_barrier_ids.length)throw new ConversionError('같은 상품 프로젝트의 구매 장벽만 연결해주세요.',409,'BARRIER_NOT_READY');
  const barriersVerified=barriers.length>0&&barriers.every(item=>item.status==='VERIFIED');
  const status=feedback.owner_confirmed&&feedback.evidence_ids.length&&feedback.source_barrier_ids.length&&feedback.recommended_change&&barriersVerified?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_feedback_cards').insert({...feedback,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(FEEDBACK_SELECT).single();
  if(inserted.error)throw inserted.error;await recordVersion(db,loaded.project.id,'MARKET_FEEDBACK_SAVED',{phase:'17-6',feedback:inserted.data},actor);return loadConversion({db,projectId:loaded.project.id});
}

module.exports={BARRIER_TYPES,BARRIER_IDS,STAGES,SEVERITIES,FEEDBACK_AREAS,ConversionError,rate,blockedFunnel,createFunnel,validateBarrier,validateFeedback,responseSummary,loadNaverFunnel,loadCoupangFunnel,loadCafe24Funnel,loadConversion,saveBarrier,saveFeedback};
