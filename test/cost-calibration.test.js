'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const calibration = require('../lib/analytics/cost-calibration.js');

function datedRows(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index, `2026-08-${String(index % 10 + 1).padStart(2, '0')}`));
}

test('쿠팡 확정 정산과 WING 물류 실비로 유효 비용 설정을 자동 보정한다', () => {
  const settlements = datedRows(25, (index, date) => ({
    order_id:`O${index}`, recognition_date:date, sale_type:'SALE', sale_amount:10000, service_fee:1000, service_fee_vat:100
  }));
  const costTransactions = datedRows(25, (index, date) => ([
    { source_type:'SHIPPING', order_id:`O${index}`, event_date:date, cost_amount:1000 },
    { source_type:'WAREHOUSING', order_id:`O${index}`, event_date:date, cost_amount:500 }
  ])).flat();
  const result = calibration.calculateCoupangCostCalibration({
    settlements, costTransactions,
    currentSetting:{ platform:'COUPANG', commission_rate:.05, payment_fee_rate:.03, default_shipping_cost:3000 },
    now:new Date('2026-08-12T00:00:00Z')
  });
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.confidence, 'MEDIUM');
  assert.equal(result.commission.source, 'COUPANG_SETTLEMENT_API');
  assert.equal(result.effective_setting.commission_rate, .11);
  assert.equal(result.effective_setting.payment_fee_rate, 0);
  assert.equal(result.effective_setting.default_shipping_cost, 1500);
  assert.deepEqual(result.auto_applied_fields, ['COMMISSION_RATE', 'SHIPPING_COST']);
});

test('표본이 부족하면 실제값을 확정하지 않고 수동 설정을 유지한다', () => {
  const result = calibration.calculateCoupangCostCalibration({
    settlements:[{ order_id:'O1', recognition_date:'2026-08-11', sale_type:'SALE', sale_amount:10000, service_fee:1000, service_fee_vat:100 }],
    costTransactions:[],
    currentSetting:{ platform:'COUPANG', commission_rate:.06, payment_fee_rate:.02, default_shipping_cost:3200 },
    now:new Date('2026-08-12T00:00:00Z')
  });
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.auto_applied, false);
  assert.equal(result.effective_setting.commission_rate, .06);
  assert.equal(result.effective_setting.payment_fee_rate, .02);
  assert.equal(result.effective_setting.default_shipping_cost, 3200);
  assert.equal(result.warnings.length, 2);
});

test('충분했던 표본도 120일이 지나면 자동 보정에 사용하지 않는다', () => {
  const settlements = datedRows(25, (index, date) => ({
    order_id:`OLD${index}`, recognition_date:date, sale_type:'SALE', sale_amount:10000, service_fee:1000, service_fee_vat:100
  }));
  const result = calibration.calculateCoupangCostCalibration({
    settlements,
    currentSetting:{ platform:'COUPANG', commission_rate:.07, payment_fee_rate:.01, default_shipping_cost:3000 },
    now:new Date('2027-01-15T00:00:00Z')
  });
  assert.equal(result.commission.confidence, 'LOW');
  assert.equal(result.effective_setting.commission_rate, .07);
  assert.equal(result.effective_setting.payment_fee_rate, .01);
});

test('정산 API 표본이 부족하면 충분한 WING 판매수수료를 대체 근거로 쓴다', () => {
  const costs = datedRows(25, (index, date) => ({
    source_type:'SALES_COMMISSION', order_id:`W${index}`, event_date:date,
    gross_sales:20000, cost_amount:2000, cost_vat:200
  }));
  const result = calibration.calculateCoupangCostCalibration({ costTransactions:costs, now:new Date('2026-08-12T00:00:00Z') });
  assert.equal(result.commission.source, 'COUPANG_WING_COMMISSION');
  assert.equal(result.effective_setting.commission_rate, .11);
  assert.equal(result.auto_applied_fields.includes('COMMISSION_RATE'), true);
});

test('실제 보정값을 쿠팡 설정에만 합성한다', () => {
  const settings = [{ platform:'CAFE24', commission_rate:.03 }, { platform:'COUPANG', commission_rate:0 }];
  const result = calibration.withEffectiveChannelSettings(settings, { effective_setting:{ platform:'COUPANG', commission_rate:.11, payment_fee_rate:0, default_shipping_cost:3100 } });
  assert.equal(result.find(item => item.platform === 'CAFE24').commission_rate, .03);
  assert.equal(result.find(item => item.platform === 'COUPANG').default_shipping_cost, 3100);
  assert.equal(settings[1].commission_rate, 0);
});
