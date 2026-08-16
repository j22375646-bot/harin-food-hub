'use strict';

const foundation=require('./foundation.js');
const profile=require('./market-profile.js');
const projects=require('./projects.js');

const PLATFORMS=new Set(['NAVER','CAFE24','COUPANG','OTHER']);
const APPEAL_TYPES=new Set(['DIFFERENTIATION','TRUST','CONVENIENCE','VALUE','USAGE','OTHER']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPETITOR_SELECT='id,project_id,master_product_id,platform,competitor_name,product_name,product_url,price_won,package_quantity,package_unit,strengths,comparison_notes,evidence_ids,status,owner_confirmed,created_at,updated_at';
const REVIEW_SELECT='id,project_id,master_product_id,competitor_id,review_set_name,review_period_start,review_period_end,sample_size,pain_points,praised_points,purchase_reasons,rejection_reasons,evidence_ids,status,owner_confirmed,created_at,updated_at';
const APPEAL_SELECT='id,project_id,master_product_id,appeal_type,title,customer_problem,own_resolution,proof_summary,claim_text,claim_status,competitor_review_ids,competitor_pain_evidence_ids,own_resolution_evidence_ids,status,owner_confirmed,created_at,updated_at';

class CompetitionError extends Error{
  constructor(message,status=400,code='COMPETITION_INVALID'){super(message);this.name='CompetitionError';this.status=status;this.code=code;}
}

function requiredUuid(value,label){const id=String(value||'').trim();if(!UUID.test(id))throw new CompetitionError(`${label}을 다시 선택해주세요.`);return id;}
function optionalNumber(value,label,{positive=false}={}){if(value==null||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||(positive&&number<=0))throw new CompetitionError(`${label}을 확인해주세요.`);return number;}

function validateCompetitor(input={}){
  const platform=String(input.platform||'').toUpperCase();
  if(!PLATFORMS.has(platform))throw new CompetitionError('경쟁상품 플랫폼을 확인해주세요.');
  return {
    platform,
    competitor_name:profile.shortText(input.competitor_name,'경쟁 브랜드',160,{required:true}),
    product_name:profile.shortText(input.product_name,'경쟁상품 이름',240,{required:true}),
    product_url:profile.shortText(input.product_url,'상품 주소',1000),
    price_won:optionalNumber(input.price_won,'판매가'),
    package_quantity:optionalNumber(input.package_quantity,'구성 수량',{positive:true}),
    package_unit:profile.shortText(input.package_unit,'구성 단위',40),
    strengths:profile.textArray(input.strengths||[],'경쟁상품 강점'),
    comparison_notes:profile.shortText(input.comparison_notes,'비교 메모',2000),
    evidence_ids:profile.uuidArray(input.evidence_ids||[],'경쟁상품 근거'),
    owner_confirmed:Boolean(input.owner_confirmed)
  };
}

function validateReview(input={}){
  const review_period_start=profile.optionalDate(input.review_period_start,'시작'),review_period_end=profile.optionalDate(input.review_period_end,'종료');
  if(review_period_start&&review_period_end&&review_period_start>review_period_end)throw new CompetitionError('리뷰 기간의 시작일이 종료일보다 늦습니다.');
  return {
    competitor_id:requiredUuid(input.competitor_id,'경쟁상품'),
    review_set_name:profile.shortText(input.review_set_name,'리뷰 묶음 이름',160,{required:true}),
    review_period_start,
    review_period_end,
    sample_size:profile.boundedCount(input.sample_size,'리뷰 표본 수',{required:true}),
    pain_points:profile.textArray(input.pain_points||[],'반복 불편'),
    praised_points:profile.textArray(input.praised_points||[],'반복 만족'),
    purchase_reasons:profile.textArray(input.purchase_reasons||[],'구매 이유'),
    rejection_reasons:profile.textArray(input.rejection_reasons||[],'이탈 이유'),
    evidence_ids:profile.uuidArray(input.evidence_ids||[],'경쟁 리뷰 근거'),
    owner_confirmed:Boolean(input.owner_confirmed)
  };
}

function validateAppeal(input={}){
  const appeal_type=String(input.appeal_type||'DIFFERENTIATION').toUpperCase();
  if(!APPEAL_TYPES.has(appeal_type))throw new CompetitionError('소구점 유형을 확인해주세요.');
  const claim_text=profile.shortText(input.claim_text,'고객에게 보여줄 문구',500,{required:true});
  const claim=foundation.claimDecision(claim_text);
  return {
    appeal_type,
    title:profile.shortText(input.title,'소구점 이름',160,{required:true}),
    customer_problem:profile.shortText(input.customer_problem,'경쟁상품의 고객 불편',1000,{required:true}),
    own_resolution:profile.shortText(input.own_resolution,'우리 상품의 해결 방식',1000,{required:true}),
    proof_summary:profile.shortText(input.proof_summary,'근거 설명',2000),
    claim_text,
    claim_status:claim.status==='EMPTY'?'VERIFY':claim.status,
    competitor_review_ids:profile.uuidArray(input.competitor_review_ids||[],'경쟁 리뷰 묶음'),
    competitor_pain_evidence_ids:profile.uuidArray(input.competitor_pain_evidence_ids||[],'경쟁 불편 근거'),
    own_resolution_evidence_ids:profile.uuidArray(input.own_resolution_evidence_ids||[],'우리 해결 근거'),
    owner_confirmed:Boolean(input.owner_confirmed)
  };
}

async function verifiedEvidenceIds(db,projectId,ids){if(!ids.length)return [];const result=await db.from('market_evidence').select('id').eq('project_id',projectId).eq('status','VERIFIED').in('id',ids);if(result.error)throw result.error;return (result.data||[]).map(item=>item.id);}
async function recordVersion(db,projectId,reason,snapshot,actor){const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});if(result.error)throw result.error;return result.data;}

