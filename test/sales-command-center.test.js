const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductSignals, targetLikelihood, buildCashflow, buildSalesCommandCenter } = require('../lib/dashboard/sales-command-center.js');

test('sales command center exposes the six owner decision metrics', () => {
  const result = buildSalesCommandCenter({
    pacing:{ month:'2026-08', asOf:'2026-08-10', items:[{ platform:'ALL', revenueTarget:3_100_000, revenueActual:1_000_000, revenueForecast:3_100_000, requiredDailyRevenue:100_000, revenueProgressRate:32.26, elapsedDays:10, adSpendActual:200_000 }] },
    financialTrust:{ status:'READY' }, profitability:{ contribution_margin_rate:40 }
  });
  assert.deepEqual(result.metrics, { target:3_100_000, current:1_000_000, forecast:3_100_000, shortage:2_100_000, forecastShortage:0, requiredDailyRevenue:100_000, progressRate:32.3 });
  assert.equal(result.likelihood.code, 'HIGH');
  assert.equal(result.cashflow.status, 'ESTIMATE');
});

test('missing target and untrusted costs stay explicit instead of becoming zero', () => {
  assert.equal(targetLikelihood({ platform:'ALL', revenueActual:100 }).code, 'TARGET_REQUIRED');
  const cashflow = buildCashflow({ platform:'ALL', revenueActual:1_000_000, adSpendActual:100_000, elapsedDays:10 }, { contribution_margin_rate:null }, { status:'BLOCKED' });
  assert.equal(cashflow.expectedInflow, 3_000_000);
  assert.equal(cashflow.expectedBalance, null);
  assert.equal(cashflow.status, 'CHECK_REQUIRED');
});

test('unavailable pacing data is not rendered as zero revenue', () => {
  const result = buildSalesCommandCenter({ pacing:{ status:'NO_DATA', items:[] } });
  assert.equal(result.metrics.current, null);
  assert.equal(result.metrics.forecast, null);
  assert.equal(result.likelihood.code, 'CHECK_REQUIRED');
  assert.equal(result.cashflow.expectedInflow, null);
});

test('product signals compare current seven days with the previous seven days', () => {
  const signals = buildProductSignals({
    asOf:'2026-08-14',
    cafe24Orders:[{order_id:'new',order_date:'2026-08-14'},{order_id:'old',order_date:'2026-08-07'}],
    cafe24OrderItems:[{order_id:'new',external_product_no:'1',product_name:'작두콩차',paid_amount:300_000},{order_id:'old',external_product_no:'1',product_name:'작두콩차',paid_amount:100_000}],
    coupangProducts:[{vendorItemId:'2',name:'우엉차',inventory:{status:'LOW_STOCK',daysOfStock:4},daily:[{date:'2026-08-14',revenue:50_000},{date:'2026-08-07',revenue:100_000}]}]
  });
  assert.equal(signals.growth[0].name, '작두콩차');
  assert.equal(signals.growth[0].growthRate, 200);
  assert.equal(signals.risk[0].name, '우엉차');
  assert.match(signals.risk[0].riskReason, /재고/);
});
