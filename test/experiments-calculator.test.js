'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calculator = require('../lib/experiments/calculator.js');

test('experiment screen reassesses saved unsupported winners without changing saved rows',()=>{
  const {buildPhase28ExperimentsModel}=require('../lib/ui/phase28-adapters/experiments.js');
  const saved={id:'saved',metric:'ROAS',evaluation_status:'WINNER',winner_variant_id:'b',result_summary:'old winner',ab_test_variants:[{id:'a',is_control:true,clicks:30,cost:1,revenue:100},{id:'b',clicks:30,cost:1,revenue:200}]};
  const item=buildPhase28ExperimentsModel({tests:[saved]}).items[0];
  assert.equal(item.evaluationStatus,'INCONCLUSIVE');
  assert.equal(item.confidence,null);
  assert.equal(item.winner,null);
  assert.equal(saved.evaluation_status,'WINNER');
});

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
  assert.equal(result.status, 'INCONCLUSIVE');
  assert.equal(result.winner, null);
  assert.equal(result.liftPercent, 25);
});

test('ROAS sample readiness never becomes confidence or lowers requested confidence', () => {
  const result = calculator.evaluate({metric:'ROAS',minimum_sample_size:30,confidence_level:95,minimum_detectable_lift:0}, [
    {id:'a',is_control:true,clicks:30,orders:1,cost:10000,revenue:100000},
    {id:'b',clicks:30,orders:1,cost:10000,revenue:100001}
  ]);
  assert.equal(result.status,'INCONCLUSIVE');
  assert.equal(result.confidence,null);
  assert.equal(result.requiredConfidence,95);
  assert.equal(result.samples.sufficient,true);
});
