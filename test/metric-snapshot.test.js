'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const snapshots = require('../lib/metrics/snapshot.js');

test('MetricSnapshot keeps provenance and formula version with a valid value', () => {
  const result = snapshots.createMetricSnapshot({
    id:'CAFE24_SALES', label:'Cafe24 매출', value:125000, unit:'KRW',
    sources:[{ platform:'CAFE24', dataset:'cafe24_orders' }],
    asOf:'2026-08-12T05:30:00+09:00', periodStart:'2026-08-01', periodEnd:'2026-08-12',
    formula:'sum(order.paid_amount)', sampleSize:12
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.value, 125000);
  assert.equal(result.source[0].dataset, 'cafe24_orders');
  assert.equal(result.formula.version, 'metric-snapshot-v1');
  assert.equal(result.as_of, '2026-08-11T20:30:00.000Z');
});

test('unknown READY values remain unknown instead of becoming zero', () => {
  const result = snapshots.createMetricSnapshot({
    id:'NAVER_ROAS', label:'네이버 ROAS', value:null, unit:'PERCENT',
    sources:[{ platform:'NAVER', dataset:'naver_stats_daily' }], formula:'revenue / cost * 100'
  });
  assert.equal(result.status, 'NO_DATA');
  assert.equal(result.value, null);
});

test('blocked and parse-error snapshots never expose a misleading numeric value', () => {
  for (const status of ['BLOCKED','PARSE_ERROR']) {
    const result = snapshots.createMetricSnapshot({
      id:`TRUST_${status}`, label:'기여이익', value:50000, unit:'KRW', status,
      sources:[{ platform:'ALL', dataset:'product_costs' }], formula:'sales - variable costs'
    });
    assert.equal(result.value, null);
  }
});
