'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculator = require('../lib/experiments/calculator.js');

test('calculates experiment KPI values on the server', () => {
  const result = calculator.metrics({ impressions: 1000, clicks: 100, cost: 50000, conversions: 10, orders: 10, revenue: 200000 });
  assert.equal(result.CTR, 10);
  assert.equal(result.CPC, 500);
  assert.equal(result.CVR, 10);
  assert.equal(result.CPA, 5000);
  assert.equal(result.ROAS, 400);
  assert.equal(result.AOV, 20000);
});

test('does not declare a winner when samples are insufficient', () => {
  const result = calculator.evaluate({ metric: 'CVR', minimum_sample_size: 30, confidence_level: 90, minimum_detectable_lift: 10 }, [
    { id: 'a', name: '대조군', is_control: true, clicks: 10, conversions: 1 },
    { id: 'b', name: '실험군', is_control: false, clicks: 10, conversions: 3 }
  ]);
  assert.equal(result.status, 'INSUFFICIENT_SAMPLE');
  assert.equal(result.winner, null);
});

test('uses lower-is-better direction for CPA', () => {
  const result = calculator.evaluate({ metric: 'CPA', minimum_sample_size: 10, confidence_level: 80, minimum_detectable_lift: 5 }, [
    { id: 'a', name: '대조군', is_control: true, clicks: 100, conversions: 20, cost: 200000 },
    { id: 'b', name: '실험군', is_control: false, clicks: 100, conversions: 20, cost: 150000 }
  ]);
  assert.equal(result.status, 'WINNER');
  assert.equal(result.winner.id, 'b');
});
