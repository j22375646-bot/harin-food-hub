'use strict';

const FORMULA_VERSION = 'n5-guarded-automation-v1';
const MIN_BID = 70;
const MAX_BID = 100000;
const MAX_DECREASE_RATE = 0.15;
const MAX_INCREASE_RATE = 0.10;
const AUTOMATION_MAX_DECREASE_RATE = 0.10;
const AUTOMATION_MAX_INCREASE_RATE = 0.05;
const AUTOMATION_DRAFT_LIMIT = 3;

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundBid = value => Math.max(MIN_BID, Math.min(MAX_BID, Math.round(number(value) / 10) * 10));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizedStatus=value=>String(value || '').trim().toUpperCase();

function operationalState(item) {
  const status=normalizedStatus(item?.status);
  if (item?.user_lock === true || (status && status !== 'ELIGIBLE')) return 'INACTIVE';
  if (status === 'ELIGIBLE') return 'ACTIVE';
  return 'UNKNOWN';
}

function combinedOperationalState(...states) {
  const normalized=states.filter(Boolean);
  if (normalized.includes('INACTIVE')) return 'INACTIVE';
  if (normalized.length && normalized.every(state=>state === 'ACTIVE')) return 'ACTIVE';
  return 'UNKNOWN';
}

function activeAdgroupIds({ campaigns = [], adgroups = [] } = {}) {
  const activeCampaignIds = new Set(campaigns
    .filter(item => operationalState(item) === 'ACTIVE')
    .map(item => String(item.ncc_campaign_id || ''))
    .filter(Boolean));
  return adgroups
    .filter(item => operationalState(item) === 'ACTIVE' && activeCampaignIds.has(String(item.ncc_campaign_id || '')))
    .map(item => String(item.ncc_adgroup_id || ''))
    .filter(Boolean);
}

function mergeKeywordCatalog({ activeKeywords = [], fallbackKeywords = [] } = {}) {
  const merged = new Map();
  for (const item of [...activeKeywords, ...fallbackKeywords]) {
    const id = String(item?.ncc_keyword_id || '');
    if (id && !merged.has(id)) merged.set(id, item);
  }
  return [...merged.values()];
}

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

