'use strict';

const FORMULA_VERSION = 'n1-product-target-v1';
const MAX_DATA_AGE_DAYS = 2;

const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const round = (value, digits = 2) => {
  const number = finite(value);
  if (number === null) return null;
  const scale = 10 ** digits;
  return Math.round((number + Number.EPSILON) * scale) / scale;
};

function dataAgeDays(periodEnd, asOf) {
  if (!periodEnd || !asOf) return null;
  const end = new Date(`${String(periodEnd).slice(0, 10)}T23:59:59+09:00`);
  const now = new Date(asOf);
  if (!Number.isFinite(end.getTime()) || !Number.isFinite(now.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - end.getTime()) / 86400000));
}

function sampleDecision({ cost, conversions, allowableCpa }) {
  if (allowableCpa == null || allowableCpa <= 0) return { code:'BLOCKED', label:'허용 CPA 확인 필요' };
  if (cost <= 0) return { code:'NO_AD_SAMPLE', label:'광고 표본 없음' };
  if (conversions <= 0 && cost >= allowableCpa * 2) return { code:'STRONG_REVIEW', label:'강한 감액·중지 검토' };
  if (conversions <= 0 && cost >= allowableCpa) return { code:'REVIEW', label:'무전환 비용 점검' };
  if (cost < allowableCpa) return { code:'OBSERVE', label:'더 지켜보기' };
  return { code:'ENOUGH', label:'판단 가능' };
}

function calculateProductTarget({ item, target, financialTrust, periodEnd, asOf }) {
  const targetMargin = finite(target?.target_profit_margin_rate);
  const revenue = finite(item?.revenue) || 0;
  const orders = finite(item?.orders) || 0;
  const contributionBeforeAds = finite(item?.contribution_before_ads);
  const naver = item?.channels?.NAVER || {};
  const clicks = finite(naver.clicks) || 0;
  const conversions = finite(naver.orders) || 0;
  const adSpend = finite(naver.ad_spend) || 0;
  const age = dataAgeDays(periodEnd, asOf);
  const reasons = [];

  if (targetMargin === null) reasons.push({ code:'TARGET_REQUIRED', message:'목표 이익률을 먼저 입력하세요.' });
  if (financialTrust?.status !== 'READY') reasons.push({ code:'FINANCIAL_TRUST_BLOCKED', message:'원가·수수료·광고비 연결을 먼저 완료하세요.' });
  if (item?.cost_status !== 'CALCULATED' || contributionBeforeAds === null) reasons.push({ code:'COST_DATA_REQUIRED', message:'이 상품의 실제 원가가 아직 계산되지 않았습니다.' });
  if (revenue <= 0 || orders <= 0) reasons.push({ code:'SALES_SAMPLE_REQUIRED', message:'계산할 실제 주문과 매출 표본이 없습니다.' });
  if (age === null) reasons.push({ code:'FRESHNESS_UNKNOWN', message:'데이터 기준일을 확인할 수 없습니다.' });
  else if (age > MAX_DATA_AGE_DAYS) reasons.push({ code:'STALE_DATA', message:`성과 데이터가 ${age}일 지나 다시 수집해야 합니다.` });

  const marginRate = revenue > 0 && contributionBeforeAds !== null ? contributionBeforeAds / revenue * 100 : null;
  if (targetMargin !== null && marginRate !== null && targetMargin >= marginRate) {
    reasons.push({ code:'TARGET_EXCEEDS_MARGIN', message:'목표 이익률이 광고 전 공헌이익률보다 높아 광고비 한도가 남지 않습니다.' });
  }

  if (reasons.length) {
    return {
      master_product_id:item?.master_product_id, name:item?.name || '상품명 없음', status:'BLOCKED', decision_label:'판단 보류',
      target_profit_margin_rate:targetMargin, revenue, orders, contribution_margin_rate:round(marginRate),
      break_even_roas:marginRate > 0 ? round(10000 / marginRate) : null,
      target_roas:null, allowable_ad_cost:null, allowable_cpa:null, allowable_cpc:null,
      current_cpc:clicks > 0 ? round(adSpend / clicks) : null, naver_clicks:clicks, naver_conversions:conversions,
      data_age_days:age, formula_version:FORMULA_VERSION, reasons,
      settlement_roas_status:'CHECK_REQUIRED'
    };
  }

  const allowableAdCost = contributionBeforeAds - revenue * targetMargin / 100;
  const allowableCpa = allowableAdCost / orders;
  const cvr = clicks > 0 ? conversions / clicks : null;
  const allowableCpc = cvr == null ? null : allowableCpa * cvr;
  const sample = sampleDecision({ cost:adSpend, conversions, allowableCpa });
  const status = allowableCpc == null || sample.code === 'NO_AD_SAMPLE' ? 'OBSERVE' : 'READY';

  return {
    master_product_id:item.master_product_id, name:item.name, status, decision_label:status === 'READY' ? sample.label : '더 지켜보기',
    target_profit_margin_rate:targetMargin, revenue:round(revenue), orders:round(orders),
    contribution_margin_rate:round(marginRate), break_even_roas:round(10000 / marginRate),
    target_roas:round(revenue / allowableAdCost * 100), allowable_ad_cost:round(allowableAdCost),
    allowable_cpa:round(allowableCpa), allowable_cpc:round(allowableCpc), current_cpc:clicks > 0 ? round(adSpend / clicks) : null,
    naver_clicks:clicks, naver_conversions:conversions, naver_cvr:round(cvr == null ? null : cvr * 100),
    sample_status:sample.code, sample_label:sample.label, data_age_days:age, formula_version:FORMULA_VERSION,
    reasons:allowableCpc == null ? [{ code:'NAVER_SAMPLE_REQUIRED', message:'네이버 클릭·전환 표본이 생기면 허용 CPC를 계산합니다.' }] : [],
    settlement_roas_status:'CHECK_REQUIRED'
  };
}

function buildProductAdTargets({ performance = {}, targets = [], financialTrust = {}, asOf = new Date().toISOString() } = {}) {
  const byProduct = new Map(targets.map(row => [String(row.master_product_id), row]));
  const items = (performance.items || []).map(item => calculateProductTarget({
    item, target:byProduct.get(String(item.master_product_id)), financialTrust,
    periodEnd:performance.period_end, asOf
  }));
  return {
    phase:'12-1', formula_version:FORMULA_VERSION, period_start:performance.period_start || null, period_end:performance.period_end || null,
    data_age_days:dataAgeDays(performance.period_end, asOf),
    summary:{
      total_products:items.length,
      configured_products:items.filter(item=>item.target_profit_margin_rate !== null).length,
      ready_products:items.filter(item=>item.status === 'READY').length,
      observe_products:items.filter(item=>item.status === 'OBSERVE').length,
      blocked_products:items.filter(item=>item.status === 'BLOCKED').length
    },
    items
  };
}

module.exports = { FORMULA_VERSION, MAX_DATA_AGE_DAYS, dataAgeDays, sampleDecision, calculateProductTarget, buildProductAdTargets };
