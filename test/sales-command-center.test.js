const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductSignals, targetLikelihood, buildCashflow, buildSmartSchedule, buildDailyOperations, buildSalesCommandCenter } = require('../lib/dashboard/sales-command-center.js');

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

test('daily command center deduplicates operational tasks and keeps exceptions separate', () => {
  const daily=buildDailyOperations({
    now:'2026-08-15T05:30:00.000Z',
    unifiedOrders:{ orders:[{hubOrderId:'ORDER-1',actionRequired:true},{hubOrderId:'ORDER-1',actionRequired:true},{hubOrderId:'DONE',actionRequired:false}] },
    customerService:{ active:[{id:'CASE-1'},{id:'CASE-1'}] },
    unifiedInventory:{ items:[{master_product_id:'P-1',action_required:true},{master_product_id:'P-2',action_required:false}] },
    alerts:[{id:'A-1',status:'OPEN',severity:'ERROR',title:'수집 오류'},{id:'A-2',status:'RESOLVED'}],
    priorityCenter:{ items:[
      {id:'ALERT:A-1',source:'ALERT'},
      {id:'QUALITY:Q-1',source:'DATA_QUALITY',title:'자료 확인',reason:'오래된 자료',view:'collection'},
      {id:'ACTION:X-1',source:'ACTION',title:'결정 확인',view:'reports'}
    ] },
    reliabilityCenter:{ dead_letters:[{kind:'SYNC',id:'D-1',title:'쿠팡 재수집',error:'실패'}] },
    dataHealth:{ channels:[{platform:'NAVER',status:'FAILED',storedSummary:'최근 수집 실패'},{platform:'CAFE24',status:'READY'}] }
  });
  assert.equal(daily.total,8);
  assert.deepEqual(Object.fromEntries(daily.groups.map(item=>[item.id,item.count])),{orders:1,cs:1,inventory:1,decisions:1,exceptions:4});
  assert.equal(daily.exception_total,4);
  assert.equal(new Set(daily.exceptions.map(item=>item.id)).size,4);
});

test('smart schedule uses the Seoul 15:00 shipping cutoff', () => {
  const schedule=buildSmartSchedule('2026-08-15T05:30:00.000Z');
  assert.equal(schedule.date,'2026-08-15');
  assert.equal(schedule.cutoff_state,'BEFORE');
  assert.equal(schedule.cutoff_at,'2026-08-15T15:00:00+09:00');
  assert.equal(schedule.items.find(item=>item.id==='SHIP').status,'NOW');
  assert.equal(schedule.items.find(item=>item.id==='REGISTER').status,'UPCOMING');
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
