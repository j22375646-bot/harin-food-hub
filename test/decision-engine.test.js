'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../lib/analytics/decision-engine.js');

test('Paid ROAS and MER use different revenue bases', () => {
  const result = engine.profitability({ cafe24: { gross_revenue: 1200, refunds: 100, cancellations: 100 }, naver: { ad_spend: 100, revenue: 300 } });
  assert.equal(result.paid_roas, 300);
  assert.equal(result.mer, 1000);
  assert.equal(result.net_sales, 1000);
});

test('ADVoost Shopping with fewer than 30 purchases is learning-limited', () => {
  const result = engine.summarizeCampaigns([{ name: 'ADVoost 쇼핑', type: 'ADVOOST_SHOPPING', clicks: 80, conversions: 12, cost: 100, revenue: 400 }], 7);
  assert.equal(result.campaigns[0].learning.status, 'LIMITED');
});

test('comparison guard reacts to platform events', () => {
  assert.equal(engine.comparisonGuard([{ affects_comparison: true }]).safe, false);
});
