'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUnifiedInventoryCenter, cafe24Quantity, naverQuantity, stockState } = require('../lib/inventory/unified-center.js');

test('알려지지 않은 재고는 0이나 품절로 바꾸지 않는다', () => {
  const center = buildUnifiedInventoryCenter({
    now:new Date('2026-08-14T06:00:00Z'),
    masterProducts:[{id:'m1',name:'작두콩차',is_active:true}],
    channelProducts:[{master_product_id:'m1',platform:'CAFE24',external_product_id:'1',updated_at:'2026-08-14T05:00:00Z'}],
    cafe24Products:[{external_product_no:'1',updated_at:'2026-08-14T05:00:00Z',raw_data:{}}]
  });
  assert.equal(center.items[0].channels.CAFE24.quantity,null);
  assert.equal(center.items[0].channels.CAFE24.state,'UNKNOWN');
  assert.equal(center.summary.out_of_stock,0);
  assert.equal(center.summary.unknown,1);
});

test('Cafe24와 네이버 옵션 재고를 합산한다', () => {
  assert.equal(cafe24Quantity({raw_data:{variants:[{inventory_quantity:4},{inventory_quantity:'6'}]}}),10);
  assert.equal(naverQuantity({raw_data:{optionCombinations:[{stockQuantity:3},{stockQuantity:7}]}}),10);
});

test('판매자배송과 로켓그로스 재고를 구분해 합산한다', () => {
  const center = buildUnifiedInventoryCenter({
    now:new Date('2026-08-14T06:00:00Z'),
    masterProducts:[{id:'m1',name:'작두콩차',is_active:true}],
    channelProducts:[{master_product_id:'m1',platform:'COUPANG',external_product_id:'cp1'}],
    coupangProductItems:[{seller_product_id:'cp1',vendor_item_id:'vi1'},{seller_product_id:'cp1',vendor_item_id:'vi2'}],
    coupangItemInventory:[{vendor_item_id:'vi1',quantity:4,checked_at:'2026-08-14T05:00:00Z'}],
    coupangRgInventory:[{vendor_item_id:'vi2',total_orderable_quantity:6,snapshot_at:'2026-08-14T05:10:00Z'}]
  });
  const coupang = center.items[0].channels.COUPANG;
  assert.equal(coupang.marketplace_quantity,4);
  assert.equal(coupang.rocket_growth_quantity,6);
  assert.equal(coupang.quantity,10);
  assert.equal(coupang.state,'LOW');
  assert.equal(center.summary.low_stock,1);
});

test('오래된 양수 재고는 갱신 필요로 분리한다', () => {
  const center = buildUnifiedInventoryCenter({
    now:new Date('2026-08-14T12:30:00Z'), staleHours:6,
    masterProducts:[{id:'m1',name:'작두콩차',is_active:true}],
    channelProducts:[{master_product_id:'m1',platform:'NAVER',external_product_id:'np1',updated_at:'2026-08-14T05:00:00Z',raw_data:{source_type:'NAVER_COMMERCE_PRODUCT',stockQuantity:20,updatedAt:'2026-08-14T05:00:00Z'}}]
  });
  assert.equal(center.items[0].channels.NAVER.state,'STALE');
  assert.equal(center.summary.stale,1);
  assert.equal(stockState(null),'UNKNOWN');
});
