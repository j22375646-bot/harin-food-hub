'use strict';

const crypto = require('node:crypto');
const supabaseModule = require('../cafe24/supabase.js');
const pacingService = require('../analytics/pacing-service.js');
const costCalibrationModule = require('../analytics/cost-calibration.js');
const cafe24Catalog = require('../products/cafe24-catalog.js');
const naverBidExecution = require('../naver/bid-execution.js');
const { monthBounds } = require('../analytics/pacing.js');

const PLATFORMS = new Set(['NAVER', 'CAFE24', 'COUPANG']);
const TARGET_PLATFORMS = new Set(['ALL', ...PLATFORMS]);
const FINAL_EXECUTION_STATUSES = new Set(['EXECUTED', 'VERIFIED', 'VERIFICATION_FAILED']);

class FinancialChangeError extends Error {
  constructor(message, status = 400, code = 'INVALID_CHANGE') {
    super(message);
    this.name = 'FinancialChangeError';
    this.status = status;
    this.code = code;
  }
}

const cleanText = (value, max = 500) => String(value || '').trim().slice(0, max) || null;
const cleanActor = value => cleanText(value, 100) || 'dashboard-session';
const validIdempotencyKey = value => {
  const key = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new FinancialChangeError('유효한 Idempotency-Key가 필요합니다.', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  return key;
};
const amount = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new FinancialChangeError(`${label}은(는) 0 이상의 숫자여야 합니다.`);
  return parsed;
};
const percentRate = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new FinancialChangeError(`${label}은(는) 0~100 사이여야 합니다.`);
  return parsed / 100;
};
const platform = (value, target = false) => {
  const normalized = String(value || '').toUpperCase();
  if (!(target ? TARGET_PLATFORMS : PLATFORMS).has(normalized)) throw new FinancialChangeError('지원하지 않는 플랫폼입니다.');
  return normalized;
};
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function normalizeStored(changeType, row) {
  if (!row) return { exists:false, values:{} };
  if (changeType === 'NAVER_BID') return { exists:true, values:{ ncc_keyword_id:String(row.ncc_keyword_id), bid_amount:Number(row.bid_amount) } };
  if (changeType === 'PRODUCT_COST') return { exists:true, values:{ master_product_id:String(row.master_product_id), unit_cost:Number(row.unit_cost), packaging_cost:Number(row.packaging_cost), other_unit_cost:Number(row.other_unit_cost), notes:row.notes || null } };
  if (changeType === 'CHANNEL_COST') return { exists:true, values:{ platform:String(row.platform), commission_rate:Number(row.commission_rate), payment_fee_rate:Number(row.payment_fee_rate), default_shipping_cost:Number(row.default_shipping_cost), notes:row.notes || null } };
  if (changeType === 'SHIPPING_RULE') return { exists:true, values:{ platform:String(row.platform), return_shipping_cost:Number(row.return_shipping_cost), return_rate:Number(row.return_rate), remote_area_surcharge:Number(row.remote_area_surcharge), remote_area_rate:Number(row.remote_area_rate), notes:row.notes || null } };
  return { exists:true, values:{ target_month:String(row.target_month).slice(0, 10), platform:String(row.platform), revenue_target:Number(row.revenue_target), ad_budget:Number(row.ad_budget), target_roas:Number(row.target_roas), notes:row.notes || null } };
}