function responseSummary({competitors,reviews,appeals,evidence}){
  const verifiedCompetitors=competitors.filter(item=>item.status==='VERIFIED'),verifiedReviews=reviews.filter(item=>item.status==='VERIFIED'),verifiedAppeals=appeals.filter(item=>item.status==='VERIFIED');
  const reviewSample=verifiedReviews.reduce((sum,item)=>sum+Number(item.sample_size||0),0),painSignals=new Set(verifiedReviews.flatMap(item=>item.pain_points||[]));
  const summary={competitors_total:competitors.length,competitors_verified:verifiedCompetitors.length,review_sets_verified:verifiedReviews.length,review_sample:reviewSample,pain_signals_verified:painSignals.size,appeals_verified:verifiedAppeals.length,evidence_verified:evidence.length};
  return {...summary,readiness:verifiedCompetitors.length&&reviewSample>=10&&verifiedAppeals.length?'READY':'BLOCKED',readiness_message:!verifiedCompetitors.length?'검증된 경쟁상품 Evidence가 필요해요.':reviewSample<10?'검증된 경쟁 리뷰 표본 10건 이상이 필요해요.':!verifiedAppeals.length?'경쟁 불편과 우리 해결 근거를 함께 연결해주세요.':'경쟁상품·불편·차별화 근거가 준비되었습니다.'};
}

