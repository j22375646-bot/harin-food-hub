'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../lib/products/cafe24-catalog.js');

function product(overrides = {}) {
  return {
    external_product_no:'1', product_name:'작두콩차 36g', price:12000,
    display:true, selling:true, raw_data:{ variants:[] }, ...overrides
  };
}

test('Cafe24 판매·품절·판매중단 상태를 구매 가능 기준으로 나눈다', () => {
  assert.equal(catalog.classifyCafe24Product(product()).status, 'SELLING');
  assert.equal(catalog.classifyCafe24Product(product({ selling:false })).status, 'STOPPED');
  assert.equal(catalog.classifyCafe24Product(product({ display:false })).status, 'STOPPED');
  const soldOut = product({ raw_data:{ variants:[{ display:'T', selling:'T', inventories:{ use_inventory:'T', display_soldout:'T', quantity:0 } }] } });
  assert.equal(catalog.classifyCafe24Product(soldOut).status, 'OUT_OF_STOCK');
});

test('재고를 사용하지 않는 상품은 수량 0이어도 품절로 오판하지 않는다', () => {
  const unlimited = product({ raw_data:{ variants:[{ display:'T', selling:'T', inventories:{ use_inventory:'F', display_soldout:'F', quantity:0 } }] } });
  assert.equal(catalog.classifyCafe24Product(unlimited).status, 'SELLING');
});

test('이벤트·멤버십·쿠폰·리뷰 적립금·사은품은 비상품으로 제외한다', () => {
  const names = [
    '2026 공식몰 단독 이벤트', '하린식품 역대급 멤버쉽', '30% 할인쿠폰',
    '리뷰 쓰고 적립금 받기', '🎁사은품🎁 도라지조청 380g'
  ];
  for (const productName of names) {
    const result = catalog.classifyCafe24Product(product({ product_name:productName }));
    assert.equal(result.status, 'NON_PRODUCT', productName);
    assert.equal(result.is_sellable, false);
  }
});

test('카테고리 정보가 들어오면 이벤트 카테고리도 비상품으로 제외한다', () => {
  const result = catalog.classifyCafe24Product(product({ raw_data:{ categories:[{ category_name:'멤버십 이벤트' }] } }));
  assert.equal(result.status, 'NON_PRODUCT');
});

test('화면과 서버 저장 경로가 판매중 상품만 매칭·원가 대상으로 사용한다', () => {
  const root = path.join(__dirname,'..');
  const dashboard = fs.readFileSync(path.join(root,'app','dashboard-client.js'),'utf8');
  const bootstrap = fs.readFileSync(path.join(root,'app','api','products','bootstrap','route.js'),'utf8');
  const financial = fs.readFileSync(path.join(root,'lib','changes','financial-change.js'),'utf8');
  const mapping = fs.readFileSync(path.join(root,'lib','products','mapping-service.js'),'utf8');
  assert.match(dashboard,/sellableMasterProducts/);
  assert.match(dashboard,/품절 상품/);
  assert.match(dashboard,/판매중단 상품/);
  assert.match(bootstrap,/reconcileCafe24Catalog/);
  assert.match(financial,/PRODUCT_NOT_SELLING/);
  assert.match(mapping,/masterProductEligibility/);
});
