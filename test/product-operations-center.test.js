'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUnifiedProductOperations, isNaverCommerceProduct, priceGapRate } = require('../lib/products/operations-center.js');

test('네이버 광고그룹을 스마트스토어 실상품 연결로 계산하지 않는다', () => {
  const center = buildUnifiedProductOperations({
    masterProducts:[{ id:'m1', name:'작두콩차', selling_price:10000, is_active:true }],
    channelProducts:[
      { master_product_id:'m1', platform:'CAFE24', external_product_id:'1', external_product_name:'작두콩차', is_active:true },
      { master_product_id:'m1', platform:'NAVER', external_product_id:'ad1', external_product_name:'광고 / 작두콩차', is_active:true, raw_data:{ source_type:'NAVER_ADGROUP' } },
      { master_product_id:'m1', platform:'COUPANG', external_product_id:'cp1', external_product_name:'작두콩차', is_active:true }
    ],
    cafe24Products:[{ external_product_no:'1', product_name:'작두콩차', price:10000, selling:true }],
    coupangProducts:[{ seller_product_id:'cp1', product_name:'작두콩차', status:'APPROVED' }],
    coupangProductItems:[{ seller_product_id:'cp1', vendor_item_id:'vi1', sale_price:11000 }],
    coupangItemInventory:[{ vendor_item_id:'vi1', quantity:4 }]
  });
  assert.equal(center.items[0].channels.NAVER.state, 'REFERENCE');
  assert.equal(center.items[0].connected_channels, 2);
  assert.equal(center.summary.all_channels_connected, 0);
  assert.equal(center.summary.naver_real_products, 0);
});

test('가격차와 쿠팡 품절을 운영 이상으로 분류한다', () => {
  const center = buildUnifiedProductOperations({
    masterProducts:[{ id:'m1', name:'작두콩차', selling_price:10000, is_active:true }],
    channelProducts:[
      { master_product_id:'m1', platform:'CAFE24', external_product_id:'1', external_product_name:'작두콩차', is_active:true },
      { master_product_id:'m1', platform:'NAVER', external_product_id:'np1', external_product_name:'작두콩차', selling_price:10000, is_active:true, raw_data:{ source_type:'NAVER_COMMERCE_PRODUCT' } },
      { master_product_id:'m1', platform:'COUPANG', external_product_id:'cp1', external_product_name:'작두콩차', is_active:true }
    ],
    cafe24Products:[{ external_product_no:'1', product_name:'작두콩차', price:10000, selling:true }],
    coupangProducts:[{ seller_product_id:'cp1', product_name:'작두콩차', status:'APPROVED' }],
    coupangProductItems:[{ seller_product_id:'cp1', vendor_item_id:'vi1', sale_price:12000 }],
    coupangItemInventory:[{ vendor_item_id:'vi1', quantity:0 }]
  });
  assert.equal(center.items[0].channels.COUPANG.state, 'OUT_OF_STOCK');
  assert.ok(center.items[0].issues.some(issue => issue.code === 'PRICE_GAP'));
  assert.ok(center.items[0].issues.some(issue => issue.code === 'COUPANG_INACTIVE'));
  assert.equal(center.summary.stopped_or_out, 1);
});

test('상품 원천 판별과 가격차 계산을 안전하게 처리한다', () => {
  assert.equal(isNaverCommerceProduct({ raw_data:{ source_type:'NAVER_COMMERCE_PRODUCT' } }), true);
  assert.equal(isNaverCommerceProduct({ raw_data:{ source_type:'NAVER_ADGROUP' } }), false);
  assert.equal(priceGapRate([10000, 11000]), 10);
  assert.equal(priceGapRate([10000, null]), null);
});