async function normalizeRequest(input, db) {
  const type = String(input.type || input.change_type || '').toUpperCase();
  if (type === 'PRODUCT' || type === 'PRODUCT_COST') {
    const id = String(input.master_product_id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FinancialChangeError('기준상품을 확인해주세요.');
    const proposed = { master_product_id:id, unit_cost:amount(input.unit_cost, '상품 원가'), packaging_cost:amount(input.packaging_cost, '포장비'), other_unit_cost:amount(input.other_unit_cost, '기타 단위비'), notes:cleanText(input.notes) };
    const eligibility = await cafe24Catalog.masterProductEligibility({ db, masterProductId:id });
    if (!eligibility.eligible) throw new FinancialChangeError('판매중인 Cafe24 상품만 원가를 입력할 수 있습니다.', 409, 'PRODUCT_NOT_SELLING');
    return { changeType:'PRODUCT_COST', targetType:'product_costs', targetKey:id, platform:null, proposed, metadata:{} };
  }
  if (type === 'CHANNEL' || type === 'CHANNEL_COST') {
    const targetPlatform = platform(input.platform);
    return { changeType:'CHANNEL_COST', targetType:'channel_cost_settings', targetKey:targetPlatform, platform:targetPlatform, proposed:{ platform:targetPlatform, commission_rate:percentRate(input.commission_rate, '판매수수료'), payment_fee_rate:percentRate(input.payment_fee_rate, '결제수수료'), default_shipping_cost:amount(input.default_shipping_cost, '기본 배송비'), notes:cleanText(input.notes) }, metadata:{} };
  }
  if (type === 'SHIPPING_RULE') {
    const targetPlatform = platform(input.platform);
    return { changeType:'SHIPPING_RULE', targetType:'channel_shipping_rules', targetKey:targetPlatform, platform:targetPlatform, proposed:{ platform:targetPlatform, return_shipping_cost:amount(input.return_shipping_cost, '반품 택배비'), return_rate:percentRate(input.return_rate, '예상 반품률'), remote_area_surcharge:amount(input.remote_area_surcharge, '도서산간 추가비'), remote_area_rate:percentRate(input.remote_area_rate, '도서산간 주문비율'), notes:cleanText(input.notes) }, metadata:{} };
  }
  if (type === 'BUSINESS_TARGET') {
    const targetPlatform = platform(input.platform, true);
    const bounds = monthBounds(String(input.month || input.target_month || '').slice(0, 7));
    return { changeType:'BUSINESS_TARGET', targetType:'business_targets', targetKey:`${bounds.start}:${targetPlatform}`, platform:targetPlatform, proposed:{ target_month:bounds.start, platform:targetPlatform, revenue_target:amount(input.revenueTarget ?? input.revenue_target, '월 매출목표'), ad_budget:amount(input.adBudget ?? input.ad_budget, '월 광고예산'), target_roas:amount(input.targetRoas ?? input.target_roas, '목표 ROAS'), notes:cleanText(input.notes) }, metadata:{} };
  }
  if (type === 'COUPANG_CALIBRATION_APPLY') {
    const calibration = await costCalibrationModule.refreshCoupangCostCalibration({ db, triggerType:'CHANGE_PREVIEW' });
    if (!calibration.auto_applied) throw new FinancialChangeError('실제 비용 표본이 부족해 쿠팡 보정값을 승인 요청으로 만들 수 없습니다.');
    const effective = calibration.effective_setting;
    return { changeType:'CHANNEL_COST', targetType:'channel_cost_settings', targetKey:'COUPANG', platform:'COUPANG', proposed:{ platform:'COUPANG', commission_rate:Number(effective.commission_rate), payment_fee_rate:Number(effective.payment_fee_rate), default_shipping_cost:Number(effective.default_shipping_cost), notes:`실정산 승인 보정 · ${calibration.period_start || '-'}~${calibration.period_end || '-'} · ${calibration.confidence}` }, metadata:{ calibration_id:calibration.id, confidence:calibration.confidence, period_start:calibration.period_start, period_end:calibration.period_end } };
  }
  throw new FinancialChangeError('지원하지 않는 금액 변경 유형입니다.');
}

async function readCurrent(db, spec) {
  const changeType = spec.changeType || spec.change_type;
  const targetKey = spec.targetKey || spec.target_key;
  let query;
  if (changeType === 'NAVER_BID') query = db.from('naver_keywords').select('ncc_keyword_id,bid_amount').eq('ncc_keyword_id', targetKey).maybeSingle();
  else if (changeType === 'PRODUCT_COST') query = db.from('product_costs').select('master_product_id,unit_cost,packaging_cost,other_unit_cost,notes').eq('master_product_id', targetKey).maybeSingle();
  else if (changeType === 'CHANNEL_COST') query = db.from('channel_cost_settings').select('platform,commission_rate,payment_fee_rate,default_shipping_cost,notes').eq('platform', targetKey).maybeSingle();
  else if (changeType === 'SHIPPING_RULE') query = db.from('channel_shipping_rules').select('platform,return_shipping_cost,return_rate,remote_area_surcharge,remote_area_rate,notes').eq('platform', targetKey).maybeSingle();
  else {
    const [targetMonth, targetPlatform] = targetKey.split(':');
    query = db.from('business_targets').select('target_month,platform,revenue_target,ad_budget,target_roas,notes').eq('target_month', targetMonth).eq('platform', targetPlatform).maybeSingle();
  }
  const result = await query;
  if (result.error) throw result.error;
  return normalizeStored(changeType, result.data);
}

function impactPreview(before, proposed, metadata = {}) {
  const changes = [];
  for (const [field, after] of Object.entries(proposed)) {
    if (['platform', 'master_product_id', 'target_month'].includes(field)) continue;
    const previous = before.exists ? before.values[field] ?? null : null;
    if (same(previous, after)) continue;
    const numeric = typeof after === 'number' && (previous == null || Number.isFinite(Number(previous)));
    changes.push({ field, before:previous, after, delta:numeric ? Number(after) - Number(previous || 0) : null, change_rate:numeric && Number(previous) !== 0 ? (Number(after) - Number(previous)) / Math.abs(Number(previous)) : null });
  }
  return { changed_fields:changes.map(item => item.field), changes, creates_new_record:!before.exists, metadata };
}

async function audit(db, requestId, eventType, fromStatus, toStatus, actor, detail = {}) {
  const result = await db.from('financial_change_audit_logs').insert({ change_request_id:requestId, event_type:eventType, from_status:fromStatus || null, to_status:toStatus || null, actor:cleanActor(actor), detail });
  if (result.error) throw result.error;
}

async function createPreview(input, { db = supabaseModule.getSupabase(), idempotencyKey, actor } = {}) {
  const key = validIdempotencyKey(idempotencyKey || input.idempotency_key);
  const existing = await db.from('financial_change_requests').select('*').eq('idempotency_key', key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { request:existing.data, reused:true };
  const spec = await normalizeRequest(input, db);
  const before = await readCurrent(db, spec);
  const proposed = { exists:true, values:spec.proposed };
  const preview = impactPreview(before, spec.proposed, spec.metadata);
  if (!preview.changed_fields.length) throw new FinancialChangeError('현재 설정과 같은 값입니다.', 409, 'NO_CHANGE');
  const row = {
    idempotency_key:key, change_type:spec.changeType, target_type:spec.targetType, target_key:spec.targetKey,
    platform:spec.platform, before_value:before, proposed_value:proposed, impact_preview:preview,
    rollback_value:before, preview_hash:digest({ changeType:spec.changeType, targetKey:spec.targetKey, before, proposed }),
    requested_by:cleanActor(actor)
  };
  let inserted = await db.from('financial_change_requests').insert(row).select('*').single();
  if (inserted.error?.code === '23505') inserted = await db.from('financial_change_requests').select('*').eq('idempotency_key', key).single();
  if (inserted.error) throw inserted.error;
  await audit(db, inserted.data.id, 'PREVIEW_CREATED', null, 'PREVIEWED', actor, { preview_hash:inserted.data.preview_hash, changed_fields:preview.changed_fields });
  return { request:inserted.data, reused:false };
}

async function createNaverBidPreview(snapshot, ownerDesiredBid, { db = supabaseModule.getSupabase(), idempotencyKey, actor } = {}) {
  const key = validIdempotencyKey(idempotencyKey);
  const existing = await db.from('financial_change_requests').select('*').eq('idempotency_key', key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { request:existing.data, reused:true };
  if (!snapshot || snapshot.scope !== 'naver-bid-proposal') {
    throw new FinancialChangeError('서버가 확인한 네이버 입찰 미리보기가 필요합니다.', 400, 'BID_SNAPSHOT_REQUIRED');
  }
  const targetKey = String(snapshot.ncc_keyword_id || '').trim();
  if (!/^nkw-[A-Za-z0-9-]+$/.test(targetKey)) throw new FinancialChangeError('네이버 키워드 ID를 확인해주세요.', 400, 'INVALID_KEYWORD_ID');
  const desired = Number(ownerDesiredBid ?? snapshot.recommended_bid);
  const minimum = Number(snapshot.minimum_owner_bid);
  const maximum = Number(snapshot.maximum_owner_bid);
  if (!Number.isInteger(desired) || desired < 70 || desired > 100000 || desired % 10 !== 0) {
    throw new FinancialChangeError('입찰가는 70원 이상 100,000원 이하의 10원 단위여야 합니다.', 400, 'INVALID_BID_AMOUNT');
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || desired < minimum || desired > maximum) {
    throw new FinancialChangeError('안전 범위를 벗어난 입찰가는 승인 요청으로 만들 수 없습니다.', 409, 'BID_OUTSIDE_SAFE_RANGE');
  }
  const spec = { changeType:'NAVER_BID', targetType:'naver_keywords', targetKey, platform:'NAVER' };
  const before = await readCurrent(db, spec);
  if (!before.exists) throw new FinancialChangeError('네이버 키워드를 찾을 수 없습니다.', 404, 'KEYWORD_NOT_FOUND');
  if (Number(before.values.bid_amount) !== Number(snapshot.current_bid)) {
    throw new FinancialChangeError('미리보기 이후 현재 입찰가가 바뀌었습니다. 새로고침 후 다시 확인해주세요.', 409, 'BID_SNAPSHOT_STALE');
  }
  const proposedValues = { ncc_keyword_id:targetKey, bid_amount:desired };
  const proposed = { exists:true, values:proposedValues };
  const metadata = {
    keyword:String(snapshot.keyword || '').slice(0, 200),
    recommended_bid:Number(snapshot.recommended_bid), owner_desired_bid:desired,
    current_cpc:snapshot.metrics?.current_cpc ?? null,
    allowable_cpc:snapshot.product_target?.allowable_cpc ?? null,
    product_target:snapshot.product_target || null,
    period_start:snapshot.period_start || null, period_end:snapshot.period_end || null,
    formula_version:snapshot.formula_version || null,
    external_execution_locked:!naverBidExecution.configuration().write_enabled,
    automation:snapshot.automation || null,
    execution_phase:snapshot.execution_phase || '12-7'
  };
  const preview = impactPreview(before, proposedValues, metadata);
  if (!preview.changed_fields.length) throw new FinancialChangeError('현재 입찰가와 같은 값입니다.', 409, 'NO_CHANGE');
  const row = {
    idempotency_key:key, change_type:'NAVER_BID', target_type:'naver_keywords', target_key:targetKey,
    platform:'NAVER', before_value:before, proposed_value:proposed, impact_preview:preview,
    rollback_value:before, preview_hash:digest({ changeType:'NAVER_BID', targetKey, before, proposed }),
    requested_by:cleanActor(actor)
  };
  let inserted = await db.from('financial_change_requests').insert(row).select('*').single();
  if (inserted.error?.code === '23505') inserted = await db.from('financial_change_requests').select('*').eq('idempotency_key', key).single();
  if (inserted.error) throw inserted.error;
  await audit(db, inserted.data.id, 'NAVER_BID_PREVIEW_CREATED', null, 'PREVIEWED', actor, { preview_hash:inserted.data.preview_hash, recommended_bid:Number(snapshot.recommended_bid), owner_desired_bid:desired, external_execution_locked:metadata.external_execution_locked, execution_phase:snapshot.execution_phase||'12-7' });
  return { request:inserted.data, reused:false };
}

async function getRequest(db, id) {
  const result = await db.from('financial_change_requests').select('*').eq('id', id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new FinancialChangeError('변경 요청을 찾을 수 없습니다.', 404, 'CHANGE_NOT_FOUND');
  return result.data;
}

async function updateFrom(db, request, expectedStatus, patch) {
  const result = await db.from('financial_change_requests').update(patch).eq('id', request.id).eq('status', expectedStatus).select('*').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new FinancialChangeError('다른 요청이 먼저 처리했습니다. 최신 상태를 다시 확인해주세요.', 409, 'STATE_CONFLICT');
  return result.data;
}

async function approve(id, { db = supabaseModule.getSupabase(), actor, note } = {}) {
  const request = await getRequest(db, id);
  if (request.status === 'APPROVED') return { request, reused:true };
  if (request.status !== 'PREVIEWED') throw new FinancialChangeError('미리보기 상태에서만 승인할 수 있습니다.', 409, 'INVALID_STATE');
  if (new Date(request.expires_at).getTime() <= Date.now()) {
    const expired = await updateFrom(db, request, 'PREVIEWED', { status:'EXPIRED', error_message:'미리보기 유효시간 30분 만료' });
    await audit(db, id, 'PREVIEW_EXPIRED', 'PREVIEWED', 'EXPIRED', actor);
    return { request:expired, expired:true };
  }
  const current = await readCurrent(db, request);
  if (!same(current, request.before_value)) {
    const stale = await updateFrom(db, request, 'PREVIEWED', { status:'STALE', error_message:'미리보기 이후 원본 값이 변경됨' });
    await audit(db, id, 'PREVIEW_STALE', 'PREVIEWED', 'STALE', actor, { current });
    return { request:stale, stale:true };
  }
  const approved = await updateFrom(db, request, 'PREVIEWED', { status:'APPROVED', approved_by:cleanActor(actor), approved_at:new Date().toISOString(), approval_note:cleanText(note) });
  await audit(db, id, 'APPROVED', 'PREVIEWED', 'APPROVED', actor, { note:cleanText(note) });
  return { request:approved, reused:false };
}

async function applySnapshot(db, request, snapshot, { operation='EXECUTE', actor } = {}) {
  const values = snapshot?.values || {};
  if (request.change_type === 'NAVER_BID') {
    const expectedBid=operation==='ROLLBACK' ? request.proposed_value?.values?.bid_amount : request.before_value?.values?.bid_amount;
    try { return await naverBidExecution.applyBid({ db, request, targetBid:values.bid_amount, expectedBid, operation, actor }); }
    catch (error) {
      if (error instanceof naverBidExecution.NaverBidExecutionError) throw new FinancialChangeError(error.message, error.status, error.code);
      throw error;
    }
  }
  if (!snapshot?.exists) {
    let deletion;
    if (request.change_type === 'PRODUCT_COST') deletion = db.from('product_costs').delete().eq('master_product_id', request.target_key);
    else if (request.change_type === 'BUSINESS_TARGET') {
      const [targetMonth, targetPlatform] = request.target_key.split(':');
      deletion = db.from('business_targets').delete().eq('target_month', targetMonth).eq('platform', targetPlatform);
    } else throw new FinancialChangeError('기본 채널 설정은 삭제 롤백할 수 없습니다.', 409, 'ROLLBACK_NOT_SUPPORTED');
    const result = await deletion;
    if (result.error) throw result.error;
    return;
  }
  let result;
  if (request.change_type === 'PRODUCT_COST') result = await db.from('product_costs').upsert(values, { onConflict:'master_product_id' });
  else if (request.change_type === 'CHANNEL_COST') result = await db.from('channel_cost_settings').upsert(values, { onConflict:'platform' });
  else if (request.change_type === 'SHIPPING_RULE') result = await db.from('channel_shipping_rules').upsert(values, { onConflict:'platform' });
  else {
    await pacingService.saveTarget({ month:String(values.target_month).slice(0, 7), platform:values.platform, revenueTarget:values.revenue_target, adBudget:values.ad_budget, targetRoas:values.target_roas, notes:values.notes }, db);
    return;
  }
  if (result.error) throw result.error;
}

async function execute(id, { db = supabaseModule.getSupabase(), actor } = {}) {
  const request = await getRequest(db, id);
  if (FINAL_EXECUTION_STATUSES.has(request.status)) return { request, reused:true };
  if (request.status === 'EXECUTING') {
    const current = request.change_type==='NAVER_BID' ? await naverBidExecution.readLiveBid({ db, request }) : await readCurrent(db, request);
    let externalResult=null;
    if (!same(current, request.proposed_value)) externalResult=await applySnapshot(db, request, request.proposed_value, { operation:'EXECUTE', actor });
    const completed = await updateFrom(db, request, 'EXECUTING', { status:'EXECUTED', executed_at:new Date().toISOString(), error_message:null });
    await audit(db, id, 'EXECUTION_RECOVERED', 'EXECUTING', 'EXECUTED', actor, externalResult || {});
    return { request:completed, reused:true, recovered:true, external_result:externalResult };
  }
  if (!['APPROVED','FAILED'].includes(request.status)) throw new FinancialChangeError('승인된 요청만 실행할 수 있습니다.', 409, 'INVALID_STATE');
  const current = await readCurrent(db, request);
  const expectedLocal=request.status==='FAILED'&&request.change_type==='NAVER_BID' ? [request.before_value,request.proposed_value] : [request.before_value];
  if (!expectedLocal.some(value=>same(current,value))) {
    const stale = await updateFrom(db, request, request.status, { status:'STALE', error_message:'승인 이후 원본 값이 변경됨' });
    await audit(db, id, 'EXECUTION_BLOCKED_STALE', request.status, 'STALE', actor, { current });
    return { request:stale, stale:true };
  }
  const executing = await updateFrom(db, request, request.status, { status:'EXECUTING', executed_by:cleanActor(actor), execution_started_at:new Date().toISOString(), error_message:null });
  await audit(db, id, 'EXECUTION_STARTED', request.status, 'EXECUTING', actor);
  try {
    const externalResult=await applySnapshot(db, executing, executing.proposed_value, { operation:'EXECUTE', actor });
    const calibrationId = executing.impact_preview?.metadata?.calibration_id;
    if (calibrationId) {
      const marked = await db.from('channel_cost_calibrations').update({ applied_at:new Date().toISOString() }).eq('id', calibrationId);
      if (marked.error) await audit(db, id, 'CALIBRATION_MARK_WARNING', 'EXECUTING', 'EXECUTING', actor, { error:marked.error.message });
    }
    const completed = await updateFrom(db, executing, 'EXECUTING', { status:'EXECUTED', executed_at:new Date().toISOString() });
    await audit(db, id, 'EXECUTED', 'EXECUTING', 'EXECUTED', actor, externalResult || {});
    return { request:completed, reused:false, external_result:externalResult };
  } catch (error) {
    const actual = await (executing.change_type==='NAVER_BID' ? naverBidExecution.readLiveBid({ db, request:executing }) : readCurrent(db, executing)).catch(() => null);
    if (actual && same(actual, executing.proposed_value)) {
      const recovered = await updateFrom(db, executing, 'EXECUTING', { status:'EXECUTED', executed_at:new Date().toISOString(), error_message:null });
      await audit(db, id, 'EXECUTION_RECOVERED', 'EXECUTING', 'EXECUTED', actor, { recovered_after_error:String(error.message || error).slice(0, 500) });
      return { request:recovered, reused:false, recovered:true };
    }
    const failed = await updateFrom(db, executing, 'EXECUTING', { status:'FAILED', error_message:String(error.message || error).slice(0, 1000) });
    await audit(db, id, 'EXECUTION_FAILED', 'EXECUTING', 'FAILED', actor, { error:failed.error_message });
    throw error;
  }
}

async function verify(id, { db = supabaseModule.getSupabase(), actor } = {}) {
  const request = await getRequest(db, id);
  if (['VERIFIED', 'VERIFICATION_FAILED'].includes(request.status)) return { request, reused:true };
  if (request.status !== 'EXECUTED') throw new FinancialChangeError('실행된 요청만 검증할 수 있습니다.', 409, 'INVALID_STATE');
  const current = request.change_type==='NAVER_BID' ? await naverBidExecution.readLiveBid({ db, request }) : await readCurrent(db, request);
  const verified = same(current, request.proposed_value);
  const status = verified ? 'VERIFIED' : 'VERIFICATION_FAILED';
  const updated = await updateFrom(db, request, 'EXECUTED', { status, verified_by:cleanActor(actor), verified_at:new Date().toISOString(), verification_result:{ matched:verified, expected:request.proposed_value, actual:current }, error_message:verified ? null : '실행 후 값이 승인안과 일치하지 않음' });
  await audit(db, id, verified ? 'VERIFIED' : 'VERIFICATION_FAILED', 'EXECUTED', status, actor, { matched:verified, actual:current });
  return { request:updated, verified, reused:false };
}

async function confirmAndExecute(id, { db = supabaseModule.getSupabase(), actor, note } = {}) {
  let request = await getRequest(db, id);
  if (['VERIFIED', 'VERIFICATION_FAILED'].includes(request.status)) {
    return { request, verified:request.status === 'VERIFIED', reused:true, applied:true };
  }

  let confirmation = null;
  if (request.status === 'PREVIEWED') {
    confirmation = await approve(id, { db, actor, note:note || '사장님 확인 후 즉시 실행' });
    request = confirmation.request;
    if (confirmation.expired || confirmation.stale) {
      return {
        request,
        verified:false,
        reused:false,
        applied:false,
        blocked:true,
        expired:Boolean(confirmation.expired),
        stale:Boolean(confirmation.stale)
      };
    }
  }

  let execution = null;
  if (['APPROVED', 'FAILED', 'EXECUTING'].includes(request.status)) {
    execution = await execute(id, { db, actor });
    request = execution.request;
  }

  if (request.status === 'EXECUTED') {
    const verification = await verify(id, { db, actor });
    await audit(db, id, 'OWNER_DIRECT_EXECUTION_COMPLETED', request.status, verification.request.status, actor, {
      verified:Boolean(verification.verified),
      confirmation_required_once:true
    });
    return {
      request:verification.request,
      verified:Boolean(verification.verified),
      reused:Boolean(confirmation?.reused && execution?.reused && verification.reused),
      applied:true,
      confirmation,
      execution,
      verification
    };
  }

  if (['VERIFIED', 'VERIFICATION_FAILED'].includes(request.status)) {
    return { request, verified:request.status === 'VERIFIED', reused:true, applied:true, confirmation, execution };
  }

  throw new FinancialChangeError('현재 상태에서는 바로 실행할 수 없습니다. 변경 기록에서 상태를 확인해주세요.', 409, 'INVALID_STATE');
}

async function rollback(id, { db = supabaseModule.getSupabase(), actor } = {}) {
  const request = await getRequest(db, id);
  if (request.status === 'ROLLED_BACK') return { request, reused:true };
  if (request.status === 'ROLLBACK_REQUESTED') {
    const current = request.change_type==='NAVER_BID' ? await naverBidExecution.readLiveBid({ db, request }) : await readCurrent(db, request);
    if (!same(current, request.rollback_value)) await applySnapshot(db, request, request.rollback_value, { operation:'ROLLBACK', actor });
    const actual = request.change_type==='NAVER_BID' ? await naverBidExecution.readLiveBid({ db, request }) : await readCurrent(db, request);
    if (!same(actual, request.rollback_value)) throw new FinancialChangeError('롤백 재시도 후 원본 값이 일치하지 않습니다.', 409, 'ROLLBACK_MISMATCH');
    const completed = await updateFrom(db, request, 'ROLLBACK_REQUESTED', { status:'ROLLED_BACK', rolled_back_at:new Date().toISOString(), verification_result:{ rollback_matched:true, actual }, error_message:null });
    await audit(db, id, 'ROLLBACK_RECOVERED', 'ROLLBACK_REQUESTED', 'ROLLED_BACK', actor, { actual });
    return { request:completed, reused:true, recovered:true };
  }
  if (!['EXECUTED', 'VERIFIED', 'VERIFICATION_FAILED'].includes(request.status)) throw new FinancialChangeError('실행된 요청만 롤백할 수 있습니다.', 409, 'INVALID_STATE');
  const claimed = await updateFrom(db, request, request.status, { status:'ROLLBACK_REQUESTED', rolled_back_by:cleanActor(actor), error_message:null });
  await audit(db, id, 'ROLLBACK_STARTED', request.status, 'ROLLBACK_REQUESTED', actor);
  try {
    const externalResult=await applySnapshot(db, claimed, claimed.rollback_value, { operation:'ROLLBACK', actor });
    const actual = claimed.change_type==='NAVER_BID' ? await naverBidExecution.readLiveBid({ db, request:claimed }) : await readCurrent(db, claimed);
    if (!same(actual, claimed.rollback_value)) throw new Error('롤백 후 값이 원본과 일치하지 않습니다.');
    const completed = await updateFrom(db, claimed, 'ROLLBACK_REQUESTED', { status:'ROLLED_BACK', rolled_back_at:new Date().toISOString(), verification_result:{ rollback_matched:true, actual } });
    await audit(db, id, 'ROLLED_BACK', 'ROLLBACK_REQUESTED', 'ROLLED_BACK', actor, { actual, external_result:externalResult || null });
    return { request:completed, reused:false, external_result:externalResult };
  } catch (error) {
    const actual = await (claimed.change_type==='NAVER_BID' ? naverBidExecution.readLiveBid({ db, request:claimed }) : readCurrent(db, claimed)).catch(() => null);
    if (actual && same(actual, claimed.rollback_value)) {
      const recovered = await updateFrom(db, claimed, 'ROLLBACK_REQUESTED', { status:'ROLLED_BACK', rolled_back_at:new Date().toISOString(), verification_result:{ rollback_matched:true, actual }, error_message:null });
      await audit(db, id, 'ROLLBACK_RECOVERED', 'ROLLBACK_REQUESTED', 'ROLLED_BACK', actor, { recovered_after_error:String(error.message || error).slice(0, 500) });
      return { request:recovered, reused:false, recovered:true };
    }
    const failed = await updateFrom(db, claimed, 'ROLLBACK_REQUESTED', { status:'ROLLBACK_FAILED', error_message:String(error.message || error).slice(0, 1000) });
    await audit(db, id, 'ROLLBACK_FAILED', 'ROLLBACK_REQUESTED', 'ROLLBACK_FAILED', actor, { error:failed.error_message });
    throw error;
  }
}

async function reject(id, { db = supabaseModule.getSupabase(), actor, note } = {}) {
  const request = await getRequest(db, id);
  if (request.status === 'REJECTED') return { request, reused:true };
  if (request.status !== 'PREVIEWED') throw new FinancialChangeError('미리보기 상태에서만 반려할 수 있습니다.', 409, 'INVALID_STATE');
  const rejected = await updateFrom(db, request, 'PREVIEWED', { status:'REJECTED', approval_note:cleanText(note), error_message:'승인 반려' });
  await audit(db, id, 'REJECTED', 'PREVIEWED', 'REJECTED', actor, { note:cleanText(note) });
  return { request:rejected, reused:false };
}

async function listRequests({ db = supabaseModule.getSupabase(), limit = 50 } = {}) {
  const requests = await db.from('financial_change_requests').select('*').order('created_at', { ascending:false }).limit(Math.min(100, Math.max(1, Number(limit) || 50)));
  if (requests.error) throw requests.error;
  const ids = (requests.data || []).map(item => item.id);
  let audits = { data:[], error:null };
  if (ids.length) audits = await db.from('financial_change_audit_logs').select('*').in('change_request_id', ids).order('created_at', { ascending:true });
  if (audits.error) throw audits.error;
  return { requests:requests.data || [], audits:audits.data || [] };
}

module.exports = { FinancialChangeError, approve, confirmAndExecute, createNaverBidPreview, createPreview, execute, impactPreview, listRequests, normalizeRequest, reject, rollback, same, verify };
