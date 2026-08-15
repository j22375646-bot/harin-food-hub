'use strict';

const openaiClient = require('./openai-client.js');
const contracts = require('./analysis-contracts.js');
const pageResults = require('./page-results.js');
const privacy = require('./privacy.js');
const externalCallGuard = require('../operations/external-call-guard.js');

const SELECT_FIELDS='id,analysis_type,page_key,status,result_mode,data_status,period_label,formula_version,result,created_at,model,knowledge_versions';

function blockedResult(snapshot) {
  const context=snapshot.preview_context||{};
  return {
    decision_status:'BLOCKED',
    observation:`${String(context.metric_label||'핵심 지표')}을 확정할 최신 자료가 충분하지 않습니다.`,
    impact:'자료가 없거나 오래된 상태에서 결론을 내리면 매출·이익·운영 우선순위가 달라질 수 있습니다.',
    evidence:[String(context.readiness_label||'자료 확인 필요'),...(context.sources||[]).map(item=>`${item} 서버 집계 확인 필요`)].slice(0,5),
    recommendation:'데이터수집에서 필요한 채널을 갱신한 뒤 이 페이지에서 다시 자동분석을 실행하세요.',
    confidence:'LOW',
    caution:'확인 전에는 광고·가격·재고·주문·입찰을 변경하지 않습니다.'
  };
}

async function approvedKnowledgeVersions(db,page) {
  if(!db)return [];
  const found=await db.from('ai_knowledge_documents').select('id,version_label')
    .eq('status','ACTIVE').eq('privacy_status','APPROVED').contains('scope_pages',[page])
    .order('updated_at',{ascending:false}).limit(12);
  if(found.error){
    if(/ai_knowledge_documents|relation .* does not exist/i.test(String(found.error.message||found.error)))return [];
    throw found.error;
  }
  return (found.data||[]).map(item=>({id:item.id,version:item.version_label}));
}

async function findReusable(db,{analysisType,page,inputFingerprint}={}) {
  if(!db)return null;
  const found=await db.from('ai_analysis_results').select(SELECT_FIELDS)
    .eq('analysis_type',analysisType).eq('page_key',page)
    .eq('input_fingerprint',inputFingerprint).eq('result_mode','OPENAI')
    .in('status',['READY','BLOCKED']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(found.error)throw found.error;
  return found.data;
}

async function saveResult(db,values) {
  if(!db)throw new Error('AI 결과 저장소를 사용할 수 없습니다.');
  const saved=await db.from('ai_analysis_results').insert(values).select(SELECT_FIELDS).single();
  if(saved.error)throw saved.error;
  return saved.data;
}

async function analyzePageSnapshot({snapshot,db,actor='owner',force=false,createExplanation=openaiClient.createStructuredExplanation}={}) {
  privacy.assertNoPii(snapshot);
  const checked=contracts.validateAnalysisEnvelope(snapshot);
  const page=checked.envelope.page;
  const analysisType=pageResults.analysisTypeForPage(page);
  if(snapshot.schema_version!==pageResults.PREVIEW_VERSION||snapshot.formula_version!==pageResults.PREVIEW_VERSION){
    throw Object.assign(new Error('현재 자동분석 버전과 맞지 않습니다. 화면을 새로고침해주세요.'),{status:409,code:'INVALID_PREVIEW_VERSION'});
  }
  if(snapshot.analysis_type!==analysisType){
    throw Object.assign(new Error('분석 페이지 정보가 맞지 않습니다.'),{status:400,code:'INVALID_ANALYSIS_TYPE'});
  }
  const inputFingerprint=pageResults.fingerprint(snapshot);
  if(!force){
    const existing=await findReusable(db,{analysisType,page,inputFingerprint});
    if(existing)return {reused:true,openai_called:false,record:pageResults.publicRecord(existing)};
  }
  const knowledgeVersions=await approvedKnowledgeVersions(db,page);
  if(!checked.can_run){
    const result=blockedResult(snapshot);
    privacy.assertNoPii(result);
    const saved=await saveResult(db,{
      analysis_type:analysisType,page_key:page,status:'BLOCKED',result_mode:'OPENAI',model:null,
      input_fingerprint:inputFingerprint,formula_version:snapshot.formula_version,period_label:snapshot.period,
      data_status:snapshot.data_status,source_snapshot:snapshot,result,token_usage:{},knowledge_versions:knowledgeVersions,
      created_by:privacy.sanitizeText(actor,100)
    });
    return {reused:false,openai_called:false,record:pageResults.publicRecord(saved)};
  }
  const guardKey=`openai:page-analysis:${page}:${inputFingerprint}`;
  const claimed=await externalCallGuard.claim(db,{key:guardKey,provider:'OPENAI',operation:analysisType,ttlSeconds:180});
  if(!claimed){
    const existing=await findReusable(db,{analysisType,page,inputFingerprint});
    if(existing)return {reused:true,openai_called:false,record:pageResults.publicRecord(existing)};
    throw Object.assign(new Error('같은 페이지 자료의 AI 분석이 이미 진행 중입니다. 잠시 뒤 다시 확인해주세요.'),{status:409,code:'AI_REQUEST_ALREADY_RUNNING'});
  }
  try{
    const response=await createExplanation({contract:checked.contract,snapshot},{useFileSearch:knowledgeVersions.length>0});
    privacy.assertNoPii(response.result);
    const saved=await saveResult(db,{
      analysis_type:analysisType,page_key:page,status:'READY',result_mode:'OPENAI',model:response.model,
      openai_response_id:response.response_id,input_fingerprint:inputFingerprint,formula_version:snapshot.formula_version,
      period_label:snapshot.period,data_status:snapshot.data_status,source_snapshot:snapshot,result:response.result,
      token_usage:response.usage||{},knowledge_versions:knowledgeVersions,created_by:privacy.sanitizeText(actor,100)
    });
    await externalCallGuard.complete(db,guardKey,{status:'SUCCESS',metadata:{record_id:saved.id||null,page}});
    return {reused:false,openai_called:true,record:pageResults.publicRecord(saved),usage:response.usage||{}};
  }catch(error){
    await externalCallGuard.complete(db,guardKey,{status:'FAILED',error:error.message,metadata:{page}}).catch(()=>{});
    throw error;
  }
}

module.exports={ approvedKnowledgeVersions, analyzePageSnapshot, blockedResult, findReusable };
