'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculator = require('../lib/metrics/calculator.js');

test('CPC, CVR, CPA, AOV and target CPC are calculated on the server', () => {
  const result = calculator.calculatePerformance({ impressions: 10000, clicks: 100, cost: 50000, conversions: 10, revenue: 200000, targetRoasPercent: 400 });
  assert.equal(result.cpc, 500);
  assert.equal(result.cvrPercent, 10);
  assert.equal(result.cpa, 5000);
  assert.equal(result.averageOrderValue, 20000);
  assert.equal(result.targetCpc, 500);
  assert.equal(result.recommendedAdjustmentRate, 0);
  assert.equal(result.bidAction, 'KEEP_BID');
  assert.equal(result.status, 'READY');
});

test('bid adjustment is clamped to the safe recommendation range', () => {
  const raise = calculator.calculateBidGuide({ averageOrderValue: 30000, conversionRatePercent: 10, targetRoasPercent: 300, currentCpc: 100 });
  const lower = calculator.calculateBidGuide({ averageOrderValue: 10000, conversionRatePercent: 1, targetRoasPercent: 500, currentCpc: 1000 });
  assert.equal(raise.recommendedAdjustmentRate, 20);
  assert.equal(raise.action, 'RAISE_BID');
  assert.equal(lower.recommendedAdjustmentRate, -30);
  assert.equal(lower.action, 'LOWER_BID');
});

test('small samples are held instead of recommending a bid change', () => {
  const result = calculator.calculatePerformance({ clicks: 8, cost: 8000, conversions: 1, revenue: 50000 });
  assert.equal(result.status, 'INSUFFICIENT_SAMPLE');
  assert.equal(result.bidAction, 'HOLD_FOR_DATA');
  assert.equal(result.recommendedAdjustmentRate, 0);
});

test('zero traffic returns a no-data state without Infinity or NaN', () => {
  const result = calculator.calculatePerformance({ impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
  assert.equal(result.status, 'NO_DATA');
  assert.equal(result.cpc, 0);
  assert.equal(result.targetCpc, 0);
  assert.equal(result.rawAdjustmentRate, null);
});
