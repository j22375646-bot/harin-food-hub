'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const trust = require('../lib/analytics/financial-trust.js');

test('원가 반영률 95% 미만이면 공헌이익과 목표 CPC를 차단한다', () => {
  const result = trust.evaluateFinancialTrust({ costCoverageRate:94.9, unassignedAdSpend:0, missingCostProducts:2, missingCostRevenue:12000 });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.allowed.contribution_profit, false);
  assert.equal(result.allowed.allowed_cpc, false);
  assert.equal(result.reasons[0].code, 'COST_COVERAGE_LOW');
});

test('미귀속 광고비가 있으면 상품 이익·ROAS와 증액 판단을 차단한다', () => {
  const result = trust.evaluateFinancialTrust({ costCoverageRate:100, unassignedAdSpend:58159 });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.allowed.contribution_profit, true);
  assert.equal(result.allowed.product_profit, false);
  assert.equal(result.allowed.product_roas, false);
  assert.equal(result.allowed.bid_increase, false);
  assert.equal(result.reasons[0].code, 'UNASSIGNED_AD_SPEND');
});

test('unknown is blocked instead of being converted to zero', () => {
  const result = trust.evaluateFinancialTrust({ costCoverageRate:null, unassignedAdSpend:null });
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.reasons.map(item => item.code), ['COST_COVERAGE_UNKNOWN','AD_ASSIGNMENT_UNKNOWN']);
});

test('신뢰 게이트는 차단된 공헌이익과 입찰 가이드 숫자를 제거한다', () => {
  const financialTrust = trust.evaluateFinancialTrust({ costCoverageRate:20, unassignedAdSpend:0 });
  const profitability = trust.applyProfitabilityGate({ contribution_profit:50000, contribution_before_ads:60000, contribution_margin_rate:30, break_even_roas:333 }, financialTrust);
  const guide = trust.applyBidGuideGate({ targetCpc:500, rawAdjustmentRate:20, recommendedAdjustmentRate:20, bidAction:'RAISE_BID' }, financialTrust);
  assert.equal(profitability.contribution_profit, null);
  assert.equal(profitability.break_even_roas, null);
  assert.equal(guide.targetCpc, null);
  assert.equal(guide.bidAction, 'HOLD_FOR_FINANCIAL_DATA');
});

test('원가와 광고비 귀속이 완료되면 모든 지표를 허용한다', () => {
  const result = trust.evaluateFinancialTrust({ costCoverageRate:95, unassignedAdSpend:0 });
  assert.equal(result.status, 'READY');
  assert.equal(Object.values(result.allowed).every(Boolean), true);
});
