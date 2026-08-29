'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizePhase28Metric}=require('../lib/ui/phase28-view-model.js');

test('Phase 28 metric preserves a confirmed zero',()=>{
  const metric=normalizePhase28Metric({value:0,unit:'KRW',source:'Harin Orders',metricKind:'actual',status:'READY',period:'DAY',asOf:'2026-08-29T00:00:00.000Z',sampleSize:null});
  assert.equal(metric.value,0);
  assert.equal(metric.status,'READY');
  assert.equal(metric.sampleSize,null);
});

test('Phase 28 metric blocks a missing READY value instead of inventing zero',()=>{
  const metric=normalizePhase28Metric({value:null,unit:'KRW',source:'Harin Cost Ledger',metricKind:'calculated',status:'READY',period:'DAY',asOf:'2026-08-29T00:00:00.000Z'});
  assert.equal(metric.value,null);
  assert.equal(metric.status,'BLOCKED');
  assert.deepEqual(metric.reasons,['VALUE_MISSING']);
});

test('Phase 28 metric removes values from blocked and setup states',()=>{
  for(const status of ['BLOCKED','SETUP_REQUIRED','ERROR']){
    const metric=normalizePhase28Metric({value:123,unit:'EA',source:'Provider',metricKind:'estimate',status,period:'WEEK',asOf:null,reasons:['SOURCE_UNAVAILABLE']});
    assert.equal(metric.value,null);
    assert.equal(metric.status,status);
  }
});

test('Phase 28 metric rejects unknown evidence kinds and statuses',()=>{
  assert.throws(()=>normalizePhase28Metric({source:'x',metricKind:'magic',status:'READY'}),/metricKind/);
  assert.throws(()=>normalizePhase28Metric({source:'x',metricKind:'actual',status:'UNKNOWN'}),/status/);
});
