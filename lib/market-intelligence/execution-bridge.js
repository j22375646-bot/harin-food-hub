'use strict';

const experiments=require('../experiments/service.js');
const profile=require('./market-profile.js');
const projects=require('./projects.js');

const SOURCE_TYPES=new Set(['GROWTH_LEVER','BARRIER','FEEDBACK']);
const PLATFORMS=new Set(['ALL','NAVER','CAFE24','COUPANG']);
const METRICS=new Set(['CTR','CPC','CVR','CPA','ROAS','REVENUE','ORDERS','AOV']);
const PLAN_SELECT='id,project_id,master_product_id,source_type,source_id,title,platform,hypothesis,metric,start_date,end_date,control_label,variant_label,minimum_sample_size,risk_note,rollback_plan,evidence_ids,approval_status,owner_confirmed,approved_by,approved_at,rejection_note,ab_test_id,report_snapshot,report_generated_at,created_at,updated_at';

class ExecutionBridgeError extends Error{
  constructor(message,status=400,code='MARKET_EXECUTION_INVALID'){super(message);this.name='ExecutionBridgeError';this.status=status;this.code=code;}
}

const text=(value,label,max,{required=false}={})=>{
  try{return profile.shortText(value,label,max,{required});}
  catch(error){throw new ExecutionBridgeError(error.message,400,'MARKET_EXECUTION_INVALID');}
};
const uuidArray=(value,label)=>{
  try{return profile.uuidArray(value||[],label);}
  catch(error){throw new ExecutionBridgeError(error.message,400,'MARKET_EXECUTION_INVALID');}
};
const isoDate=(value,label)=>{const date=String(value||'');if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()))throw new ExecutionBridgeError(`${label}을 확인해주세요.`);return date;};

function validatePlan(input={}){
  const source_type=String(input.source_type||'').toUpperCase(),source_id=projects.requiredUuid(input.source_id,'실행 근거');
  if(!SOURCE_TYPES.has(source_type))throw new ExecutionBridgeError('실행 근거 종류를 확인해주세요.');
  const platform=String(input.platform||'ALL').toUpperCase(),metric=String(input.metric||'CVR').toUpperCase();
  if(!PLATFORMS.has(platform))throw new ExecutionBridgeError('실험 채널을 확인해주세요.');
  if(!METRICS.has(metric))throw new ExecutionBridgeError('성공 지표를 확인해주세요.');
  const start_date=isoDate(input.start_date,'시작일'),end_date=isoDate(input.end_date,'종료일');
  if(end_date<start_date)throw new ExecutionBridgeError('종료일은 시작일보다 빠를 수 없습니다.');
  const minimum_sample_size=Math.max(1,Math.min(1000000,Math.round(Number(input.minimum_sample_size)||30)));
  return {source_type,source_id,title:text(input.title,'실행계획 이름',160,{required:true}),platform,
    hypothesis:text(input.hypothesis,'가설',2000),metric,start_date,end_date,
    control_label:text(input.control_label||'기존안','기존안 이름',120,{required:true}),variant_label:text(input.variant_label||'변경안','변경안 이름',120,{required:true}),
    minimum_sample_size,risk_note:text(input.risk_note,'위험',2000),rollback_plan:text(input.rollback_plan,'복구 방법',2000),
    evidence_ids:uuidArray(input.evidence_ids,'실행계획 근거')};
}

function sourceRows({levers=[],barriers=[],feedback=[]}={}){
  return [
    ...levers.map(item=>({id:item.id,source_type:'GROWTH_LEVER',title:`${item.lever_type} 성장 가설`,platform:item.platform||'ALL',summary:item.hypothesis||item.next_action||'',status:item.status,evidence_ids:item.evidence_ids||[],icon:'growth'})),
    ...barriers.map(item=>({id:item.id,source_type:'BARRIER',title:item.title,platform:'ALL',summary:item.recommendation||item.observation||'',status:item.status,evidence_ids:item.evidence_ids||[],icon:'shield'})),
    ...feedback.map(item=>({id:item.id,source_type:'FEEDBACK',title:item.title,platform:'ALL',summary:item.recommended_change||item.current_issue||'',status:item.status,evidence_ids:item.evidence_ids||[],icon:'sparkles'}))
  ].sort((a,b)=>(a.status==='VERIFIED'?-1:1)-(b.status==='VERIFIED'?-1:1)||a.title.localeCompare(b.title,'ko'));
}

