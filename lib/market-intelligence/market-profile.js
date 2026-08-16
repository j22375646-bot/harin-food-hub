'use strict';

const projectsModule=require('./projects.js');

const SCOPE_LEVELS=['L0','L1','L2','L3','L4','L5','EX'];
const PLATFORMS=new Set(['NAVER','CAFE24','COUPANG','OTHER']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_SELECT='id,project_id,master_product_id,scope_level,label,description,relationship,evidence_ids,status,owner_confirmed,created_at,updated_at';
const REVIEW_SELECT='id,project_id,master_product_id,platform,review_set_name,review_period_start,review_period_end,sample_size,positive_count,neutral_count,negative_count,pain_points,desired_outcomes,objections,purchase_contexts,evidence_ids,status,owner_confirmed,created_at,updated_at';
const PERSONA_SELECT='id,project_id,master_product_id,persona_name,summary,primary_need,purchase_situations,barriers,decision_criteria,source_review_ids,evidence_ids,status,owner_confirmed,created_at,updated_at';

class MarketProfileError extends Error{
  constructor(message,status=400,code='MARKET_PROFILE_INVALID'){super(message);this.name='MarketProfileError';this.status=status;this.code=code;}
}

function shortText(value,label,max=160,{required=false}={}){
  const text=String(value||'').trim();
  if(required&&!text)throw new MarketProfileError(`${label}을 입력해주세요.`);
  if(text.length>max)throw new MarketProfileError(`${label}은 ${max.toLocaleString('ko-KR')}자 이내로 입력해주세요.`);
  return text;
}

function textArray(value,label,maxItems=12){
  if(!Array.isArray(value))throw new MarketProfileError(`${label} 형식이 올바르지 않습니다.`);
  if(value.length>maxItems)throw new MarketProfileError(`${label}은 ${maxItems}개까지만 입력할 수 있습니다.`);
  return [...new Set(value.map(item=>shortText(item,label,160)).filter(Boolean))];
}

function uuidArray(value,label,maxItems=24){
  if(!Array.isArray(value))throw new MarketProfileError(`${label} 형식이 올바르지 않습니다.`);
  const result=[...new Set(value.map(item=>String(item||'').trim()).filter(Boolean))];
  if(result.length>maxItems||result.some(item=>!UUID.test(item)))throw new MarketProfileError(`${label} 연결을 확인해주세요.`);
  return result;
}

function optionalDate(value,label){
  const text=String(value||'').trim();
  if(!text)return null;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(text)||Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()))throw new MarketProfileError(`${label} 날짜를 확인해주세요.`);
  return text;
}

function boundedCount(value,label,{required=false}={}){
  if(value==null||value===''){if(required)throw new MarketProfileError(`${label}을 입력해주세요.`);return null;}
  const count=Number(value);
  if(!Number.isInteger(count)||count<0||count>100000||(required&&count<1))throw new MarketProfileError(`${label}은 1~100,000 사이의 정수로 입력해주세요.`);
  return count;
}

function validateScope(input={}){
  const scope_level=String(input.scope_level||'').toUpperCase();
  if(!SCOPE_LEVELS.includes(scope_level))throw new MarketProfileError('시장범위 단계를 확인해주세요.');
  return {scope_level,label:shortText(input.label,'시장범위 이름',160,{required:true}),description:shortText(input.description,'시장범위 설명',2000),relationship:shortText(input.relationship,'선택 상품과의 관계',1000),evidence_ids:uuidArray(input.evidence_ids||[],'근거'),owner_confirmed:Boolean(input.owner_confirmed)};
}

function validateReview(input={}){
  const platform=String(input.platform||'').toUpperCase();
  if(!PLATFORMS.has(platform))throw new MarketProfileError('리뷰 플랫폼을 확인해주세요.');
  const sample_size=boundedCount(input.sample_size,'리뷰 표본 수',{required:true});
  const positive_count=boundedCount(input.positive_count,'긍정 리뷰 수');
  const neutral_count=boundedCount(input.neutral_count,'중립 리뷰 수');
  const negative_count=boundedCount(input.negative_count,'부정 리뷰 수');
  if([positive_count,neutral_count,negative_count].reduce((sum,value)=>sum+(value||0),0)>sample_size)throw new MarketProfileError('긍정·중립·부정 리뷰 수의 합은 전체 표본보다 클 수 없습니다.');
  const review_period_start=optionalDate(input.review_period_start,'시작'),review_period_end=optionalDate(input.review_period_end,'종료');
  if(review_period_start&&review_period_end&&review_period_start>review_period_end)throw new MarketProfileError('리뷰 기간의 시작일이 종료일보다 늦습니다.');
  return {platform,review_set_name:shortText(input.review_set_name,'리뷰 묶음 이름',160,{required:true}),review_period_start,review_period_end,sample_size,positive_count,neutral_count,negative_count,pain_points:textArray(input.pain_points||[],'불편 신호'),desired_outcomes:textArray(input.desired_outcomes||[],'기대 결과'),objections:textArray(input.objections||[],'구매 장벽'),purchase_contexts:textArray(input.purchase_contexts||[],'구매 상황'),evidence_ids:uuidArray(input.evidence_ids||[],'근거'),owner_confirmed:Boolean(input.owner_confirmed)};
}

