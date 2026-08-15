'use strict';

const crypto = require('node:crypto');
const openaiClient = require('./openai-client.js');
const { assertNoPii, sanitizeText } = require('./privacy.js');
const externalCallGuard = require('../operations/external-call-guard.js');

const FOUNDATION_VERSION = 'phase12-4-openai-foundation-v1';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildNaverAiSnapshot(board = {}) {
  const snapshot = {
    schema_version:FOUNDATION_VERSION,
    analysis_type:'NAVER_EXECUTIVE_EXPLANATION',
    formula_version:sanitizeText(board.formula_version || 'unknown', 100),
    period:{ start:sanitizeText(board.period_start, 10), end:sanitizeText(board.period_end, 10) },
    target_roas:numberOrNull(board.target_roas),
    data_status:sanitizeText(board.data_trust?.status || 'BLOCKED', 20),
    data_notes:(board.data_trust?.notes || []).slice(0, 6).map(item=>sanitizeText(item, 300)),
    metrics:(board.metrics || []).slice(0, 10).map(item=>({
      key:sanitizeText(item.key, 50), label:sanitizeText(item.label, 80), value:numberOrNull(item.value),
      unit:sanitizeText(item.unit, 20), status:sanitizeText(item.status, 20),
      reason:sanitizeText(item.reason || item.evidence, 300)
    })),
    current:{
      impressions:numberOrNull(board.current?.impressions), clicks:numberOrNull(board.current?.clicks),
      spend:numberOrNull(board.current?.spend), conversions:numberOrNull(board.current?.conversions),
      revenue:numberOrNull(board.current?.revenue), ctr:numberOrNull(board.current?.ctr),
      cvr:numberOrNull(board.current?.cvr), cpc:numberOrNull(board.current?.cpc),
      roas:numberOrNull(board.current?.roas), aov:numberOrNull(board.current?.aov)
    },
    previous:{
      impressions:numberOrNull(board.previous?.impressions), clicks:numberOrNull(board.previous?.clicks),
      spend:numberOrNull(board.previous?.spend), conversions:numberOrNull(board.previous?.conversions),
      revenue:numberOrNull(board.previous?.revenue), ctr:numberOrNull(board.previous?.ctr),
      cvr:numberOrNull(board.previous?.cvr), cpc:numberOrNull(board.previous?.cpc),
      roas:numberOrNull(board.previous?.roas), aov:numberOrNull(board.previous?.aov)
    },
    bottleneck:{
      key:sanitizeText(board.bottleneck?.key, 50), label:sanitizeText(board.bottleneck?.label, 100),
      status:sanitizeText(board.bottleneck?.status, 20), reason:sanitizeText(board.bottleneck?.reason, 300)
    },
    levers:(board.levers || []).slice(0, 3).map(item=>({
      key:sanitizeText(item.key, 50), label:sanitizeText(item.label, 80), status:sanitizeText(item.status, 20),
      current:numberOrNull(item.current), target:numberOrNull(item.target), unit:sanitizeText(item.unit, 20),
      change_rate:numberOrNull(item.change_rate), action:sanitizeText(item.action, 300)
    })),
    safety:{ calculations_owned_by_server:true, platform_writes_allowed:false, owner_approval_required:true }
  };
  assertNoPii(snapshot);
  return snapshot;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}

function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

function blockedResult(snapshot) {
  const notes = snapshot.data_notes.filter(Boolean);
  return {
    decision_status:'BLOCKED',
    observation:'현재 자료의 신뢰도가 충분하지 않아 AI 판단을 보류했습니다.',
    impact:'오래되거나 빠진 자료를 기준으로 광고 결정을 내리면 매출과 이익 판단이 달라질 수 있습니다.',
    evidence:notes.length ? notes.slice(0, 5) : ['서버의 데이터 신뢰도 점검 결과가 BLOCKED입니다.'],
    recommendation:'데이터수집에서 실패하거나 오래된 채널을 먼저 갱신한 뒤 다시 설명을 생성하세요.',
    confidence:'LOW',
    caution:'이 상태에서는 광고비·입찰가·상품 설정을 변경하지 않습니다.'
  };
}

async function saveResult(db, values) {
  if (!db) return { saved:false, reason:'DATABASE_NOT_AVAILABLE' };
  const saved = await db.from('ai_analysis_results').insert(values).select('id,created_at').single();
  if (saved.error) throw saved.error;
  return { saved:true, ...saved.data };
}

async function findReusable(db, inputFingerprint) {
  if (!db) return null;
  const found = await db.from('ai_analysis_results').select('id,status,model,result,created_at,input_fingerprint')
    .eq('analysis_type','NAVER_EXECUTIVE_EXPLANATION').eq('input_fingerprint',inputFingerprint)
    .in('status',['READY','BLOCKED']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if (found.error) throw found.error;
  return found.data;
}

async function explainSnapshot({ snapshot, db, actor = 'owner', force = false, createExplanation = openaiClient.createStructuredExplanation } = {}) {
  assertNoPii(snapshot);
  const inputFingerprint = fingerprint(snapshot);
  if (!force) {
    const existing = await findReusable(db, inputFingerprint);
    if (existing) return { reused:true, record:existing, result:existing.result };
  }
  if (snapshot.data_status === 'BLOCKED' || snapshot.data_status === 'STALE') {
    const result = blockedResult(snapshot);
    const record = await saveResult(db, {
      analysis_type:'NAVER_EXECUTIVE_EXPLANATION', status:'BLOCKED', model:null,
      input_fingerprint:inputFingerprint, formula_version:snapshot.formula_version,
      source_snapshot:snapshot, result, created_by:sanitizeText(actor, 100)
    });
    return { reused:false, record, result };
  }
  const guardKey=`openai:naver-explanation:${inputFingerprint}`;
  const claimed=await externalCallGuard.claim(db,{key:guardKey,provider:'OPENAI',operation:'NAVER_EXECUTIVE_EXPLANATION',ttlSeconds:180});
  if(!claimed){
    const existing=await findReusable(db,inputFingerprint);
    if(existing)return {reused:true,record:existing,result:existing.result};
    throw Object.assign(new Error('같은 자료의 AI 분석이 이미 진행 중입니다. 잠시 뒤 다시 확인해 주세요.'),{status:409,code:'AI_REQUEST_ALREADY_RUNNING'});
  }
  try{
    const response = await createExplanation(snapshot);
    const record = await saveResult(db, {
      analysis_type:'NAVER_EXECUTIVE_EXPLANATION', status:'READY', model:response.model,
      openai_response_id:response.response_id, input_fingerprint:inputFingerprint,
      formula_version:snapshot.formula_version, source_snapshot:snapshot, result:response.result,
      token_usage:response.usage || {}, created_by:sanitizeText(actor, 100)
    });
    await externalCallGuard.complete(db,guardKey,{status:'SUCCESS',metadata:{record_id:record.id||null}});
    return { reused:false, record, result:response.result };
  }catch(error){
    await externalCallGuard.complete(db,guardKey,{status:'FAILED',error:error.message}).catch(()=>{});
    throw error;
  }
}

module.exports = { FOUNDATION_VERSION, blockedResult, buildNaverAiSnapshot, explainSnapshot, fingerprint };
