'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const targets = require('../lib/marketing/product-ad-targets.js');

const trust = { status:'READY' };
const item = {
  master_product_id:'P1', name:'작두콩차', revenue:100000, orders:10, contribution_before_ads:40000, cost_status:'CALCULATED',
  channels:{ NAVER:{ clicks:100, orders:5, ad_spend:10000 } }
};

test('상품별 목표 이익률로 목표 ROAS, 허용 CPA와 CPC를 서버 계산한다', () => {
  const result=targets.calculateProductTarget({item,target:{target_profit_margin_rate:10},financialTrust:trust,periodEnd:'2026-08-14',asOf:'2026-08-14T12:00:00Z'});
  assert.equal(result.status,'READY');
  assert.equal(result.break_even_roas,250);
  assert.equal(result.target_roas,333.33);
  assert.equal(result.allowable_cpa,3000);
  assert.equal(result.allowable_cpc,150);
});

test('목표를 입력하지 않으면 임의의 ROAS 700을 사용하지 않고 판단 보류한다', () => {
  const result=targets.calculateProductTarget({item,financialTrust:trust,periodEnd:'2026-08-14',asOf:'2026-08-14T12:00:00Z'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.target_roas,null);
  assert.ok(result.reasons.some(reason=>reason.code==='TARGET_REQUIRED'));
});

test('원가 신뢰가 막히거나 데이터가 오래되면 금액 판단을 차단한다', () => {
  const result=targets.calculateProductTarget({item,target:{target_profit_margin_rate:10},financialTrust:{status:'BLOCKED'},periodEnd:'2026-08-01',asOf:'2026-08-14T12:00:00Z'});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.allowable_cpc,null);
  assert.ok(result.reasons.some(reason=>reason.code==='FINANCIAL_TRUST_BLOCKED'));
  assert.ok(result.reasons.some(reason=>reason.code==='STALE_DATA'));
});

test('고정 클릭 수가 아니라 목표 CPA 대비 누적 비용으로 표본 상태를 판단한다', () => {
  assert.equal(targets.sampleDecision({cost:2000,conversions:0,allowableCpa:3000}).code,'OBSERVE');
  assert.equal(targets.sampleDecision({cost:3500,conversions:0,allowableCpa:3000}).code,'REVIEW');
  assert.equal(targets.sampleDecision({cost:6500,conversions:0,allowableCpa:3000}).code,'STRONG_REVIEW');
});