function uniqueRank(reviews,key,limit=6){
  const counts=new Map();
  for(const review of reviews)for(const value of review[key]||[]){const item=String(value||'').trim();if(item)counts.set(item,(counts.get(item)||0)+Number(review.sample_size||1));}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')).slice(0,limit).map(([value])=>value);
}

function buildPersonaDraft(reviews=[]){
  const verified=reviews.filter(item=>item?.status==='VERIFIED');
  const sampleSize=verified.reduce((sum,item)=>sum+Number(item.sample_size||0),0);
  if(!verified.length||sampleSize<10)throw new MarketProfileError('검증된 리뷰 표본이 10건 이상 모여야 페르소나 초안을 만들 수 있어요. 지금은 판단 보류입니다.',409,'PERSONA_EVIDENCE_NOT_READY');
  const needs=uniqueRank(verified,'desired_outcomes'),situations=uniqueRank(verified,'purchase_contexts'),barriers=uniqueRank(verified,'objections'),painPoints=uniqueRank(verified,'pain_points');
  const source_review_ids=verified.map(item=>item.id).filter(Boolean),evidence_ids=[...new Set(verified.flatMap(item=>item.evidence_ids||[]))];
  return {persona_name:needs[0]?`${needs[0]} 중심 고객`:'검증 리뷰 기반 고객',summary:`검증된 리뷰 ${sampleSize.toLocaleString('ko-KR')}건에서 반복된 구매 상황과 장벽을 묶은 초안입니다.`,primary_need:needs[0]||painPoints[0]||'추가 검토 필요',purchase_situations:situations,barriers:barriers.length?barriers:painPoints,decision_criteria:needs.slice(0,6),source_review_ids,evidence_ids,owner_confirmed:false,status:'REVIEW_REQUIRED',sample_size:sampleSize};
}

function validatePersona(input={}){
  return {persona_name:shortText(input.persona_name,'페르소나 이름',160,{required:true}),summary:shortText(input.summary,'페르소나 설명',2000),primary_need:shortText(input.primary_need,'핵심 필요',1000),purchase_situations:textArray(input.purchase_situations||[],'구매 상황'),barriers:textArray(input.barriers||[],'구매 장벽'),decision_criteria:textArray(input.decision_criteria||[],'선택 기준'),source_review_ids:uuidArray(input.source_review_ids||[],'리뷰 묶음'),evidence_ids:uuidArray(input.evidence_ids||[],'근거',48),owner_confirmed:Boolean(input.owner_confirmed)};
}

async function loadProject(db,projectId){return projectsModule.loadProject({db,projectId});}

async function verifiedEvidenceIds(db,projectId,ids){
  if(!ids.length)return [];
  const result=await db.from('market_evidence').select('id').eq('project_id',projectId).eq('status','VERIFIED').in('id',ids);
  if(result.error)throw result.error;
  return (result.data||[]).map(item=>item.id);
}

async function recordVersion(db,projectId,reason,snapshot,actor){
  const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});
  if(result.error)throw result.error;return result.data;
}

function responseSummary({scopes,reviews,personas,evidence}){
  const verifiedReviews=reviews.filter(item=>item.status==='VERIFIED');
  const reviewSample=verifiedReviews.reduce((sum,item)=>sum+Number(item.sample_size||0),0);
  const summary={scope_verified:scopes.filter(item=>item.status==='VERIFIED').length,scope_total:SCOPE_LEVELS.length,review_sets_verified:verifiedReviews.length,review_sample:reviewSample,personas_verified:personas.filter(item=>item.status==='VERIFIED').length,evidence_verified:evidence.length};
  return {...summary,readiness:summary.scope_verified>0&&reviewSample>=10&&summary.personas_verified>0?'READY':'BLOCKED',readiness_message:summary.scope_verified===0?'검증된 시장범위 Evidence가 필요해요.':reviewSample<10?'검증된 리뷰 표본 10건 이상이 필요해요.':summary.personas_verified===0?'리뷰 근거로 만든 페르소나를 사장님이 확인해주세요.':'시장범위·리뷰·페르소나 근거가 준비되었습니다.'};
}

