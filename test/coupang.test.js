'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const client = require('../lib/coupang/client.js');
const map = require('../lib/coupang/mappers.js');
const sync = require('../lib/coupang/sync.js');
const operations = require('../lib/coupang/operations.js');

test('Coupang HMAC signature is deterministic and contains no secret', () => {
  const authorization = client.createAuthorization({
    method: 'GET',
    path: '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products',
    query: 'vendorId=A00000000&maxPerPage=100',
    accessKey: 'access-key',
    secretKey: 'super-secret',
    now: new Date('2026-08-11T12:34:56.000Z')
  });
  assert.match(authorization, /^CEA algorithm=HmacSHA256, access-key=access-key, signed-date=260811T123456Z, signature=[a-f0-9]{64}$/);
  assert.equal(authorization.includes('super-secret'), false);
});

test('Coupang raw payload removes buyer PII recursively', () => {
  const safe = map.sanitize({
    orderId: '1',
    orderer: { name: 'buyer', email: 'hidden@example.com' },
    receiver: { name: 'receiver', phone: '010-0000-0000', address: 'hidden' },
    orderItems: [{ vendorItemId: '2', productName: 'food' }]
  });
  assert.equal(safe.orderId, '1');
  assert.equal(safe.orderer, undefined);
  assert.equal(safe.receiver, undefined);
  assert.equal(safe.orderItems[0].productName, 'food');
});

test('Coupang order mapper stores operational data only', () => {
  const source = { shipmentBoxId: 123, orderId: 456, orderedAt: '2026-08-11T01:00:00Z', receiver: { name: 'private' }, orderItems: [{ vendorItemId: 7, vendorItemName: '작두콩차', orderPrice: 5000, shippingCount: 2 }] };
  const order = map.mapOrder(source);
  const items = map.mapOrderItems(source);
  assert.equal(order.gross_amount, 10000);
  assert.equal(order.raw_data.receiver, undefined);
  assert.equal(items[0].paid_amount, 10000);
  assert.match(items[0].external_item_key, /^[a-f0-9]{64}$/);
});

test('Rocket Growth inventory mapper calculates days of stock and risk', () => {
  const mapped = map.mapRocketGrowthInventory({ vendorItemId: 7, externalSkuId: 'SKU-7', inventoryDetails: { totalOrderableQuantity: 10 }, salesCountMap: { SALES_COUNT_LAST_THIRTY_DAYS: 60 } }, new Date('2026-08-12T00:00:00Z'));
  assert.equal(mapped.vendor_item_id, '7');
  assert.equal(mapped.average_daily_sales, 2);
  assert.equal(mapped.days_of_stock, 5);
  assert.equal(mapped.stock_status, 'CRITICAL');
});

test('Rocket Growth inventory mapper marks zero stock as out of stock', () => {
  const mapped = map.mapRocketGrowthInventory({ vendorItemId: 8, inventoryDetails: { totalOrderableQuantity: 0 }, salesCountMap: { SALES_COUNT_LAST_THIRTY_DAYS: 3 } });
  assert.equal(mapped.days_of_stock, 0);
  assert.equal(mapped.stock_status, 'OUT_OF_STOCK');
});

test('Rocket Growth order mapper removes customer data and totals items', () => {
  const mapped = map.mapRocketGrowthOrder({ orderId: 99, customerName: 'private', paidDate: '2026-08-12T01:00:00Z', items: [{ vendorItemId: 7, productName: 'tea', unitPrice: 3000, quantity: 2 }] });
  assert.equal(mapped.order.order_id, '99');
  assert.equal(mapped.order.total_amount, 6000);
  assert.equal(mapped.order.raw_data.customerName, undefined);
  assert.equal(mapped.items[0].amount, 6000);
});

test('Rocket Growth order mapper reads the live unitSalesPrice and salesQuantity fields', () => {
  const mapped = map.mapRocketGrowthOrder({ orderId: 100, paidDate: '2026-08-12T01:00:00Z', items: [{ vendorItemId: 8, productName: 'salt', unitSalesPrice: '15000.0', salesQuantity: 2 }] });
  assert.equal(mapped.order.total_amount, 30000);
  assert.equal(mapped.items[0].quantity, 2);
  assert.equal(mapped.items[0].amount, 30000);
});

test('Coupang operations mappers normalize settlement and budget fields', () => {
  const settlement = map.mapSettlementSummary({ settlementType: 'MONTHLY', totalSale: 100000, serviceFee: 10000, finalAmount: 90000 }, '2026-08');
  const budget = map.mapBudget({ contractId: 12, totalBudgetAmount: 50000, usedBudgetAmount: 12000 });
  assert.equal(settlement.final_amount, 90000);
  assert.equal(budget.budget_amount, 50000);
  assert.equal(budget.remaining_amount, 38000);
});

