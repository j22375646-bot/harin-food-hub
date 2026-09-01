'use strict';

const MIN_COST_COVERAGE_RATE = 95;
const FORMULA_VERSION = 'financial-trust-v1';

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateFinancialTrust({
  costCoverageRate,
  unassignedAdSpend,
  missingCostProducts = 0,
  missingCostRevenue = 0,
  requireAdAssignment = true,
  minimumCostCoverageRate = MIN_COST_COVERAGE_RATE
} = {}) {
  const coverage = finiteOrNull(costCoverageRate);
  const unassigned = finiteOrNull(unassignedAdSpend);
  const missingProducts = Math.max(0, finiteOrNull(missingCostProducts) || 0);
  const missingRevenue = Math.max(0, finiteOrNull(missingCostRevenue) || 0);
  const minimumCoverage = Math.min(100, Math.max(1, finiteOrNull(minimumCostCoverageRate) || MIN_COST_COVERAGE_RATE));
  const reasons = [];

  if (coverage === null) {
    reasons.push({
      code: 'COST_COVERAGE_UNKNOWN',
      label: '원가 반영률 확인 필요',
      message: '판매상품 원가 반영률을 확인할 수 없어 이익 지표를 미산정 처리합니다.',
      remediation: '상품 허브에서 판매상품 원가와 매핑을 확인하세요.'
    });
  } else if (coverage < minimumCoverage) {
    reasons.push({
      code: 'COST_COVERAGE_LOW',
      label: '상품 원가 보완 필요',
      message: `원가 반영률 ${coverage.toFixed(1)}%로 기준 ${minimumCoverage}%에 미달합니다.`,
      remediation: '상품 허브에서 미입력 상품 원가를 채우세요.'
    });
  }

  if (requireAdAssignment && unassigned === null) {
    reasons.push({
      code: 'AD_ASSIGNMENT_UNKNOWN',
      label: '광고비 귀속 확인 필요',
      message: '상품에 귀속되지 않은 광고비가 있는지 확인할 수 없습니다.',
      remediation: '상품 매핑과 광고비 귀속 상태를 확인하세요.'
    });
  } else if (requireAdAssignment && unassigned > 0) {
    reasons.push({
      code: 'UNASSIGNED_AD_SPEND',
      label: '미귀속 광고비 연결 필요',
      message: `상품 미귀속 광고비 ${Math.round(unassigned).toLocaleString('ko-KR')}원이 남아 있습니다.`,
      remediation: '상품 허브에서 쿠팡 광고 키워드와 기준상품 매핑을 확인하세요.'
    });
  }

  const costReady = coverage !== null && coverage >= minimumCoverage;
  const assignmentReady = !requireAdAssignment || (unassigned !== null && unassigned === 0);

  return {
    status: reasons.length ? 'BLOCKED' : 'READY',
    formula_version: FORMULA_VERSION,
    thresholds: { minimum_cost_coverage_rate: minimumCoverage },
    cost_coverage_rate: coverage,
    unassigned_ad_spend: requireAdAssignment ? unassigned : null,
    missing_cost_products: missingProducts,
    missing_cost_revenue: missingRevenue,
    reasons,
    allowed: {
      contribution_profit: costReady,
      break_even_roas: costReady,
      product_profit: costReady && assignmentReady,
      product_roas: assignmentReady,
      allowed_cpc: costReady,
      bid_increase: costReady && assignmentReady
    }
  };
}

function applyProfitabilityGate(profitability = {}, trust) {
  const evaluated = trust || evaluateFinancialTrust({
    costCoverageRate: profitability.cost_coverage_rate,
    missingCostProducts: profitability.missing_cost_products,
    missingCostRevenue: profitability.missing_cost_revenue,
    requireAdAssignment: false
  });
  return {
    ...profitability,
    contribution_before_ads: evaluated.allowed.contribution_profit ? profitability.contribution_before_ads : null,
    contribution_profit: evaluated.allowed.contribution_profit ? profitability.contribution_profit : null,
    contribution_margin_rate: evaluated.allowed.contribution_profit ? profitability.contribution_margin_rate : null,
    break_even_roas: evaluated.allowed.break_even_roas ? profitability.break_even_roas : null,
    financial_trust: evaluated
  };
}

function applyProductPerformanceGate(performance = {}, trust) {
  const summary = performance.summary || {};
  const evaluated = trust || evaluateFinancialTrust({
    costCoverageRate: summary.cost_coverage_rate,
    unassignedAdSpend: summary.coupang_ad_spend_unassigned,
    missingCostProducts: summary.missing_cost_products,
    missingCostRevenue: summary.missing_cost_revenue
  });
  return {
    ...performance,
    financial_trust: evaluated,
    summary: {
      ...summary,
      contribution_profit: evaluated.allowed.product_profit ? summary.contribution_profit : null,
      financial_trust: evaluated
    },
    items: (performance.items || []).map(item => ({
      ...item,
      contribution_profit: evaluated.allowed.product_profit ? item.contribution_profit : null,
      roas: evaluated.allowed.product_roas ? item.roas : null,
      financial_status: evaluated.status
    }))
  };
}

function applyBidGuideGate(guide = {}, trust) {
  if (!trust || trust.allowed?.allowed_cpc) return guide;
  const actionKey = Object.hasOwn(guide, 'bidAction') ? 'bidAction' : 'action';
  const currentAction = guide[actionKey];
  if (!['RAISE_BID', 'LOWER_BID', 'KEEP_BID'].includes(currentAction)) return guide;
  return {
    ...guide,
    targetCpc: null,
    rawAdjustmentRate: null,
    recommendedAdjustmentRate: 0,
    [actionKey]: 'HOLD_FOR_FINANCIAL_DATA',
    financial_trust: trust
  };
}

module.exports = {
  MIN_COST_COVERAGE_RATE,
  FORMULA_VERSION,
  evaluateFinancialTrust,
  applyProfitabilityGate,
  applyProductPerformanceGate,
  applyBidGuideGate
};
