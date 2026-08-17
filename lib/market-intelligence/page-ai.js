'use strict';

const crypto = require('node:crypto');
const privacy = require('../ai/privacy.js');
const projects = require('./projects.js');
const dataRoom = require('./data-room.js');
const marketProfile = require('./market-profile.js');
const competition = require('./competition.js');
const conversion = require('./conversion.js');
const growthLoop = require('./growth-loop.js');
const executionBridge = require('./execution-bridge.js');

const FORMULA_VERSION='phase17-9-market-page-ai-v1';
const WORKSPACES=Object.freeze({
  data:Object.freeze({id:'data',analysis_type:'MARKET_DATA_AI',label:'자료실',title:'근거 준비도 분석',icon:'database',tone:'blue',purpose:'검수된 출처와 Evidence가 다음 분석 단계에 충분한지 확인'}),
  market:Object.freeze({id:'market',analysis_type:'MARKET_SCOPE_AI',label:'시장 분석',title:'시장범위·고객 신호 분석',icon:'analysis',tone:'lavender',purpose:'승인된 시장범위·리뷰·페르소나의 연결 상태를 설명'}),
  competition:Object.freeze({id:'competition',analysis_type:'MARKET_COMPETITION_AI',label:'경쟁 분석',title:'경쟁 불편·차별화 분석',icon:'search',tone:'pink',purpose:'경쟁 불편과 우리 해결 근거가 실제로 연결됐는지 확인'}),
  conversion:Object.freeze({id:'conversion',analysis_type:'MARKET_CONVERSION_AI',label:'구매 전환',title:'구매장벽·성장 흐름 분석',icon:'target',tone:'mint',purpose:'채널 전환, 구매장벽, 성장 가설과 승인 실행계획을 연결'}),
});

class MarketPageAiError extends Error{
  constructor(message,status=400,code='MARKET_PAGE_AI_INVALID'){super(message);this.name='MarketPageAiError';this.status=status;this.code=code;}
}

