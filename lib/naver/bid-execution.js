'use strict';

const client = require('./client.js');

const MIN_BID = 70;
const MAX_BID = 100000;
const MAX_APPROVAL_AGE_MS = 30 * 60 * 1000;

class NaverBidExecutionError extends Error {
  constructor(message, status = 409, code = 'NAVER_BID_EXECUTION_FAILED') {
    super(message);
    this.name = 'NaverBidExecutionError';
    this.status = status;
    this.code = code;
  }
}

const enabled = value => String(value || '').trim().toLowerCase() === 'true';
const configuration = () => ({
  write_enabled:enabled(process.env.NAVER_SEARCH_AD_WRITE_ENABLED),
  approval_max_age_minutes:MAX_APPROVAL_AGE_MS / 60000
});
const integerBid = value => {
  const bid = Number(value);
  if (!Number.isInteger(bid) || bid < MIN_BID || bid > MAX_BID || bid % 10 !== 0) {
    throw new NaverBidExecutionError('입찰가는 70원 이상 100,000원 이하의 10원 단위여야 합니다.', 400, 'INVALID_BID_AMOUNT');
  }
  return bid;
};
const keywordId = value => {
  const id = String(value || '').trim();
  if (!/^nkw-[A-Za-z0-9-]+$/.test(id)) throw new NaverBidExecutionError('네이버 키워드 ID가 올바르지 않습니다.', 400, 'INVALID_KEYWORD_ID');
  return id;
};
const normalizeKeyword = value => ({
  nccKeywordId:String(value?.nccKeywordId || value?.ncc_keyword_id || ''),
  nccAdgroupId:String(value?.nccAdgroupId || value?.ncc_adgroup_id || ''),
  keyword:String(value?.keyword || ''),
  bidAmt:Number(value?.bidAmt ?? value?.bid_amount),
  useGroupBidAmt:Boolean(value?.useGroupBidAmt),
  userLock:Boolean(value?.userLock),
  status:String(value?.status || value?.inspectStatus || ''),
  attr:value?.attr && typeof value.attr === 'object' ? value.attr : {},
  raw:value || {}
});
const autobidActive = group => Boolean(
  group?.autobidStrategy?.isAutobidActive ||
  group?.autobidStrategy?.active ||
  group?.isAutobidActive ||
  ['ML','MAXCONV'].includes(String(group?.useDailyBudget || group?.autoBidType || '').toUpperCase())
);
const minimumBidFor = group => String(group?.adgroupType || '').toUpperCase() === 'SHOPPING_BRAND' ? 300 : MIN_BID;

async function fetchKeyword(id, api = client) {
  const result = await api.request('GET', `/ncc/keywords/${keywordId(id)}`);
  return normalizeKeyword(result.data);
}
async function fetchAdgroup(id, api = client) {
  if (!id) throw new NaverBidExecutionError('키워드의 광고그룹을 확인할 수 없습니다.', 409, 'ADGROUP_REQUIRED');
  const result = await api.request('GET', `/ncc/adgroups/${id}`);
  return result.data || {};
}

function assertLiveEligibility({ keyword, group, targetBid, expectedBid }) {
  if (keyword.userLock) throw new NaverBidExecutionError('네이버에서 잠긴 키워드는 입찰가를 변경할 수 없습니다.', 409, 'KEYWORD_LOCKED');
  if (keyword.status && !['ELIGIBLE','APPROVED'].includes(keyword.status.toUpperCase())) {
    throw new NaverBidExecutionError('현재 운영 가능한 키워드가 아니어서 변경을 중단했습니다.', 409, 'KEYWORD_NOT_ELIGIBLE');
  }
  if (group?.userLock) throw new NaverBidExecutionError('네이버 광고그룹이 잠겨 있어 변경을 중단했습니다.', 409, 'ADGROUP_LOCKED');
  if (autobidActive(group)) throw new NaverBidExecutionError('네이버 자동입찰이 켜진 광고그룹입니다. 개별 입찰 변경을 중단했습니다.', 409, 'NAVER_AUTOBID_ACTIVE');
  if (Number.isFinite(Number(expectedBid)) && Number(keyword.bidAmt) !== Number(expectedBid)) {
    throw new NaverBidExecutionError('승인 이후 네이버 현재 입찰가가 달라졌습니다. 새 승인안이 필요합니다.', 409, 'NAVER_BID_STALE');
  }
  if (targetBid < minimumBidFor(group)) throw new NaverBidExecutionError('이 광고유형의 네이버 최소 입찰가보다 낮습니다.', 409, 'NAVER_MINIMUM_BID');
}