test('Coupang product detail mapper preserves both seller-delivery and Rocket Growth images', () => {
  const rows = map.mapProductDetailItems({ data: { sellerProductId: 10, sellerProductName: '하린식품 차', statusName: '승인완료', items: [
    { itemName: '1개', images:[{cdnPath:'//image.coupangcdn.com/rg.jpg'}], rocketGrowthItemData: { vendorItemId: 20, priceData: { salePrice: 14500 } } },
    { itemName: '일반', images:[{cdnPath:'//image.coupangcdn.com/seller.jpg'}], marketplaceItemData: { vendorItemId: 30 } }
  ] } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].vendor_item_id, '20');
  assert.equal(rows[0].item_name, '하린식품 차 · 1개');
  assert.equal(rows[0].sale_price, 14500);
  assert.equal(rows[1].vendor_item_id, '30');
  assert.equal(rows[1].raw_data.images[0].cdnPath,'//image.coupangcdn.com/seller.jpg');
});

test('Coupang hybrid product mapper keeps both Rocket Growth and seller-delivery vendor item IDs', () => {
  const rows = map.mapProductDetailItems({ data: {
    sellerProductId: 10,
    sellerProductName: '하린식품 차',
    statusName: '승인완료',
    items: [{
      itemName: '3개',
      images:[{cdnPath:'vendor_inventory/10/tea.png'}],
      rocketGrowthItemData:{vendorItemId:20,priceData:{salePrice:14500}},
      marketplaceItemData:{vendorItemId:30,priceData:{salePrice:15500}}
    }]
  } });

  assert.deepEqual(rows.map(row=>row.vendor_item_id),['20','30']);
  assert.deepEqual(rows.map(row=>row.sale_price),[14500,15500]);
  assert.equal(rows[0].raw_data.images[0].cdnPath,'vendor_inventory/10/tea.png');
  assert.equal(rows[1].raw_data.images[0].cdnPath,'vendor_inventory/10/tea.png');
});

test('쿠팡 최근 주문 정보는 상품 상세의 판매 상태와 가격을 덮어쓰지 않는다', () => {
  const detailRows=[{
    vendor_item_id:'20',seller_product_id:'10',item_name:'작두콩차 30티백',sale_price:14500,status:'승인완료',raw_data:{fulfillmentType:'MARKETPLACE'}
  }];
  const rows=sync.mergeProductItemRows(detailRows,[{
    vendor_item_id:'20',seller_product_id:'10',product_name:'작두콩차 30티백',unit_price:13000,status:'FINAL_DELIVERY',raw_data:{invoiceNumber:'123'}
  }]);
  assert.equal(rows[0].status,'승인완료');
  assert.equal(rows[0].sale_price,14500);
  assert.equal(rows[0].raw_data.invoiceNumber,'123');
});

test('쿠팡 실시간 주문 수집은 이미지가 없는 주문 상품만 상세 재수집 대상으로 고른다', () => {
  const targets=sync.orderImageProductsToRefresh([
    {seller_product_id:'10',vendor_item_id:'20'},
    {seller_product_id:'10',vendor_item_id:'21'},
    {seller_product_id:'11',vendor_item_id:'30'},
    {seller_product_id:null,vendor_item_id:'40'}
  ],[
    {seller_product_id:'10',vendor_item_id:'20',raw_data:{images:[{cdnPath:'vendor_inventory/10/20.png'}]}},
    {seller_product_id:'10',vendor_item_id:'21',raw_data:{images:null}},
    {seller_product_id:'11',vendor_item_id:'30',raw_data:{images:[{cdnPath:'//image10.coupangcdn.com/30.png'}]}}
  ]);
  assert.deepEqual(targets,[{sellerProductId:'10'}]);
});

test('쿠팡 재고 수집 대상은 최근 주문 옵션이 아니라 전체 상품 상세 옵션이다', () => {
  const ids=sync.inventoryVendorItemIds([
    {vendor_item_id:'20'},{vendor_item_id:'30'},{vendor_item_id:'20'},{vendor_item_id:null}
  ]);
  assert.deepEqual(ids,['20','30']);
});

test('쿠팡 재고 수집은 300개 이상의 판매 옵션도 임의로 잘라내지 않는다', () => {
  const ids=operations.uniqueInventoryIds(Array.from({length:350},(_,index)=>String(index+1)));
  assert.equal(ids.length,350);
  assert.equal(ids.at(-1),'350');
});

test('Coupang inquiry mapper never stores question or answer text', () => {
  const inquiry = map.mapInquiry({ inquiryId: 1, question: 'private question', answer: 'private answer', answered: false }, 'ONLINE');
  assert.equal(inquiry.inquiry_key, 'ONLINE:1');
  assert.equal(inquiry.raw_data.question, undefined);
  assert.equal(inquiry.raw_data.answer, undefined);
});