async function loadExecutionBridge({db,projectId}){
  const loaded=await projects.loadProject({db,projectId}),id=loaded.project.id;
  const [levers,barriers,feedback,evidence,plans]=await Promise.all([
    db.from('market_growth_levers').select('id,lever_type,platform,hypothesis,next_action,evidence_ids,status').eq('project_id',id).order('updated_at',{ascending:false}).limit(50),
    db.from('market_barriers').select('id,title,observation,recommendation,evidence_ids,status').eq('project_id',id).order('updated_at',{ascending:false}).limit(50),
    db.from('market_feedback_cards').select('id,title,current_issue,recommended_change,evidence_ids,status').eq('project_id',id).order('updated_at',{ascending:false}).limit(100),
    db.from('market_evidence').select('id,label,value_text,evidence_type,status,created_at').eq('project_id',id).eq('status','VERIFIED').order('created_at',{ascending:false}).limit(100),
    db.from('market_execution_plans').select(PLAN_SELECT).eq('project_id',id).order('updated_at',{ascending:false}).limit(100)
  ]);
  const failed=[levers,barriers,feedback,evidence,plans].find(item=>item.error);if(failed)throw failed.error;
  const candidates=sourceRows({levers:levers.data,barriers:barriers.data,feedback:feedback.data}),rows=plans.data||[];
  const testIds=rows.map(item=>item.ab_test_id).filter(Boolean);let tests=[];
  if(testIds.length){const result=await db.from('ab_tests').select('id,name,status,evaluation_status,winner_variant_id,result_summary,last_evaluated_at,ab_test_variants(id,name,is_control,impressions,clicks,conversions,orders,revenue,cost,calculated_metrics)').in('id',testIds);if(result.error)throw result.error;tests=result.data||[];}
  const testMap=new Map(tests.map(item=>[item.id,item]));
  const enriched=rows.map(item=>({...item,experiment:item.ab_test_id?testMap.get(item.ab_test_id)||null:null}));
  return {product:{id:loaded.project.master_product_id,name:loaded.product?.name||loaded.project.product_snapshot?.name||'선택 상품'},sources:candidates,evidence:evidence.data||[],plans:enriched,
    summary:{verified_sources:candidates.filter(item=>item.status==='VERIFIED').length,draft_plans:enriched.filter(item=>item.approval_status==='DRAFT').length,awaiting_approval:enriched.filter(item=>item.approval_status==='AWAITING_APPROVAL').length,approved:enriched.filter(item=>item.approval_status==='APPROVED').length,experiments:enriched.filter(item=>item.ab_test_id).length,reports:enriched.filter(item=>item.report_generated_at).length},
    safety:{platform_writes:false,owner_approval_required:true,customer_ids_returned:false,ai_calls:false,experiment_owner:'/ab-tests',approval_owner:'/approvals',validation_owner:'/execution-validation',report_owner:'/diagnoses'}};
}

async function verifiedEvidenceIds(db,projectId,ids){if(!ids.length)return [];const result=await db.from('market_evidence').select('id').eq('project_id',projectId).eq('status','VERIFIED').in('id',ids);if(result.error)throw result.error;return (result.data||[]).map(item=>item.id);}
async function recordVersion(db,projectId,reason,snapshot,actor){const result=await db.rpc('record_market_project_version',{p_project_id:projectId,p_reason:reason,p_snapshot:snapshot,p_actor:String(actor||'OWNER').slice(0,160)});if(result.error)throw result.error;}
async function sourceFor(db,projectId,type,id){const config=type==='GROWTH_LEVER'?['market_growth_levers','id,project_id,status,evidence_ids']:type==='BARRIER'?['market_barriers','id,project_id,status,evidence_ids']:['market_feedback_cards','id,project_id,status,evidence_ids'];const result=await db.from(config[0]).select(config[1]).eq('id',id).eq('project_id',projectId).maybeSingle();if(result.error)throw result.error;if(!result.data)throw new ExecutionBridgeError('현재 상품의 실행 근거를 찾을 수 없습니다.',404,'SOURCE_NOT_FOUND');return result.data;}