function requiredWorkspace(value){const workspace=String(value||'').trim().toLowerCase();if(!WORKSPACES[workspace])throw new MarketPageAiError('시장·전환 AI 분석 단계를 확인해주세요.');return workspace;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function fingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function number(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function evidenceIds(rows=[]){return [...new Set(rows.filter(item=>item?.status==='VERIFIED').map(item=>item.id).filter(Boolean))];}
function freshness(){return new Date().toISOString();}

function ncluePilot({growth,evidence=[]}={}){
  const retention=growth?.retention||{},period=retention.period||{},summary=retention.summary||{};
  const labels=evidence.map(item=>String(item.label||'').toLowerCase());
  const hasConsent=labels.some(label=>/마케팅.*동의|수신.*동의/.test(label));
  const hasLegal=labels.some(label=>/nclue.*(법적|개인정보|검토|승인)|개인정보.*nclue/.test(label));
  const hasConnector=labels.some(label=>/nclue.*(연동|계약|사용).*승인/.test(label));
  const gates=[
    {id:'HISTORY',label:'행동 이력 90일 이상',ready:number(period.days)>=90,detail:number(period.days)?`${number(period.days)}일 집계`:'기간 확인 필요'},
    {id:'SAMPLES',label:'재구매 간격 표본 3개 이상',ready:number(summary.interval_samples)>=3,detail:summary.interval_samples==null?'표본 확인 필요':`${number(summary.interval_samples)}개 표본`},
    {id:'CONSENT',label:'마케팅 수신 동의 근거',ready:hasConsent,detail:hasConsent?'검증 Evidence 연결':'동의 상태 Evidence 필요'},
    {id:'LEGAL',label:'개인정보·법적 적합성',ready:hasLegal,detail:hasLegal?'검토 Evidence 연결':'별도 법적 검토 필요'},
    {id:'CONNECTOR',label:'NCLUE 계약·연동 범위',ready:hasConnector,detail:hasConnector?'연동 승인 Evidence 연결':'기술·비용·API 확인 필요'}
  ];
  const ready=gates.filter(item=>item.ready).length;
  return {
    status:ready===gates.length?'READY':ready>=2?'PARTIAL':'BLOCKED',
    ready_gates:ready,total_gates:gates.length,gates,
    eligible_cohort_count:summary.identified_customers==null?null:number(summary.identified_customers),
    repeat_signal_count:summary.repeat_customers==null?null:number(summary.repeat_customers),
    dormant_signal_count:summary.dormant_customers==null?null:number(summary.dormant_customers),
    safety:'개별 고객 식별값·네이버 사용자 결합·자동 캠페인 실행은 포함하지 않습니다.'
  };
}

function dataSnapshot(data){
  const s=data.summary||{},verified=evidenceIds(data.evidence);
  const ready=number(s.verified_evidence)>0&&number(s.review_required)===0;
  return {data_status:ready?'READY':number(s.sources)>0?'PARTIAL':'BLOCKED',metrics:{source_count:number(s.sources),review_required_count:number(s.review_required),verified_source_count:number(s.verified_sources),verified_evidence_count:number(s.verified_evidence)},evidence_ids:verified};
}
function marketSnapshot(data){const s=data.summary||{};return {data_status:s.readiness==='READY'?'READY':number(s.scope_verified)||number(s.review_sample)||number(s.personas_verified)?'PARTIAL':'BLOCKED',metrics:{verified_scope_count:number(s.scope_verified),scope_total:number(s.scope_total),verified_review_set_count:number(s.review_sets_verified),review_sample_count:number(s.review_sample),verified_persona_count:number(s.personas_verified),verified_evidence_count:number(s.evidence_verified)},evidence_ids:evidenceIds(data.evidence)};}
function competitionSnapshot(data){const s=data.summary||{};return {data_status:s.readiness==='READY'?'READY':number(s.competitors_verified)||number(s.review_sample)||number(s.appeals_verified)?'PARTIAL':'BLOCKED',metrics:{verified_competitor_count:number(s.competitors_verified),competitor_count:number(s.competitors_total),verified_review_set_count:number(s.review_sets_verified),review_sample_count:number(s.review_sample),verified_appeal_count:number(s.appeals_verified),verified_evidence_count:number(s.evidence_verified)},evidence_ids:evidenceIds(data.evidence)};}
function conversionSnapshot({conversionData,growth,execution}){
  const s=conversionData.summary||{},g=growth.summary||{},x=execution.summary||{},pilot=ncluePilot({growth,evidence:growth.evidence});
  const ready=s.readiness==='READY'&&g.readiness==='READY';
  const partial=number(s.channels_ready)||number(s.channels_partial)||number(s.barriers_verified)||number(g.verified_plans)||number(x.approved);
  return {data_status:ready?'READY':partial?'PARTIAL':'BLOCKED',metrics:{ready_channel_count:number(s.channels_ready),partial_channel_count:number(s.channels_partial),verified_barrier_count:number(s.barriers_verified),verified_feedback_count:number(s.feedback_verified),verified_growth_plan_count:number(g.verified_plans),live_growth_signal_count:number(g.live_ready),approved_execution_count:number(x.approved),connected_experiment_count:number(x.experiments)},evidence_ids:[...new Set([...evidenceIds(conversionData.evidence),...evidenceIds(growth.evidence),...evidenceIds(execution.evidence)])],nclue:pilot};
}

function resultFor(snapshot){
  const m=snapshot.metrics||{},ready=snapshot.data_status==='READY';
  const variants={
    data:{observation:`검증 Evidence ${number(m.verified_evidence_count)}개, 추가 검수 ${number(m.review_required_count)}건입니다.`,impact:'검수된 근거만 다음 시장·경쟁·전환 분석에 사용할 수 있습니다.',recommendation:number(m.review_required_count)>0?'원본과 판독 내용을 먼저 확인한 뒤 Evidence를 승인하세요.':'검증 Evidence를 시장범위·경쟁·전환 항목에 연결하세요.',evidence:[`출처 ${number(m.source_count)}개`,`검증 출처 ${number(m.verified_source_count)}개`,`검증 Evidence ${number(m.verified_evidence_count)}개`]},
    market:{observation:`확인된 시장범위 ${number(m.verified_scope_count)}개, 리뷰 표본 ${number(m.review_sample_count)}건, 페르소나 ${number(m.verified_persona_count)}개입니다.`,impact:'시장범위·리뷰·페르소나가 같은 근거로 연결돼야 고객 가설을 실행안으로 넘길 수 있습니다.',recommendation:number(m.verified_scope_count)===0?'시장범위 한 단계부터 Evidence와 함께 확인하세요.':number(m.review_sample_count)<10?'검증 리뷰 표본을 10건 이상 확보하세요.':'페르소나와 선택 기준을 사장님 확인 상태로 저장하세요.',evidence:[`시장범위 ${number(m.verified_scope_count)}/${number(m.scope_total)}`,`검증 리뷰 묶음 ${number(m.verified_review_set_count)}개`,`검증 페르소나 ${number(m.verified_persona_count)}개`]},
    competition:{observation:`검증 경쟁상품 ${number(m.verified_competitor_count)}개, 리뷰 표본 ${number(m.review_sample_count)}건, 확정 소구점 ${number(m.verified_appeal_count)}개입니다.`,impact:'경쟁 불편과 우리 해결 Evidence가 모두 있어야 과장 없는 차별화 문구를 만들 수 있습니다.',recommendation:number(m.verified_competitor_count)===0?'경쟁상품 가격·구성과 출처 Evidence부터 확인하세요.':number(m.review_sample_count)<10?'경쟁 리뷰 표본을 10건 이상 집계하세요.':'불편·해결·근거가 모두 연결된 소구점을 확인하세요.',evidence:[`검증 경쟁상품 ${number(m.verified_competitor_count)}개`,`검증 리뷰 묶음 ${number(m.verified_review_set_count)}개`,`검증 소구점 ${number(m.verified_appeal_count)}개`]},
    conversion:{observation:`확인 가능한 채널 ${number(m.ready_channel_count)}개, 구매장벽 ${number(m.verified_barrier_count)}개, 성장 가설 ${number(m.verified_growth_plan_count)}개입니다.`,impact:'채널 전환자료와 구매장벽·성장 가설이 연결돼야 승인 가능한 실험으로 이어집니다.',recommendation:number(m.ready_channel_count)===0?'상품 매칭과 채널별 전환자료를 먼저 확인하세요.':number(m.verified_barrier_count)===0?'전환자료와 Evidence로 가장 큰 구매장벽을 확인하세요.':number(m.approved_execution_count)===0?'확인한 근거로 실행계획을 만들고 사장님 승인 절차를 진행하세요.':'승인된 계획의 7일·14일 결과를 실행검증에서 확인하세요.',evidence:[`확인 가능 채널 ${number(m.ready_channel_count)}개`,`검증 구매장벽 ${number(m.verified_barrier_count)}개`,`승인 실행계획 ${number(m.approved_execution_count)}개`]}
  };
  const v=variants[snapshot.workspace];
  return {decision_status:ready?'PREVIEW':'BLOCKED',observation:v.observation,impact:v.impact,evidence:v.evidence,recommendation:v.recommendation,confidence:ready?'MEDIUM':'LOW',caution:'서버 집계로 만든 비용 없는 미리보기입니다. AI 호출·고객 재식별·플랫폼 변경은 수행하지 않습니다.'};
}

async function loadWorkspaceData(db,projectId,workspace){
  if(workspace==='data')return dataSnapshot(await dataRoom.loadDataRoom({db,projectId}));
  if(workspace==='market')return marketSnapshot(await marketProfile.loadMarketProfile({db,projectId}));
  if(workspace==='competition')return competitionSnapshot(await competition.loadCompetition({db,projectId}));
  const [conversionData,growth,execution]=await Promise.all([conversion.loadConversion({db,projectId}),growthLoop.loadGrowthLoop({db,projectId}),executionBridge.loadExecutionBridge({db,projectId})]);
  return conversionSnapshot({conversionData,growth,execution});
}

function publicRecord(row){if(!row)return null;return {id:row.id,workspace:row.workspace,analysis_type:row.analysis_type,status:row.status,mode:row.result_mode,data_status:row.data_status,period:row.period_label,formula_version:row.formula_version,result:row.result,created_at:row.created_at,model:row.model||null};}

async function latestRecord(db,projectId,workspace){
  const found=await db.from('market_page_ai_snapshots').select('id,workspace,analysis_type,status,result_mode,data_status,period_label,formula_version,result,created_at,model').eq('project_id',projectId).eq('workspace',workspace).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(found.error){if(/market_page_ai_snapshots|relation .* does not exist/i.test(String(found.error.message||found.error)))return null;throw found.error;}return publicRecord(found.data);
}

async function buildPreview({db,projectId,workspace}={}){
  const stage=WORKSPACES[requiredWorkspace(workspace)],loaded=await projects.loadProject({db,projectId}),project=loaded.project;
  const values=await loadWorkspaceData(db,project.id,stage.id),snapshot={schema_version:FORMULA_VERSION,formula_version:FORMULA_VERSION,workspace:stage.id,analysis_type:stage.analysis_type,project_id:project.id,master_product_id:project.master_product_id,product_label:loaded.product?.name||project.product_snapshot?.name||'선택 상품',generated_at:freshness(),period:'현재 상품 프로젝트',data_status:values.data_status,metrics:values.metrics,evidence_ids:values.evidence_ids,safety:{aggregate_only:true,pii_allowed:false,platform_writes:false,owner_approval_required:true,openai_called:false}};
  if(values.nclue)snapshot.nclue=values.nclue;
  privacy.assertNoPii(snapshot);
  return {contract:stage,snapshot,result:resultFor(snapshot),input_fingerprint:fingerprint({...snapshot,generated_at:null})};
}

async function loadPageAi({db,projectId,workspace}={}){const preview=await buildPreview({db,projectId,workspace});return {...preview,latest:await latestRecord(db,preview.snapshot.project_id,preview.snapshot.workspace),openai_enabled:false,openai_called:false,cost_krw:0};}

async function savePreview({db,projectId,workspace,actor='OWNER'}={}){
  const preview=await buildPreview({db,projectId,workspace}),s=preview.snapshot,r=preview.result;
  const existing=await db.from('market_page_ai_snapshots').select('id,workspace,analysis_type,status,result_mode,data_status,period_label,formula_version,result,created_at,model').eq('project_id',s.project_id).eq('workspace',s.workspace).eq('input_fingerprint',preview.input_fingerprint).eq('result_mode','SERVER_PREVIEW').maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)return {reused:true,record:publicRecord(existing.data),preview};
  const saved=await db.from('market_page_ai_snapshots').insert({project_id:s.project_id,master_product_id:s.master_product_id,workspace:s.workspace,analysis_type:s.analysis_type,result_mode:'SERVER_PREVIEW',status:r.decision_status==='BLOCKED'?'BLOCKED':'PREVIEW',data_status:s.data_status,input_fingerprint:preview.input_fingerprint,formula_version:FORMULA_VERSION,period_label:s.period,source_snapshot:s,result:r,evidence_ids:s.evidence_ids,model:null,token_usage:{},created_by:privacy.sanitizeText(actor,160)}).select('id,workspace,analysis_type,status,result_mode,data_status,period_label,formula_version,result,created_at,model').single();
  if(saved.error)throw saved.error;
  const version=await db.rpc('record_market_project_version',{p_project_id:s.project_id,p_reason:'MARKET_PAGE_AI_PREVIEW_SAVED',p_snapshot:{phase:'17-9',workspace:s.workspace,analysis_type:s.analysis_type,record_id:saved.data.id,data_status:s.data_status,input_fingerprint:preview.input_fingerprint},p_actor:privacy.sanitizeText(actor,160)});if(version.error)throw version.error;
  return {reused:false,record:publicRecord(saved.data),preview};
}

module.exports={FORMULA_VERSION,WORKSPACES,MarketPageAiError,requiredWorkspace,stable,fingerprint,ncluePilot,dataSnapshot,marketSnapshot,competitionSnapshot,conversionSnapshot,resultFor,buildPreview,loadPageAi,savePreview,publicRecord};
