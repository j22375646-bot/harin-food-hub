'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const labels=require('../lib/orders/shipping-label.js');

test('Cafe24 긴 세트 옵션은 상품명과 실제 묶음 수량만 송장에 남긴다',()=>{
  const result=labels.shippingLabelForOrder({
    platform:'CAFE24',
    items:[{
      name:'하린식품 레드비트차 45g(1.5gX30TB)',
      option:'용량 선택❤️ [단품/세트]=[BEST 세트]/30TB 3개/36000원/(총 90티백)',
      quantity:1
    }]
  });
  assert.equal(result.quantity,3);
  assert.match(result.goodsName,/^총 3개 \| 레드비트차/);assert.match(result.goodsName,/30TB 3개/);
  assert.doesNotMatch(result.goodsName,/BEST|36000|용량 선택|90티백/);
});

test('Cafe24 골라담기 옵션은 선택한 제품명과 총수량을 함께 만든다',()=>{
  const result=labels.cafe24ShippingLabel([{
    name:'하린식품 차 골라담기',
    option:'1번 선택: 우엉차 / 2번 선택: 국화차',
    quantity:1
  }]);
  assert.equal(result.quantity,2);
  assert.equal(result.goodsName,'총 2개 | 우엉차 + 국화차');
});

test('옵션에 제품명이 없으면 기본 상품명과 주문수량으로 안전하게 대체한다',()=>{
  const result=labels.cafe24ShippingLabel([{name:'작두콩차 36g(1.2gX30TB)',option:'기본 옵션',quantity:2}]);
  assert.equal(result.quantity,2);
  assert.match(result.goodsName,/^총 2개 \| 작두콩차/);
});

test('Coupang and Cafe24 preserve quantity first, compact option and UTF-8 budget',()=>{for(const platform of ['CAFE24','COUPANG']){const r=labels.shippingLabelForOrder({platform,items:[{name:'하린식품 작두콩차 '+ '긴 제품 제목'.repeat(30),option:'용량 선택=30TB 3개 / 27000원',quantity:2},{name:'다른 제품',quantity:1}]});assert.equal(r.quantity,7);assert.match(r.goodsName,/^총 7개/);assert.match(r.goodsName,/30TB 3개/);assert.match(r.goodsName,/외 1종/);assert.ok(Buffer.byteLength(r.goodsName,'utf8')<=100);assert.doesNotMatch(r.goodsName,/27000|선택|\uFFFD/);}});
