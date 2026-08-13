'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProductVariants } = require('../lib/cafe24/sync.js');
const { cafe24Quantity } = require('../lib/inventory/unified-center.js');

test('Cafe24 상품에 옵션별 판매가능 재고를 보존하고 합산한다', () => {
  const raw=mergeProductVariants({product_no:7,product_name:'작두콩차'},{variants:[
    {variant_code:'P00000000001',quantity:4},
    {variant_code:'P00000000002',quantity:6}
  ]});
  assert.equal(raw.variants.length,2);
  assert.equal(cafe24Quantity({raw_data:raw}),10);
});

test('옵션 재고 응답이 없으면 품절 0개를 만들지 않는다', () => {
  const raw=mergeProductVariants({product_no:7},{errors:[{code:'NOT_FOUND'}]});
  assert.deepEqual(raw.variants,[]);
  assert.equal(cafe24Quantity({raw_data:raw}),null);
});
