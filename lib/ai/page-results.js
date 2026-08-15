'use strict';

const crypto = require('node:crypto');
const privacy = require('./privacy.js');
const contracts = require('./analysis-contracts.js');

const PREVIEW_VERSION = 'phase12-5d-server-preview-v1';
const ANALYSIS_TYPES = Object.freeze({
  main:'PAGE_MAIN',
  insight:'PAGE_INSIGHT',
  keyword:'PAGE_KEYWORD',
  product:'PAGE_PRODUCT',
  inventory:'PAGE_INVENTORY',
  settlement:'PAGE_SETTLEMENT',
  reports:'PAGE_REPORTS',
  changes:'PAGE_CHANGES',
  validation:'PAGE_VALIDATION',
  experiments:'PAGE_EXPERIMENTS'
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function analysisTypeForPage(page) {
  const found=ANALYSIS_TYPES[String(page||'').trim()];
  if(!found)throw new Error('지원하지 않는 AI 분석 페이지입니다.');
  return found;
}

function previewResult(envelope, panel = {}) {
  privacy.assertNoPii(envelope);
  const ready=['READY','PARTIAL'].includes(envelope.data_status);
  const metricLabel=String(panel.metric_label||'핵심 지표').slice(0,80);
  const metricValue=String(panel.metric_value||'확인 필요').slice(0,80);
  const sources=(panel.sources||[]).slice(0,5).map(value=>String(value).slice(0,100));
  const evidence=sources.length?sources.map(source=>`${source} 서버 집계값`):['서버 집계 자료 확인 필요'];
  const result=ready?{
    decision_status:'PREVIEW',
    observation:`${metricLabel}은 현재 ${metricValue}입니다.`,
    impact:'현재 자료는 페이지별 분석 입력 형식에 맞게 준비되어 있습니다.',
    evidence,
    recommendation:'기준자료 승인과 크레딧 연결 후 같은 형식으로 AI 설명을 생성할 수 있습니다.',
    confidence:'MEDIUM',
    caution:'이 내용은 서버가 만든 비용 없는 미리보기이며 AI 판단이나 실행 결과가 아닙니다.'
  }:{
    decision_status:'BLOCKED',
    observation:`${metricLabel}을 확정하려면 최신 자료를 먼저 확인해야 합니다.`,
    impact:'자료가 없거나 오래된 상태에서 결론을 내리면 매출·이익 판단이 달라질 수 있습니다.',
    evidence:[panel.readiness_label||'자료 확인 필요',...evidence].slice(0,5),
    recommendation:'데이터수집에서 필요한 채널을 갱신한 뒤 다시 미리보기를 저장하세요.',
    confidence:'LOW',
    caution:'확인 전에는 광고·가격·재고·입찰을 변경하지 않습니다.'
  };
  privacy.assertNoPii(result);
  return result;
}

function buildPagePreview({ page, period, generatedAt, dataStatus, metrics, panel } = {}) {
  const checked=contracts.validateAnalysisEnvelope({
    page,
    period,
    generated_at:generatedAt,
    data_status:dataStatus,
    formula_version:PREVIEW_VERSION,
    metrics
  });
  const previewContext={
    metric_label:String(panel?.metric_label||'핵심 지표').slice(0,80),
    metric_value:String(panel?.metric_value||'확인 필요').slice(0,80),
    readiness_label:String(panel?.readiness_label||'자료 확인 필요').slice(0,80),
    sources:(panel?.sources||[]).slice(0,5).map(value=>String(value).slice(0,100))
  };
  privacy.assertNoPii(previewContext);
  const snapshot={
    schema_version:PREVIEW_VERSION,
    analysis_type:analysisTypeForPage(page),
    ...checked.envelope,
    preview_context:previewContext,
    safety:{
      calculations_owned_by_server:true,
      platform_writes_allowed:false,
      owner_approval_required:true,
      openai_called:false
    }
  };
  const result=previewResult(snapshot,previewContext);
  return { contract:checked.contract, snapshot, result, input_fingerprint:fingerprint(snapshot) };
}

function publicRecord(row) {
  if(!row)return null;
  return {
    id:row.id,
    page:row.page_key,
    analysis_type:row.analysis_type,
    status:row.status,
    mode:row.result_mode,
    data_status:row.data_status,
    period:row.period_label,
    formula_version:row.formula_version,
    result:row.result,
    created_at:row.created_at,
    model:row.model||null,
    knowledge_versions:Array.isArray(row.knowledge_versions)?row.knowledge_versions:[]
  };
}

function latestByPage(rows = []) {
  const map={};
  for(const row of rows){
    const page=String(row?.page_key||'');
    if(ANALYSIS_TYPES[page]===row?.analysis_type&&!map[page])map[page]=publicRecord(row);
  }
  return map;
}

async function saveServerPreview(db,{snapshot,result,actor='owner'}={}){
  if(!db)throw new Error('AI 결과 저장소를 사용할 수 없습니다.');
  privacy.assertNoPii(snapshot);
  privacy.assertNoPii(result);
  const analysisType=analysisTypeForPage(snapshot.page);
  if(snapshot.analysis_type!==analysisType)throw new Error('AI 분석 종류가 페이지와 맞지 않습니다.');
  const inputFingerprint=fingerprint(snapshot);
  const existing=await db.from('ai_analysis_results')
    .select('id,analysis_type,page_key,status,result_mode,data_status,period_label,formula_version,result,created_at,model,knowledge_versions')
    .eq('analysis_type',analysisType).eq('input_fingerprint',inputFingerprint)
    .eq('page_key',snapshot.page).eq('result_mode','SERVER_PREVIEW').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return {reused:true,record:publicRecord(existing.data)};
  const saved=await db.from('ai_analysis_results').insert({
    analysis_type:analysisType,
    page_key:snapshot.page,
    status:result.decision_status==='BLOCKED'?'BLOCKED':'PREVIEW',
    result_mode:'SERVER_PREVIEW',
    model:null,
    input_fingerprint:inputFingerprint,
    formula_version:snapshot.formula_version,
    period_label:snapshot.period,
    data_status:snapshot.data_status,
    source_snapshot:snapshot,
    result,
    token_usage:{},
    knowledge_versions:[],
    created_by:String(actor||'owner').slice(0,100)
  }).select('id,analysis_type,page_key,status,result_mode,data_status,period_label,formula_version,result,created_at,model,knowledge_versions').single();
  if(saved.error)throw saved.error;
  return {reused:false,record:publicRecord(saved.data)};
}

module.exports={
  PREVIEW_VERSION,
  ANALYSIS_TYPES,
  analysisTypeForPage,
  buildPagePreview,
  fingerprint,
  latestByPage,
  previewResult,
  publicRecord,
  saveServerPreview
};
