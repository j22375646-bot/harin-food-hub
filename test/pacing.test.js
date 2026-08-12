const test = require('node:test');
const assert = require('node:assert/strict');
const { monthBounds, calculatePacing, snapshotRow } = require('../lib/analytics/pacing.js');
const { cafe24PaidAmount } = require('../lib/analytics/pacing-service.js');

test('month bounds handle leap-free August and December rollover', () => {
  assert.deepEqual(monthBounds('2026-08'), { month:'2026-08', start:'2026-08-01', end:'2026-08-31', next:'2026-09-01', daysInMonth:31 });
  assert.equal(monthBounds('2026-12').next, '2027-01-01');
});

test('forecast and remaining daily requirements are calculated from elapsed days', () => {
  const result = calculatePacing({ month:'2026-08', asOf:'2026-08-10', revenueActual:1_000_000, revenueTarget:3_100_000, adSpendActual:200_000, adBudget:620_000 });
  assert.equal(result.revenueForecast, 3_100_000);
  assert.equal(result.adSpendForecast, 620_000);
  assert.equal(result.requiredDailyRevenue, 100_000);
  assert.equal(result.recommendedDailySpend, 20_000);
  assert.equal(result.status, 'ON_TRACK');
});

test('overspending and weak revenue forecast become at risk', () => {
  const result = calculatePacing({ month:'2026-08', asOf:'2026-08-10', revenueActual:500_000, revenueTarget:3_100_000, adSpendActual:300_000, adBudget:620_000 });
  assert.equal(result.status, 'AT_RISK');
  assert.ok(result.revenuePacingRate < 85);
  assert.ok(result.budgetPacingRate > 115);
});

test('forecast is available before targets are entered', () => {
  const result = calculatePacing({ month:'2026-08', asOf:'2026-08-10', revenueActual:700_000, adSpendActual:100_000 });
  assert.equal(result.status, 'TARGET_REQUIRED');
  assert.equal(result.revenueForecast, 2_170_000);
  assert.equal(result.actualRoas, 700);
});

test('snapshot row keeps the server calculation audit payload', () => {
  const pacing = calculatePacing({ month:'2026-08', asOf:'2026-08-12', revenueActual:1, revenueTarget:100 });
  const row = snapshotRow({ id:'target-id' }, pacing);
  assert.equal(row.target_id, 'target-id');
  assert.equal(row.snapshot_date, '2026-08-12');
  assert.equal(row.calculation_json.status, 'AT_RISK');
});

test('Cafe24 monthly revenue falls back to raw API payment amount', () => {
  assert.equal(cafe24PaidAmount({ paid_amount:null, order_price:null, raw_data:{ actual_order_amount:{ payment_amount:'43900' } } }), 43900);
  assert.equal(cafe24PaidAmount({ paid_amount:'12000', raw_data:{ payment_amount:'99999' } }), 12000);
});
