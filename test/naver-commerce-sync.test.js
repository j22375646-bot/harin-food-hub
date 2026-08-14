'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../lib/naver-commerce/sync.js');

test('네이버 상품 응답을 상품센터의 커머스 상품으로 변환한다', () => {
  const rows = sync.flattenProducts({ contents:[{
    originProductNo:100,
    channelProducts:[{ channelProductNo:200, name:'작두콩차', discountedPrice:12900, statusType:'SALE' }]
  }] }, '2026-08-14T00:00:00.000Z');
  assert.equal(rows.length,1);
  assert.equal(rows[0].externalProductId,'200');
  assert.equal(rows[0].sellingPrice,12900);
  assert.equal(rows[0].rawData.source_type,'NAVER_COMMERCE_PRODUCT');
});

test('네이버 상품주문 상세를 주문·옵션·배송정보로 분리한다', () => {
  const row = sync.mapOrderDetail({
    order:{ orderId:'N-ORDER-1', orderDate:'2026-08-14T08:00:00+09:00', paymentDate:'2026-08-14T08:01:00+09:00' },
    productOrder:{
      productOrderId:'N-ITEM-1', productOrderStatus:'PREPARING_PRODUCT', productId:'P1',
      productName:'작두콩차', productOption:'30티백', quantity:2, totalPaymentAmount:24000,
      shippingAddress:{ name:'홍길동', tel1:'010-0000-0000', zipCode:'12345', baseAddress:'서울시', detailedAddress:'1층' },
      shippingMemo:'문 앞'
    }
  }, '2026-08-14T00:00:00.000Z');
  assert.equal(row.order.order_id,'N-ORDER-1');
  assert.equal(row.order.receiver_address,'12345 서울시 1층');
  assert.equal(row.item.product_order_id,'N-ITEM-1');
  assert.equal(row.item.option_name,'30티백');
  assert.equal(row.item.quantity,2);
});

test('네이버 정산행은 동일 자료에 안정적인 저장 키를 만든다', () => {
  const source={ settleBasisStartDate:'2026-08-01',settleBasisEndDate:'2026-08-01',settleAmount:94000,paySettleAmount:100000,commissionSettleAmount:6000 };
  assert.equal(sync.settlementKey(source),sync.settlementKey({...source}));
  assert.notEqual(sync.settlementKey(source),sync.settlementKey({...source,settleAmount:93000}));
  assert.equal(sync.mapSettlement(source).settle_amount,94000);
});
