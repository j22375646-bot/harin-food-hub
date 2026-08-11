'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { product, order, item } = require('../lib/cafe24/mappers');
const { analyticsTotal, analyticsByDate } = require('../lib/cafe24/sync');

test('maps Cafe24 entities to database columns', () => {
  assert.equal(product({ product_no: 7, product_name: 'Tea', price: '12,000', display: 'T' }).price, 12000);
  assert.equal(order({ order_id: 'A1', actual_payment_amount: '9000' }).paid_amount, 9000);
  assert.equal(item('A1', { product_no: 7, product_name: 'Tea', quantity: '2' }, 0).quantity, 2);
});

test('analytics parser preserves daily values', () => {
  const values = analyticsByDate({ data: [{ date: '2026-08-08', count: 3 }, { date: '2026-08-09', count: 4 }] }, ['count'], '2026-08-09');
  assert.deepEqual([...values.entries()], [['2026-08-08', 3], ['2026-08-09', 4]]);
});

test('analytics parser sums known numeric fields without turning missing data into zero', () => {
  assert.equal(analyticsTotal({ data: [{ visitors: 3 }, { visitors: 4 }] }, ['visitors']), 7);
  assert.equal(analyticsTotal({ data: [{ unknown: 3 }] }, ['visitors']), null);
});