async function savePlan({db,projectId,input,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),plan=validatePlan(input),source=await sourceFor(db,loaded.project.id,plan.source_type,plan.source_id);
  const evidenceIds=plan.evidence_ids.length?plan.evidence_ids:source.evidence_ids||[],matched=await verifiedEvidenceIds(db,loaded.project.id,evidenceIds);
  if(matched.length!==evidenceIds.length)throw new ExecutionBridgeError('같은 상품 프로젝트의 검증 Evidence만 연결할 수 있어요.',409,'EVIDENCE_NOT_READY');
  const existing=await db.from('market_execution_plans').select('id,approval_status,ab_test_id').eq('project_id',loaded.project.id).eq('source_type',plan.source_type).eq('source_id',plan.source_id).maybeSingle();if(existing.error)throw existing.error;
  if(existing.data?.approval_status==='APPROVED'||existing.data?.ab_test_id)throw new ExecutionBridgeError('승인되거나 실험실에 연결된 계획은 원본을 보존합니다. 새 근거로 다음 계획을 만들어주세요.',409,'PLAN_LOCKED');
  const payload={...plan,evidence_ids:evidenceIds,project_id:loaded.project.id,master_product_id:loaded.project.master_product_id,approval_status:'DRAFT',owner_confirmed:false,approved_by:null,approved_at:null,rejection_note:null,created_by:String(actor||'OWNER').slice(0,160)};
  const saved=await db.from('market_execution_plans').upsert(payload,{onConflict:'project_id,source_type,source_id'}).select(PLAN_SELECT).single();if(saved.error)throw saved.error;
  await recordVersion(db,loaded.project.id,'MARKET_EXECUTION_PLAN_SAVED',{phase:'17-8',plan_id:saved.data.id,source_type:saved.data.source_type,source_id:saved.data.source_id},actor);
  return loadExecutionBridge({db,projectId:loaded.project.id});
}

async function getPlan(db,projectId,planId){const id=projects.requiredUuid(planId,'실행계획');const result=await db.from('market_execution_plans').select(PLAN_SELECT).eq('id',id).eq('project_id',projectId).maybeSingle();if(result.error)throw result.error;if(!result.data)throw new ExecutionBridgeError('실행계획을 찾을 수 없습니다.',404,'PLAN_NOT_FOUND');return result.data;}
async function transitionPlan({db,projectId,planId,action,note='',actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),plan=await getPlan(db,loaded.project.id,planId),source=await sourceFor(db,loaded.project.id,plan.source_type,plan.source_id);
  let update,reason;
  if(action==='REQUEST_APPROVAL'){
    if(plan.approval_status!=='DRAFT'&&plan.approval_status!=='REJECTED')throw new ExecutionBridgeError('초안 또는 반려된 계획만 승인 요청할 수 있어요.',409,'INVALID_TRANSITION');
    if(source.status!=='VERIFIED')throw new ExecutionBridgeError('사장님이 확인 완료한 분석 근거만 승인 요청할 수 있어요.',409,'SOURCE_NOT_VERIFIED');
    if(!plan.evidence_ids?.length||!plan.hypothesis||!plan.risk_note||!plan.rollback_plan)throw new ExecutionBridgeError('가설·위험·복구 방법과 검증 Evidence를 먼저 채워주세요.',409,'PLAN_INCOMPLETE');
    update={approval_status:'AWAITING_APPROVAL',owner_confirmed:false,approved_by:null,approved_at:null,rejection_note:null};reason='MARKET_EXECUTION_APPROVAL_REQUESTED';
  }else if(action==='APPROVE_PLAN'){
    if(plan.approval_status!=='AWAITING_APPROVAL')throw new ExecutionBridgeError('승인 대기 중인 계획만 승인할 수 있어요.',409,'INVALID_TRANSITION');
    update={approval_status:'APPROVED',owner_confirmed:true,approved_by:String(actor||'OWNER').slice(0,160),approved_at:new Date().toISOString(),rejection_note:null};reason='MARKET_EXECUTION_APPROVED';
  }else if(action==='REJECT_PLAN'){
    if(plan.approval_status!=='AWAITING_APPROVAL')throw new ExecutionBridgeError('승인 대기 중인 계획만 반려할 수 있어요.',409,'INVALID_TRANSITION');
    const rejection_note=text(note,'반려 이유',1000,{required:true});update={approval_status:'REJECTED',owner_confirmed:false,approved_by:null,approved_at:null,rejection_note};reason='MARKET_EXECUTION_REJECTED';
  }else throw new ExecutionBridgeError('승인 작업을 확인해주세요.');
  const saved=await db.from('market_execution_plans').update(update).eq('id',plan.id).eq('approval_status',plan.approval_status).select('id,approval_status').maybeSingle();if(saved.error)throw saved.error;if(!saved.data)throw new ExecutionBridgeError('다른 화면에서 상태가 바뀌었습니다. 새로고침 후 다시 확인해주세요.',409,'CONCURRENT_UPDATE');
  await recordVersion(db,loaded.project.id,reason,{phase:'17-8',plan_id:plan.id,status:saved.data.approval_status},actor);
  return loadExecutionBridge({db,projectId:loaded.project.id});
}

