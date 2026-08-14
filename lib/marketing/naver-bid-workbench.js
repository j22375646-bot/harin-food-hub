'use strict';

const FORMULA_VERSION = 'n4-bid-approval-v1';
const MIN_BID = 70;
const MAX_BID = 100000;
const MAX_DECREASE_RATE = 0.15;
const MAX_INCREASE_RATE = 0.10;

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundBid = value => Math.max(MIN_BID, Math.min(MAX_BID, Math.round(number(value) / 10) * 10));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function indexLatestStats(rows = []) {
  const byKeyword = new Map();
  for (const row of rows) {
    const key = String(row.ncc_keyword_id || '');
    if (!key) continue;
    const previous = byKeyword.get(key);
    const previousEnd = String(previous?.period_end || '');
    const nextEnd = String(row.period_end || '');
    if (!previous || nextEnd >= previousEnd) byKeyword.set(key, row);
  }
  return byKeyword;
}

function candidateFor({ keyword, stats, productTarget, financialTrust = {}, period = {} }) {
  const currentBid = roundBid(keyword.bid_amount);
  const clicks = number(stats?.clicks);
  const cost = number(stats?.cost);
  const conversions = number(stats?.conversions);
  const revenue = number(stats?.conversion_revenue);
  const currentCpc = clicks > 0 ? Math.round(cost / clicks) : null;
  const roas = cost > 0 ? Math.round(revenue / cost * 1000) / 10 : null;
  const reasons = [];

  if (String(keyword.status || '').toUpperCase() !== 'ELIGIBLE') reasons.push({ code:'KEYWORD_NOT_ELIGIBLE', message:'광고가 운영 가능한 키워드가 아닙니다.' });
  if (keyword.user_lock === true) reasons.push({ code:'KEYWORD_LOCKED', message:'네이버 광고에서 사용자가 잠근 키워드입니다.' });
  if (financialTrust.allowed_cpc !== true) reasons.push({ code:'FINANCIAL_TRUST_BLOCKED', message:'원가·수수료·배송비 연결을 먼저 완료해야 합니다.' });
  if (!productTarget) reasons.push({ code:'PRODUCT_TARGET_LINK_REQUIRED', message:'키워드와 판매상품의 목표 이익 연결이 필요합니다.' });
  else if (productTarget.status !== 'READY' || number(productTarget.allowable_cpc) <= 0) reasons.push({ code:'PRODUCT_TARGET_BLOCKED', message:'연결 상품의 허용 CPC가 아직 판단 보류 상태입니다.' });
  if (!stats) reasons.push({ code:'PERFORMANCE_SAMPLE_REQUIRED', message:'최근 키워드 실적이 없어 입찰안을 계산할 수 없습니다.' });

  let recommendedBid = null;
  let decision = 'BLOCKED';
  if (!reasons.length) {
    const allowableCpc = number(productTarget.allowable_cpc);
    const lowerBound = currentBid * (1 - MAX_DECREASE_RATE);
    const upperBound = currentBid * (1 + MAX_INCREASE_RATE);
    const safeUpperBound = financialTrust.financial_actions === true ? upperBound : currentBid;
    recommendedBid = roundBid(clamp(allowableCpc, lowerBound, safeUpperBound));
    if (recommendedBid < currentBid) decision = 'LOWER';
    else if (recommendedBid > currentBid) decision = 'RAISE';
    else decision = 'KEEP';
  }

  return {
    ncc_keyword_id:String(keyword.ncc_keyword_id),
    ncc_adgroup_id:String(keyword.ncc_adgroup_id || ''),
    keyword:String(keyword.keyword || '키워드 이름 없음'),
    status:reasons.length ? 'BLOCKED' : 'READY',
    decision,
    current_bid:currentBid,
    recommended_bid:recommendedBid,
    minimum_owner_bid:reasons.length ? null : roundBid(currentBid * (1 - MAX_DECREASE_RATE)),
    maximum_owner_bid:reasons.length ? null : roundBid(financialTrust.financial_actions === true ? currentBid * (1 + MAX_INCREASE_RATE) : currentBid),
    can_request_approval:reasons.length === 0,
    metrics:{ impressions:number(stats?.impressions), clicks, cost, conversions, conversion_revenue:revenue, current_cpc:currentCpc, roas },
    product_target:productTarget ? {
      master_product_id:productTarget.master_product_id,
      name:productTarget.name,
      allowable_cpc:number(productTarget.allowable_cpc),
      allowable_cpa:number(productTarget.allowable_cpa)
    } : null,
    period_start:period.period_start || stats?.period_start || null,
    period_end:period.period_end || stats?.period_end || null,
    reasons,
    formula_version:FORMULA_VERSION,
    external_execution_locked:true
  };
}

function buildNaverBidWorkbench({ keywords = [], stats = [], productTargets = [], keywordProductLinks = [], financialTrust = {}, period = {} } = {}) {
  const statsByKeyword = indexLatestStats(stats);
  const targetsByProduct = new Map(productTargets.map(item => [String(item.master_product_id), item]));
  const productByKeyword = new Map(keywordProductLinks.map(item => [String(item.ncc_keyword_id), String(item.master_product_id)]));
  const candidates = keywords.map(keyword => candidateFor({
    keyword,
    stats:statsByKeyword.get(String(keyword.ncc_keyword_id)),
    productTarget:targetsByProduct.get(productByKeyword.get(String(keyword.ncc_keyword_id))),
    financialTrust,
    period
  })).sort((left, right) => right.metrics.cost - left.metrics.cost || right.metrics.clicks - left.metrics.clicks).slice(0, 50);
  const ready = candidates.filter(item => item.status === 'READY');
  const blocked = candidates.filter(item => item.status === 'BLOCKED');
  const reasonCounts = new Map();
  for (const item of blocked) for (const reason of item.reasons) reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
  return {
    phase:'12-6A',
    formula_version:FORMULA_VERSION,
    external_execution_locked:true,
    period_start:period.period_start || null,
    period_end:period.period_end || null,
    summary:{
      total_candidates:candidates.length,
      ready_candidates:ready.length,
      blocked_candidates:blocked.length,
      decrease_candidates:ready.filter(item => item.decision === 'LOWER').length,
      increase_candidates:ready.filter(item => item.decision === 'RAISE').length,
      linked_products:productByKeyword.size
    },
    blockers:[...reasonCounts.entries()].map(([code, count]) => ({ code, count })),
    candidates
  };
}

function proposalSnapshot(candidate) {
  if (!candidate?.can_request_approval || !candidate.recommended_bid) return null;
  return {
    scope:'naver-bid-proposal',
    ncc_keyword_id:candidate.ncc_keyword_id,
    keyword:candidate.keyword,
    current_bid:candidate.current_bid,
    recommended_bid:candidate.recommended_bid,
    minimum_owner_bid:candidate.minimum_owner_bid,
    maximum_owner_bid:candidate.maximum_owner_bid,
    metrics:candidate.metrics,
    product_target:candidate.product_target,
    period_start:candidate.period_start,
    period_end:candidate.period_end,
    formula_version:candidate.formula_version,
    external_execution_locked:true
  };
}

module.exports = {
  FORMULA_VERSION, MAX_DECREASE_RATE, MAX_INCREASE_RATE, MIN_BID, MAX_BID,
  buildNaverBidWorkbench, candidateFor, proposalSnapshot, roundBid
};
