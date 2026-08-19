'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-5 CS 화면은 처리·클레임·이력·답변 양식을 분리한다',()=>{
  const source=read('app/unified-customer-service-center.js');
  for(const label of ['처리 요청','클레임','처리 이력','답변 양식']) assert.match(source,new RegExp(label));
  assert.match(source,/workspace === "TEMPLATES"/);
});

test('13-5/16-4 재고 화면은 판매 중 로켓그로스·재입고·입고·수집 기준을 작업공간으로 분리한다',()=>{
  const source=read('app/unified-inventory-operations-center.js');
  for(const label of ['판매 상품','재입고 점검','입고 미리보기','수집 기준']) assert.match(source,new RegExp(label));
  assert.match(source,/targetQuantity/);
  assert.match(source,/days_of_stock/);
});

test('13-5 정산 화면은 요약·대조·비용 설정과 돈의 흐름을 제공한다',()=>{
  const source=read('app/unified-settlement-operations-center.js');
  for(const label of ['정산 요약','채널 대조','비용 설정','매출에서 정산액까지']) assert.match(source,new RegExp(label));
  assert.match(source,/payout_variance/);
});