function experimentTarget(sourceType){return sourceType==='FEEDBACK'?'LANDING':sourceType==='BARRIER'?'OTHER':'OFFER';}
async function createDraftExperiment({db,projectId,planId,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),plan=await getPlan(db,loaded.project.id,planId);
  if(plan.approval_status!=='APPROVED')throw new ExecutionBridgeError('사장님 승인 완료 후에만 실험실 초안을 만들 수 있어요.',409,'OWNER_APPROVAL_REQUIRED');
  if(plan.ab_test_id)return loadExecutionBridge({db,projectId:loaded.project.id});
  const test=await experiments.createTest({name:`[${loaded.product?.name||'선택 상품'}] ${plan.title}`,platform:plan.platform,hypothesis:plan.hypothesis,target_type:experimentTarget(plan.source_type),source_type:'MANUAL',metric:plan.metric,start_date:plan.start_date,end_date:plan.end_date,status:'DRAFT',minimum_sample_size:plan.minimum_sample_size,variants:[{name:plan.control_label},{name:plan.variant_label}]});
  const linked=await db.from('market_execution_plans').update({ab_test_id:test.id}).eq('id',plan.id).is('ab_test_id',null).select('id').maybeSingle();if(linked.error)throw linked.error;if(!linked.data){await db.from('ab_test_variants').delete().eq('ab_test_id',test.id);await db.from('ab_tests').delete().eq('id',test.id);throw new ExecutionBridgeError('실험실 연결 상태가 이미 바뀌었습니다.',409,'CONCURRENT_UPDATE');}
  await recordVersion(db,loaded.project.id,'MARKET_EXPERIMENT_DRAFT_CREATED',{phase:'17-8',plan_id:plan.id,ab_test_id:test.id},actor);
  return loadExecutionBridge({db,projectId:loaded.project.id});
}