function candidateFor({ keyword, stats, dailyStats, productTarget, linkedMasterProductId, adgroup, campaign, financialTrust = {}, period = {}, executionEnabled = false }) {
  const rawCurrentBid=Number(keyword.bid_amount);
  const currentBidValid=Number.isInteger(rawCurrentBid)&&rawCurrentBid>=MIN_BID&&rawCurrentBid<=MAX_BID&&rawCurrentBid%10===0;
  const currentBid = currentBidValid ? roundBid(rawCurrentBid) : null;
  const clicks = number(stats?.clicks);
  const cost = number(stats?.cost);
  const conversions = number(stats?.conversions);
  const revenue = number(stats?.conversion_revenue);
  const currentCpc = clicks > 0 ? Math.round(cost / clicks) : null;
  const roas = cost > 0 ? Math.round(revenue / cost * 1000) / 10 : null;
  const dailyCost=number(dailyStats?.cost);
  const dailyRevenue=number(dailyStats?.conversion_revenue);
  const dailyRoas=dailyCost>0?Math.round(dailyRevenue/dailyCost*1000)/10:null;
  const campaignOperationalState=operationalState(campaign);
  const adgroupOperationalState=operationalState(adgroup);
  const adCategoryState=combinedOperationalState(campaignOperationalState,adgroupOperationalState);
  const operationalReasons=[];
  const recommendationReasons=[];

  if (String(keyword.status || '').toUpperCase() !== 'ELIGIBLE') operationalReasons.push({ code:'KEYWORD_NOT_ELIGIBLE', message:'광고가 운영 가능한 키워드가 아닙니다.' });
  if (keyword.user_lock === true) operationalReasons.push({ code:'KEYWORD_LOCKED', message:'네이버 광고에서 사용자가 잠근 키워드입니다.' });
  if (normalizedStatus(campaign?.status) && normalizedStatus(campaign?.status) !== 'ELIGIBLE') operationalReasons.push({ code:'CAMPAIGN_NOT_ELIGIBLE', message:'사용 중지된 캠페인이라 입찰가 변경 대상에서 제외합니다.' });
  if (campaign?.user_lock === true) operationalReasons.push({ code:'CAMPAIGN_LOCKED', message:'네이버 광고에서 사용자가 잠근 캠페인입니다.' });
  if (normalizedStatus(adgroup?.status) && normalizedStatus(adgroup?.status) !== 'ELIGIBLE') operationalReasons.push({ code:'ADGROUP_NOT_ELIGIBLE', message:'사용 중지된 광고그룹이라 입찰가 변경 대상에서 제외합니다.' });
  if (adgroup?.user_lock === true) operationalReasons.push({ code:'ADGROUP_LOCKED', message:'네이버 광고에서 사용자가 잠근 광고그룹입니다.' });
  if (!currentBidValid) operationalReasons.push({ code:'CURRENT_BID_INVALID', message:'현재 입찰가를 다시 수집해야 합니다.' });
  if (financialTrust.allowed_cpc !== true) recommendationReasons.push({ code:'FINANCIAL_TRUST_BLOCKED', message:'원가·수수료·배송비 연결 전에는 추천·증액을 판단 보류합니다. 사장님 직접 감액은 가능합니다.' });
  if (!productTarget) recommendationReasons.push({ code:'PRODUCT_TARGET_LINK_REQUIRED', message:'판매상품 연결 전에는 추천·증액을 판단 보류합니다. 사장님 직접 감액은 가능합니다.' });
  else if (productTarget.status !== 'READY' || number(productTarget.allowable_cpc) <= 0) recommendationReasons.push({ code:'PRODUCT_TARGET_BLOCKED', message:'연결 상품의 허용 CPC가 준비되기 전에는 추천·증액을 판단 보류합니다.' });
  if (!stats) recommendationReasons.push({ code:'PERFORMANCE_SAMPLE_REQUIRED', message:'최근 실적이 없어 추천 입찰가는 판단 보류합니다. 사장님 직접 감액은 가능합니다.' });
  const reasons=[...operationalReasons,...recommendationReasons];
  const recommendationReady=reasons.length===0;
  const ownerEditable=operationalReasons.length===0;
  const manualDecreaseOnly=ownerEditable&&!recommendationReady;

  let recommendedBid = null;
  let decision = 'BLOCKED';
  if (recommendationReady) {
    const allowableCpc = number(productTarget.allowable_cpc);
    const lowerBound = currentBid * (1 - MAX_DECREASE_RATE);
    const upperBound = currentBid * (1 + MAX_INCREASE_RATE);
    const safeUpperBound = financialTrust.financial_actions === true ? upperBound : currentBid;
    recommendedBid = roundBid(clamp(allowableCpc, lowerBound, safeUpperBound));
    if (recommendedBid < currentBid) decision = 'LOWER';
    else if (recommendedBid > currentBid) decision = 'RAISE';
    else decision = 'KEEP';
  }

  const automationBlockers = [];
  let automationBid = null;
  if (!recommendationReady) automationBlockers.push('SAFETY_GATE_BLOCKED');
  else if (decision === 'KEEP') automationBlockers.push('NO_BID_CHANGE');
  else if (decision === 'LOWER') {
    const sampleStatus=String(productTarget?.sample_status || '');
    if (!['REVIEW','STRONG_REVIEW','ENOUGH'].includes(sampleStatus)) automationBlockers.push('MORE_SAMPLE_REQUIRED');
    if (number(productTarget?.allowable_cpa) <= 0 || cost < number(productTarget.allowable_cpa)) automationBlockers.push('TARGET_CPA_SAMPLE_REQUIRED');
    automationBid=roundBid(Math.max(number(productTarget?.allowable_cpc),currentBid*(1-AUTOMATION_MAX_DECREASE_RATE)));
  } else if (decision === 'RAISE') {
    if (String(productTarget?.sample_status || '') !== 'ENOUGH') automationBlockers.push('MORE_SAMPLE_REQUIRED');
    if (conversions <= 0) automationBlockers.push('CONVERSION_SAMPLE_REQUIRED');
    // Product-level stock days are not yet attributable for every Naver keyword.
    // Until that evidence exists, automatic increase drafts stay blocked.
    automationBlockers.push('INVENTORY_EVIDENCE_REQUIRED');
    automationBid=roundBid(Math.min(number(productTarget?.allowable_cpc),currentBid*(1+AUTOMATION_MAX_INCREASE_RATE)));
  }
  if (automationBid === currentBid) automationBlockers.push('NO_BID_CHANGE');
  const automationEligible=automationBlockers.length===0 && Number.isFinite(automationBid);

  return {
    ncc_keyword_id:String(keyword.ncc_keyword_id),
    ncc_adgroup_id:String(keyword.ncc_adgroup_id || ''),
    adgroup_name:String(adgroup?.name || ''),
    adgroup_status:String(adgroup?.status || ''),
    adgroup_user_lock:adgroup?.user_lock === true,
    adgroup_operational_state:adgroupOperationalState,
    ncc_campaign_id:String(adgroup?.ncc_campaign_id || campaign?.ncc_campaign_id || ''),
    campaign_name:String(campaign?.name || ''),
    campaign_type:String(campaign?.campaign_type || ''),
    campaign_status:String(campaign?.status || ''),
    campaign_user_lock:campaign?.user_lock === true,
    campaign_operational_state:campaignOperationalState,
    ad_category_state:adCategoryState,
    keyword:String(keyword.keyword || '키워드 이름 없음'),
    status:recommendationReady ? 'READY' : ownerEditable ? 'DIRECT_LOWER_ONLY' : 'BLOCKED',
    decision,
    current_bid:currentBid,
    recommended_bid:recommendedBid,
    minimum_owner_bid:ownerEditable ? roundBid(currentBid * (1 - MAX_DECREASE_RATE)) : null,
    maximum_owner_bid:ownerEditable ? roundBid(recommendationReady&&financialTrust.financial_actions === true ? currentBid * (1 + MAX_INCREASE_RATE) : currentBid) : null,
    can_request_approval:ownerEditable,
    recommendation_ready:recommendationReady,
    manual_decrease_only:manualDecreaseOnly,
    metrics:{ impressions:number(stats?.impressions), clicks, cost, conversions, conversion_revenue:revenue, current_cpc:currentCpc, roas, roas_7d:roas, roas_today:dailyRoas },
    product_target:productTarget ? {
      master_product_id:productTarget.master_product_id,
      name:productTarget.name,
      allowable_cpc:number(productTarget.allowable_cpc),
      allowable_cpa:number(productTarget.allowable_cpa),
      sample_status:productTarget.sample_status || null,
      data_age_days:productTarget.data_age_days ?? null,
      naver_conversions:number(productTarget.naver_conversions)
    } : null,
    automation:{
      eligible:automationEligible,
      action:decision,
      proposed_bid:automationEligible ? automationBid : null,
      requires_owner_approval:true,
      blockers:automationBlockers
    },
    linked_master_product_id:linkedMasterProductId || null,
    period_start:period.period_start || stats?.period_start || null,
    period_end:period.period_end || stats?.period_end || null,
    reasons,
    formula_version:FORMULA_VERSION,
    external_execution_locked:executionEnabled !== true
  };
}

