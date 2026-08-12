'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../lib/cafe24/analytics.js');

const orders = [
  { order_id:'A', order_date:'2026-08-01T03:00:00Z', customer_id:'member-1', paid_amount:10000 },
  { order_id:'B', order_date:'2026-08-02T03:00:00Z', customer_id:'', paid_amount:20000 }
];
const items = [
  { order_id:'A', product_name:'다시마', quantity:1, paid_amount:10000 },
  { order_id:'B', product_name:'쌀조청', quantity:2, unit_price:10000 }
];

test('퍼널의 미수집 단계와 실제 주문을 구분한다', () => {
  const result = analytics.buildCafe24Analytics({ orders, items, traffic:[{ date:'2026-08-01', visitors:100, pageviews:180, source_status:'OK' }] });
  assert.equal(result.funnel.stages.find(row => row.key === 'CARTS').status, 'NOT_COLLECTED');
  assert.equal(result.funnel.stages.find(row => row.key === 'ORDERS').value, 2);
  assert.equal(result.funnel.visitorToOrderRate, 2);
});

test('신규·기존고객은 고객 ID를 노출하지 않고 집계한다', () => {
  const history = [{ order_id:'OLD', order_date:'2026-07-20', customer_id:'member-1' }, ...orders];
  const result = analytics.buildCafe24Analytics({ orders, items, customerHistory:history, start:'2026-08-01', end:'2026-08-02' });
  assert.equal(result.customers.identifiedOrders, 1);
  assert.equal(result.customers.anonymousOrders, 1);
  assert.equal(result.customers.returningCustomers, 1);
  assert.equal(JSON.stringify(result).includes('member-1'), false);
});

test('유입경로를 마케팅 채널로 묶고 귀속 공백을 표시한다', () => {
  const result = analytics.buildCafe24Analytics({ orders, items, referrers:[
    { source:'참조 도메인 없음', visitors:60, orders:null, revenue:null },
    { source:'m.search.naver.com', visitors:30, orders:null, revenue:null },
    { source:'search.shopping.naver.com', visitors:10, orders:null, revenue:null }
  ] });
  assert.equal(result.acquisition[0].key, 'DIRECT');
  assert.equal(result.coverage.referrerAttribution, 'NOT_COLLECTED');
  assert.ok(result.recommendations.some(row => row.title.includes('UTM')));
});

test('트래픽과 유입경로 수집일이 다르면 기간불일치로 표시한다', () => {
  const result = analytics.buildCafe24Analytics({
    traffic:[{ date:'2026-08-01', visitors:10 }, { date:'2026-08-02', visitors:20 }],
    referrers:[{ date:'2026-08-02', source:'m.search.naver.com', visitors:5 }]
  });
  assert.equal(result.coverage.referrers, 'PERIOD_MISMATCH');
  assert.ok(result.findings.some(row => row.title.includes('기간불일치')));
});

test('상품별 매출비중·판매수량·객단가를 서버에서 계산한다', () => {
  const result = analytics.buildCafe24Analytics({ orders, items });
  assert.equal(result.products[0].name, '쌀조청');
  assert.equal(result.products[0].quantity, 2);
  assert.equal(result.products[0].salesShare, 20000 / 30000 * 100);
  assert.equal(result.products[0].averageOrderValue, 20000);
});