async function generateReport({db,projectId,planId,actor='OWNER'}){
  const loaded=await projects.loadProject({db,projectId}),plan=await getPlan(db,loaded.project.id,planId);
  if(plan.approval_status!=='APPROVED')throw new ExecutionBridgeError('승인된 계획만 상품 보고서로 남길 수 있어요.',409,'OWNER_APPROVAL_REQUIRED');
  let experiment=null;if(plan.ab_test_id){const result=await db.from('ab_tests').select('id,name,status,evaluation_status,result_summary,last_evaluated_at,ab_test_variants(name,is_control,impressions,clicks,conversions,orders,revenue,cost,calculated_metrics)').eq('id',plan.ab_test_id).maybeSingle();if(result.error)throw result.error;experiment=result.data;}
  const snapshot={schema_version:1,generated_at:new Date().toISOString(),product:{id:loaded.project.master_product_id,name:loaded.product?.name||loaded.project.product_snapshot?.name||'선택 상품'},plan:{id:plan.id,title:plan.title,source_type:plan.source_type,platform:plan.platform,hypothesis:plan.hypothesis,metric:plan.metric,start_date:plan.start_date,end_date:plan.end_date,control_label:plan.control_label,variant_label:plan.variant_label,minimum_sample_size:plan.minimum_sample_size,risk_note:plan.risk_note,rollback_plan:plan.rollback_plan,evidence_count:plan.evidence_ids.length,approval_status:plan.approval_status,approved_at:plan.approved_at},experiment:experiment?{...experiment}:null,safety:{platform_writes:false,customer_ids:false,ai_calls:false}};
  const updated=await db.from('market_execution_plans').update({report_snapshot:snapshot,report_generated_at:snapshot.generated_at}).eq('id',plan.id).select('id').single();if(updated.error)throw updated.error;
  await recordVersion(db,loaded.project.id,'MARKET_EXECUTION_REPORT_GENERATED',{phase:'17-8',plan_id:plan.id,generated_at:snapshot.generated_at},actor);
  return loadExecutionBridge({db,projectId:loaded.project.id});
}

const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function reportHtml(snapshot){if(!snapshot||typeof snapshot!=='object')throw new ExecutionBridgeError('먼저 상품 보고서를 생성해주세요.',409,'REPORT_NOT_READY');const p=snapshot.plan||{},e=snapshot.experiment;return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(snapshot.product?.name)} 실행 보고서</title><style>body{font-family:Arial,sans-serif;color:#27263a;background:#f7f5fb;margin:0;padding:28px}main{max-width:920px;margin:auto;background:#fff;border:1px solid #ddd8ed;border-radius:24px;padding:32px}h1{font-size:28px}h2{margin-top:28px;font-size:19px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.meta span,section{border-radius:16px;background:#f7f4fc;padding:16px}.meta small{display:block;color:#777}.meta b{display:block;margin-top:5px}p{line-height:1.65}.note{color:#6d638f}@media(max-width:640px){body{padding:10px}main{padding:20px}.meta{grid-template-columns:1fr}}@media print{body{background:#fff;padding:0}main{border:0}}</style></head><body><main><small>하린식품 · 상품별 시장·전환 실행 보고서</small><h1>${escapeHtml(snapshot.product?.name)} · ${escapeHtml(p.title)}</h1><div class="meta"><span><small>승인 상태</small><b>${escapeHtml(p.approval_status)}</b></span><span><small>실험 기간</small><b>${escapeHtml(p.start_date)} ~ ${escapeHtml(p.end_date)}</b></span><span><small>성공 지표</small><b>${escapeHtml(p.metric)}</b></span></div><h2>검증 가설</h2><section><p>${escapeHtml(p.hypothesis)}</p></section><h2>위험과 복구</h2><section><b>주의할 위험</b><p>${escapeHtml(p.risk_note)}</p><b>복구 방법</b><p>${escapeHtml(p.rollback_plan)}</p></section><h2>실험실 연결</h2><section><p>${e?`${escapeHtml(e.name)} · ${escapeHtml(e.status)} · ${escapeHtml(e.evaluation_status||'평가 전')}`:'아직 실험실 초안을 만들지 않았습니다.'}</p></section><p class="note">플랫폼 자동 변경이나 고객 개인정보를 포함하지 않은 사장님 승인 기록입니다.</p></main></body></html>`;}

module.exports={SOURCE_TYPES,PLATFORMS,METRICS,ExecutionBridgeError,validatePlan,sourceRows,loadExecutionBridge,savePlan,transitionPlan,createDraftExperiment,generateReport,reportHtml};