function buildNaverBidWorkbench({ keywords = [], stats = [], dailyStats = [], adgroups = [], campaigns = [], productTargets = [], keywordProductLinks = [], masterProducts = [], financialTrust = {}, period = {}, executionEnabled = false } = {}) {
  const statsByKeyword = indexLatestStats(stats);
  const dailyStatsByKeyword=indexLatestStats(dailyStats);
  const adgroupsById = new Map(adgroups.map(item => [String(item.ncc_adgroup_id || ''), item]));
  const campaignsById = new Map(campaigns.map(item => [String(item.ncc_campaign_id || ''), item]));
  const targetsByProduct = new Map(productTargets.map(item => [String(item.master_product_id), item]));
  const productByKeyword = new Map(keywordProductLinks.map(item => [String(item.ncc_keyword_id), String(item.master_product_id)]));
  const candidates = keywords.map(keyword => { const linkedMasterProductId=productByKeyword.get(String(keyword.ncc_keyword_id)); const adgroup=adgroupsById.get(String(keyword.ncc_adgroup_id || '')); const campaign=campaignsById.get(String(adgroup?.ncc_campaign_id || '')); return candidateFor({
    keyword,
    stats:statsByKeyword.get(String(keyword.ncc_keyword_id)),
    dailyStats:dailyStatsByKeyword.get(String(keyword.ncc_keyword_id)),
    productTarget:targetsByProduct.get(linkedMasterProductId),
    linkedMasterProductId,
    adgroup,
    campaign,
    financialTrust,
    period,
    executionEnabled
  }); }).sort((left, right) => {
    const rank={ ACTIVE:0, UNKNOWN:1, INACTIVE:2 };
    return (rank[left.ad_category_state] ?? 1) - (rank[right.ad_category_state] ?? 1)
      || right.metrics.cost - left.metrics.cost
      || right.metrics.clicks - left.metrics.clicks;
  }).slice(0, 500);
  const ready = candidates.filter(item => item.status === 'READY');
  const ownerEditable=candidates.filter(item=>item.can_request_approval);
  const blocked = candidates.filter(item => item.status !== 'READY');
  const reasonCounts = new Map();
  for (const item of blocked) for (const reason of item.reasons) reasonCounts.set(reason.code, (reasonCounts.get(reason.code) || 0) + 1);
  return {
    phase:'12-7',
    formula_version:FORMULA_VERSION,
    execution_enabled:executionEnabled === true,
    external_execution_locked:executionEnabled !== true,
    period_start:period.period_start || null,
    period_end:period.period_end || null,
    summary:{
      total_candidates:candidates.length,
      ready_candidates:ready.length,
      blocked_candidates:blocked.length,
      owner_editable_candidates:ownerEditable.length,
      direct_lower_only_candidates:ownerEditable.filter(item=>item.manual_decrease_only).length,
      decrease_candidates:ready.filter(item => item.decision === 'LOWER').length,
      increase_candidates:ready.filter(item => item.decision === 'RAISE').length,
      linked_products:productByKeyword.size,
      automation_draft_candidates:ready.filter(item => item.automation?.eligible).length,
      automation_draft_limit:AUTOMATION_DRAFT_LIMIT,
      automation_increase_blocked:ready.filter(item => item.decision === 'RAISE' && item.automation?.blockers?.includes('INVENTORY_EVIDENCE_REQUIRED')).length
    },
    blockers:[...reasonCounts.entries()].map(([code, count]) => ({ code, count })),
    products:masterProducts.filter(item=>item.is_active!==false).map(item=>{
      const target=targetsByProduct.get(String(item.id));
      return { id:String(item.id), name:String(item.name||'상품명 없음'), selling_price:number(item.selling_price), target_ready:Boolean(target&&target.status==='READY'), allowable_cpc:target?.allowable_cpc??null };
    }).sort((left,right)=>Number(right.target_ready)-Number(left.target_ready)||left.name.localeCompare(right.name,'ko')),
    candidates
  };
}

function proposalSnapshot(candidate) {
  if (!candidate?.can_request_approval || !Number.isFinite(candidate.current_bid) || !Number.isFinite(candidate.minimum_owner_bid) || !Number.isFinite(candidate.maximum_owner_bid)) return null;
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
    external_execution_locked:candidate.external_execution_locked !== false,
    recommendation_ready:candidate.recommendation_ready===true,
    manual_decrease_only:candidate.manual_decrease_only===true,
    automation:candidate.automation,
    execution_phase:'12-7'
  };
}

module.exports = {
  FORMULA_VERSION, MAX_DECREASE_RATE, MAX_INCREASE_RATE, AUTOMATION_MAX_DECREASE_RATE, AUTOMATION_MAX_INCREASE_RATE, AUTOMATION_DRAFT_LIMIT, MIN_BID, MAX_BID,
  buildNaverBidWorkbench, candidateFor, proposalSnapshot, roundBid, operationalState, combinedOperationalState,
  activeAdgroupIds, mergeKeywordCatalog
};