async function assertProductLink(db, request) {
  const approvedProductId = String(request.impact_preview?.metadata?.product_target?.master_product_id || '');
  if (!approvedProductId) throw new NaverBidExecutionError('승인안에 연결 상품 정보가 없습니다.', 409, 'PRODUCT_LINK_REQUIRED');
  const [link, target] = await Promise.all([
    db.from('naver_keyword_product_links').select('master_product_id,updated_at').eq('ncc_keyword_id', request.target_key).maybeSingle(),
    db.from('product_ad_targets').select('master_product_id,updated_at').eq('master_product_id', approvedProductId).maybeSingle()
  ]);
  if (link.error) throw link.error;
  if (target.error) throw target.error;
  if (String(link.data?.master_product_id || '') !== approvedProductId) {
    throw new NaverBidExecutionError('승인 후 키워드의 연결 상품이 달라졌습니다. 새 승인안이 필요합니다.', 409, 'PRODUCT_LINK_STALE');
  }
  if (!target.data) throw new NaverBidExecutionError('연결 상품의 광고 목표가 없어 실행을 중단했습니다.', 409, 'PRODUCT_TARGET_REQUIRED');
  const previewCreatedAt = new Date(request.created_at || request.approved_at || 0).getTime();
  const changedAfterPreview = value => {
    const changedAt = new Date(value || 0).getTime();
    return previewCreatedAt > 0 && changedAt > previewCreatedAt;
  };
  if (changedAfterPreview(link.data.updated_at) || changedAfterPreview(target.data.updated_at)) {
    throw new NaverBidExecutionError('승인안 생성 후 상품 연결 또는 광고 목표가 바뀌었습니다. 새 승인안이 필요합니다.', 409, 'PRODUCT_TARGET_STALE');
  }
}

async function assertSingleChange(db, request) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const recent = await db.from('financial_change_requests').select('id,executed_at,status').eq('change_type','NAVER_BID').eq('target_key',request.target_key).neq('id',request.id).gte('executed_at',since).in('status',['EXECUTED','VERIFIED','VERIFICATION_FAILED']).limit(1);
  if (recent.error) throw recent.error;
  if (recent.data?.length) throw new NaverBidExecutionError('같은 키워드는 최근 7일 안에 이미 변경했습니다. 성과 검증 후 다시 변경해주세요.', 409, 'SINGLE_CHANGE_WINDOW');
}

async function syncKeyword(db, keyword) {
  const values = {
    ncc_adgroup_id:keyword.nccAdgroupId || null,
    bid_amount:keyword.bidAmt,
    status:keyword.status || null,
    user_lock:keyword.userLock,
    raw_data:keyword.raw,
    updated_at:new Date().toISOString()
  };
  if (keyword.keyword) values.keyword=keyword.keyword;
  const result = await db.from('naver_keywords').update(values).eq('ncc_keyword_id', keyword.nccKeywordId);
  if (result.error) throw result.error;
}

async function readLiveBid({ db, request, api = client }) {
  const keyword = await fetchKeyword(request.target_key, api);
  await syncKeyword(db, keyword);
  return { exists:true, values:{ ncc_keyword_id:keyword.nccKeywordId, bid_amount:keyword.bidAmt }, provider:keyword };
}

async function applyBid({ db, request, targetBid, expectedBid, operation = 'EXECUTE', actor = 'dashboard-session', api = client }) {
  if (!configuration().write_enabled) throw new NaverBidExecutionError('네이버 검색광고 쓰기 잠금이 켜져 있습니다.', 503, 'NAVER_SEARCH_AD_WRITE_LOCKED');
  const bid = integerBid(targetBid);
  const approvedAt = new Date(request.approved_at || request.updated_at || 0).getTime();
  if (operation === 'EXECUTE' && (!approvedAt || Date.now() - approvedAt > MAX_APPROVAL_AGE_MS)) {
    throw new NaverBidExecutionError('승인 후 30분이 지나 새 승인안이 필요합니다.', 409, 'NAVER_BID_APPROVAL_EXPIRED');
  }
  if (operation === 'EXECUTE') {
    const manualDecrease=request.impact_preview?.metadata?.manual_decrease_only===true&&Number(targetBid)<Number(expectedBid);
    if(!manualDecrease)await assertProductLink(db, request);
    await assertSingleChange(db, request);
  }
  const live = await fetchKeyword(request.target_key, api);
  const group = await fetchAdgroup(live.nccAdgroupId, api);
  if (Number(live.bidAmt) === bid && live.useGroupBidAmt === false) {
    await syncKeyword(db, live);
    return { reused:true, operation, actor, before_bid:live.bidAmt, requested_bid:bid, observed_bid:live.bidAmt, provider_status:200 };
  }
  assertLiveEligibility({ keyword:live, group, targetBid:bid, expectedBid });
  const body={
    nccKeywordId:live.nccKeywordId,
    nccAdgroupId:live.nccAdgroupId,
    bidAmt:bid,
    useGroupBidAmt:false,
    attr:live.attr
  };
  const changed = await api.request('PUT', `/ncc/keywords/${live.nccKeywordId}`, { fields:'bidAmt' }, body);
  const observed = await fetchKeyword(live.nccKeywordId, api);
  await syncKeyword(db, observed);
  if (Number(observed.bidAmt) !== bid || observed.useGroupBidAmt !== false) {
    throw new NaverBidExecutionError('네이버 반영 후 재조회 값이 승인안과 일치하지 않습니다.', 409, 'NAVER_BID_VERIFY_FAILED');
  }
  return {
    reused:false, operation, actor,
    before_bid:live.bidAmt, requested_bid:bid, observed_bid:observed.bidAmt,
    provider_status:changed.status,
    provider_response:{ nccKeywordId:observed.nccKeywordId, nccAdgroupId:observed.nccAdgroupId, bidAmt:observed.bidAmt, useGroupBidAmt:observed.useGroupBidAmt }
  };
}

module.exports={
  MAX_APPROVAL_AGE_MS, MAX_BID, MIN_BID, NaverBidExecutionError,
  applyBid, assertLiveEligibility, autobidActive, configuration, fetchKeyword,
  integerBid, minimumBidFor, normalizeKeyword, readLiveBid
};
