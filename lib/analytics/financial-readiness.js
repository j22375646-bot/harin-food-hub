'use strict';

const TARGET_COST_COVERAGE_RATE = 95;
const number = value => Number(value || 0);
const percent = value => Number(Math.max(0, Math.min(100, value)).toFixed(1));

function buildFinancialReadiness({
  performance = {}, profitability = {}, financialTrust = {}, productCosts = [], channelCostSettings = [],
  channelShippingRules = [], targetCoverageRate = TARGET_COST_COVERAGE_RATE
} = {}) {
  const performanceItems = performance.items || [];
  const summary = performance.summary || {};
  const profitabilityItems = (profitability.products || []).map(item => ({
    master_product_id:item.master_product_id,
    name:item.name,
    revenue:number(item.revenue),
    orders:0,
    units:number(item.quantity),
    channels:{CAFE24:{revenue:number(item.revenue)}},
    cost_status:item.cost_configured?'CALCULATED':'COST_DATA_REQUIRED'
  }));
  const useProfitabilityScope = number(profitability.revenue) > number(summary.revenue) && profitabilityItems.length > 0;
  const items = useProfitabilityScope ? profitabilityItems : performanceItems;
  const totalRevenue = useProfitabilityScope ? number(profitability.revenue) : number(summary.revenue);
  const configuredCosts = new Set(productCosts
    .filter(item => number(item.unit_cost) + number(item.packaging_cost) + number(item.other_unit_cost) > 0)
    .map(item => item.master_product_id));
  const costConfigured = item => productCosts.length
    ? configuredCosts.has(item.master_product_id)
    : item.cost_status === 'CALCULATED';
  const coveredRevenue = items
    .filter(costConfigured)
    .reduce((sum, item) => sum + number(item.revenue), 0);
  const currentCoverageRate = totalRevenue > 0 ? coveredRevenue / totalRevenue * 100 : null;
  const requiredRevenue = totalRevenue > 0
    ? Math.max(0, totalRevenue * (number(targetCoverageRate) / 100) - coveredRevenue)
    : 0;

  let accumulatedRevenue = 0;
  const missing = items
    .filter(item => !costConfigured(item))
    .sort((left, right) => number(right.revenue) - number(left.revenue));
  const priorityProducts = missing.map((item, index) => {
    accumulatedRevenue += number(item.revenue);
    const projectedCoverageRate = totalRevenue > 0 ? (coveredRevenue + accumulatedRevenue) / totalRevenue * 100 : null;
    return {
      master_product_id: item.master_product_id, name: item.name, rank: index + 1,
      mapping_required: !item.master_product_id,
      revenue: number(item.revenue), orders: number(item.orders), units: number(item.units),
      revenue_share_rate: totalRevenue > 0 ? percent(number(item.revenue) / totalRevenue * 100) : null,
      projected_coverage_rate: projectedCoverageRate == null ? null : percent(projectedCoverageRate),
      required_for_target: number(item.revenue) > 0 && accumulatedRevenue - number(item.revenue) < requiredRevenue
    };
  });
  const requiredPriorityProducts = priorityProducts.filter(item => item.required_for_target);

  const activePlatforms = ['CAFE24', 'NAVER', 'COUPANG'].filter(platform =>
    items.some(item => number(item.channels?.[platform]?.revenue) > 0 || number(item.channels?.[platform]?.orders) > 0)
  );
  const costSettingPlatforms = new Set(channelCostSettings.map(item => item.platform));
  const shippingRulePlatforms = new Set(channelShippingRules.map(item => item.platform));
  const missingChannelSettings = activePlatforms.filter(platform => !costSettingPlatforms.has(platform));
  const missingShippingRules = activePlatforms.filter(platform => !shippingRulePlatforms.has(platform));
  const unassignedAdSpend = number(summary.coupang_ad_spend_unassigned ?? financialTrust.unassigned_ad_spend);
  const coverageReady = currentCoverageRate !== null && currentCoverageRate >= targetCoverageRate;
  const adReady = unassignedAdSpend === 0;

  return {
    status: coverageReady && adReady ? 'READY' : 'ACTION_REQUIRED',
    target_cost_coverage_rate: number(targetCoverageRate),
    current_cost_coverage_rate: currentCoverageRate == null ? null : percent(currentCoverageRate),
    covered_revenue: Math.round(coveredRevenue), total_revenue: Math.round(totalRevenue),
    missing_cost_revenue: Math.round(Math.max(0, totalRevenue - coveredRevenue)),
    required_additional_revenue: Math.round(requiredRevenue),
    missing_cost_products: priorityProducts.length,
    priority_input_count: requiredPriorityProducts.length,
    priority_products: priorityProducts,
    unassigned_ad_spend: Math.round(unassignedAdSpend),
    active_platforms: activePlatforms,
    revenue_scope: useProfitabilityScope ? 'CAFE24_ORDER_HISTORY' : 'UNIFIED_CURRENT_PERIOD',
    missing_channel_settings: missingChannelSettings,
    missing_shipping_rules: missingShippingRules,
    checklist: [
      { id:'PRODUCT_COST', status:coverageReady?'READY':'ACTION_REQUIRED', title:'매출 기준 원가 95% 반영', detail:coverageReady ? `현재 ${percent(currentCoverageRate)}%로 이익 계산 기준을 충족했습니다.` : `매출 영향이 큰 상품 ${requiredPriorityProducts.length}개의 실제 원가를 입력하면 95% 기준에 도달합니다.` },
      { id:'CHANNEL_COST', status:missingChannelSettings.length?'CHECK_REQUIRED':'READY', title:'채널 수수료·배송비 설정', detail:missingChannelSettings.length ? `${missingChannelSettings.join('·')} 공통비용 설정을 확인해야 합니다.` : `매출이 있는 ${activePlatforms.length}개 채널의 공통비용 설정이 연결되어 있습니다.` },
      { id:'SHIPPING_RULE', status:missingShippingRules.length?'CHECK_REQUIRED':'READY', title:'반품·도서산간 충당금', detail:missingShippingRules.length ? `${missingShippingRules.join('·')} 배송 손실 규칙을 확인해야 합니다.` : '매출이 있는 채널의 배송 손실 규칙이 연결되어 있습니다.' },
      { id:'AD_ASSIGNMENT', status:adReady?'READY':'ACTION_REQUIRED', title:'쿠팡 광고비 상품 귀속', detail:adReady ? '쿠팡 광고비가 상품에 모두 연결되었습니다.' : `${Math.round(unassignedAdSpend).toLocaleString('ko-KR')}원의 광고비는 상품 확인이 더 필요합니다.` }
    ]
  };
}

module.exports = { TARGET_COST_COVERAGE_RATE, buildFinancialReadiness };
