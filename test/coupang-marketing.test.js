const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInventoryMarketing } = require('../lib/coupang/marketing');

function item(quantity, sales, price = 10000) {
  return { vendor_item_id: `${quantity}-${sales}`, total_orderable_quantity: quantity, sales_last_30_days: sales, productItem: { item_name: '테스트 상품', sale_price: price } };
}

test('재고일수가 14일 미만이면 광고 확대 보류를 권장한다', () => {
  const result = buildInventoryMarketing([item(10, 30)]);
  assert.equal(result.items[0].inventoryMarketing.code, 'RESTOCK');
  assert.equal(result.items[0].inventoryMarketing.action, '광고 확대 보류');
  assert.equal(result.summary.forecast7dRevenue, 70000);
});

test('판매 이력이 없는 재고는 노출 개선 후보로 분류한다', () => {
  const result = buildInventoryMarketing([item(25, 0)]);
  assert.equal(result.items[0].inventoryMarketing.code, 'DISCOVERY');
  assert.equal(result.summary.promotionSku.vendor_item_id, '25-0');
});

test('품절인데 판매 이력이 있으면 재입고 최우선으로 분류한다', () => {
  const result = buildInventoryMarketing([item(0, 12)]);
  assert.equal(result.items[0].inventoryMarketing.code, 'RESTOCK_URGENT');
  assert.equal(result.items[0].inventoryMarketing.label, '재입고 최우선');
});