async function loadMarketProfile({db,projectId}){
  const loaded=await loadProject(db,projectId),project=loaded.project;
  const results=await Promise.all([
    db.from('market_scope_entries').select(SCOPE_SELECT).eq('project_id',project.id).order('scope_level'),
    db.from('market_review_insights').select(REVIEW_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(100),
    db.from('market_personas').select(PERSONA_SELECT).eq('project_id',project.id).order('created_at',{ascending:false}).limit(50),
    db.from('market_evidence').select('id,label,value_text,evidence_type,confidence,status,created_at').eq('project_id',project.id).eq('status','VERIFIED').order('created_at',{ascending:false}).limit(100)
  ]);
  const error=results.find(item=>item.error)?.error;if(error)throw error;
  const scopes=results[0].data||[],reviews=results[1].data||[],personas=results[2].data||[],evidence=results[3].data||[];
  return {product:{id:project.master_product_id,name:loaded.product?.name||project.product_snapshot?.name||'선택 상품'},scope_levels:SCOPE_LEVELS,scopes,reviews,personas,evidence,summary:responseSummary({scopes,reviews,personas,evidence})};
}

async function saveScope({db,projectId,input,actor='OWNER'}){
  const loaded=await loadProject(db,projectId),scope=validateScope(input),matched=await verifiedEvidenceIds(db,loaded.project.id,scope.evidence_ids);
  if(matched.length!==scope.evidence_ids.length)throw new MarketProfileError('같은 상품 프로젝트에서 검증된 Evidence만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const status=scope.owner_confirmed&&scope.evidence_ids.length?'VERIFIED':'REVIEW_REQUIRED';
  const saved=await db.from('market_scope_entries').upsert({...scope,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)},{onConflict:'project_id,scope_level'}).select(SCOPE_SELECT).single();
  if(saved.error)throw saved.error;
  await recordVersion(db,loaded.project.id,'MARKET_SCOPE_SAVED',{phase:'17-4',scope:saved.data},actor);
  return loadMarketProfile({db,projectId:loaded.project.id});
}

async function saveReview({db,projectId,input,actor='OWNER'}){
  const loaded=await loadProject(db,projectId),review=validateReview(input),matched=await verifiedEvidenceIds(db,loaded.project.id,review.evidence_ids);
  if(matched.length!==review.evidence_ids.length)throw new MarketProfileError('검증된 Evidence와 리뷰 집계만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const status=review.owner_confirmed&&review.sample_size>=10&&review.evidence_ids.length?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_review_insights').insert({...review,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(REVIEW_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,loaded.project.id,'MARKET_REVIEW_AGGREGATE_SAVED',{phase:'17-4',review:inserted.data,privacy:'AGGREGATE_ONLY'},actor);
  return loadMarketProfile({db,projectId:loaded.project.id});
}

async function draftPersona({db,projectId}){
  const profile=await loadMarketProfile({db,projectId});
  return {draft:buildPersonaDraft(profile.reviews),summary:profile.summary};
}

async function savePersona({db,projectId,input,actor='OWNER'}){
  const loaded=await loadProject(db,projectId),persona=validatePersona(input);
  if(!persona.source_review_ids.length)throw new MarketProfileError('검증된 리뷰 묶음을 먼저 연결해주세요.',409,'PERSONA_EVIDENCE_NOT_READY');
  const reviewResult=await db.from('market_review_insights').select(REVIEW_SELECT).eq('project_id',loaded.project.id).eq('status','VERIFIED').in('id',persona.source_review_ids);
  if(reviewResult.error)throw reviewResult.error;
  const reviews=reviewResult.data||[],sampleSize=reviews.reduce((sum,item)=>sum+Number(item.sample_size||0),0);
  if(reviews.length!==persona.source_review_ids.length||sampleSize<10)throw new MarketProfileError('같은 상품 프로젝트의 검증 리뷰 10건 이상이 필요해요.',409,'PERSONA_EVIDENCE_NOT_READY');
  const allowedEvidence=new Set(reviews.flatMap(item=>item.evidence_ids||[]));
  if(!persona.evidence_ids.length||persona.evidence_ids.some(id=>!allowedEvidence.has(id)))throw new MarketProfileError('페르소나는 선택한 리뷰에 연결된 Evidence만 사용할 수 있어요.',409,'PERSONA_EVIDENCE_NOT_READY');
  const status=persona.owner_confirmed?'VERIFIED':'REVIEW_REQUIRED';
  const inserted=await db.from('market_personas').insert({...persona,status,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,created_by:String(actor||'OWNER').slice(0,160)}).select(PERSONA_SELECT).single();
  if(inserted.error)throw inserted.error;
  await recordVersion(db,loaded.project.id,'MARKET_PERSONA_SAVED',{phase:'17-4',persona:inserted.data,review_sample:sampleSize},actor);
  return loadMarketProfile({db,projectId:loaded.project.id});
}

module.exports={SCOPE_LEVELS,PLATFORMS,MarketProfileError,shortText,textArray,uuidArray,optionalDate,boundedCount,validateScope,validateReview,uniqueRank,buildPersonaDraft,validatePersona,responseSummary,loadMarketProfile,saveScope,saveReview,draftPersona,savePersona};