async function loadCompetition({db,projectId}){
  const loaded=await projects.loadProject({db,projectId}),project=loaded.project;
  const results=await Promise.all([
    db.from('market_competitors').select(COMPETITOR_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(100),
    db.from('market_competitor_review_insights').select(REVIEW_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(100),
    db.from('market_appeal_points').select(APPEAL_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(100),
    db.from('market_evidence').select('id,label,value_text,evidence_type,confidence,status,created_at').eq('project_id',project.id).eq('status','VERIFIED').order('created_at',{ascending:false}).limit(100)
  ]);
  const error=results.find(item=>item.error)?.error;if(error)throw error;
  const competitors=results[0].data||[],reviews=results[1].data||[],appeals=results[2].data||[],evidence=results[3].data||[];
  return {product:{id:project.master_product_id,name:loaded.product?.name||project.product_snapshot?.name||'선택 상품'},competitors,reviews,appeals,evidence,summary:responseSummary({competitors,reviews,appeals,evidence})};
}

async function saveCompetitor({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),competitor=validateCompetitor(input),matched=await verifiedEvidenceIds(db,loaded.project.id,competitor.evidence_ids);
  if(matched.length!==competitor.evidence_ids.length)throw new CompetitionError('같은 상품 프로젝트에서 검증된 Evidence만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const status=competitor.owner_confirmed&&competitor.evidence_ids.length?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_competitors').insert({...competitor,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(COMPETITOR_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,loaded.project.id,'MARKET_COMPETITOR_SAVED',{phase:'17-5',competitor:inserted.data},actor);
  return loadCompetition({db,projectId:loaded.project.id});
}

async function saveReview({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),review=validateReview(input),competitorResult=await db.from('market_competitors').select('id,status').eq('project_id',loaded.project.id).eq('id',review.competitor_id).maybeSingle();
  if(competitorResult.error)throw competitorResult.error;if(!competitorResult.data)throw new CompetitionError('같은 상품 프로젝트의 경쟁상품을 선택해주세요.',409,'COMPETITOR_NOT_READY');
  const matched=await verifiedEvidenceIds(db,loaded.project.id,review.evidence_ids);
  if(matched.length!==review.evidence_ids.length)throw new CompetitionError('검증된 Evidence와 경쟁 리뷰 집계만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const status=competitorResult.data.status==='VERIFIED'&&review.owner_confirmed&&review.sample_size>=10&&review.evidence_ids.length?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_competitor_review_insights').insert({...review,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(REVIEW_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,loaded.project.id,'MARKET_COMPETITOR_REVIEW_SAVED',{phase:'17-5',review:inserted.data,privacy:'AGGREGATE_ONLY'},actor);
  return loadCompetition({db,projectId:loaded.project.id});
}

async function saveAppeal({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),appeal=validateAppeal(input),allEvidence=[...new Set([...appeal.competitor_pain_evidence_ids,...appeal.own_resolution_evidence_ids])],matched=await verifiedEvidenceIds(db,loaded.project.id,allEvidence);
  if(matched.length!==allEvidence.length)throw new CompetitionError('경쟁 불편과 우리 해결 근거는 같은 상품 프로젝트의 검증 Evidence여야 해요.',409,'DIFFERENTIATION_EVIDENCE_NOT_READY');
  const reviewsResult=appeal.competitor_review_ids.length?await db.from('market_competitor_review_insights').select('id').eq('project_id',loaded.project.id).eq('status','VERIFIED').in('id',appeal.competitor_review_ids):{data:[],error:null};
  if(reviewsResult.error)throw reviewsResult.error;const matchedReviews=reviewsResult.data||[];
  const hasBothSides=appeal.competitor_pain_evidence_ids.length>0&&appeal.own_resolution_evidence_ids.length>0&&appeal.competitor_review_ids.length>0&&matchedReviews.length===appeal.competitor_review_ids.length;
  const status=appeal.claim_status==='BLOCKED'?'BLOCKED':appeal.owner_confirmed&&appeal.claim_status==='ALLOWED'&&hasBothSides?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_appeal_points').insert({...appeal,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(APPEAL_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,loaded.project.id,'MARKET_APPEAL_SAVED',{phase:'17-5',appeal:inserted.data,safety:{has_both_evidence_sides:hasBothSides,claim_status:appeal.claim_status}},actor);
  return loadCompetition({db,projectId:loaded.project.id});
}

module.exports={PLATFORMS,APPEAL_TYPES,CompetitionError,requiredUuid,optionalNumber,validateCompetitor,validateReview,validateAppeal,responseSummary,loadCompetition,saveCompetitor,saveReview,saveAppeal};
