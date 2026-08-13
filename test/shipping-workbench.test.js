'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workbench=require('../lib/shipping/workbench.js');

test('blocks canceled and Rocket Growth orders from seller shipping actions',()=>{
  assert.equal(workbench.canShip({stage:'PAID',cancellationRequested:true}).ok,false);
  assert.equal(workbench.canShip({stage:'PAID',fulfillment:'ROCKET_GROWTH'}).ok,false);
  assert.equal(workbench.canShip({stage:'PAID',platform:'NAVER'}).ok,false);
  assert.equal(workbench.canShip({stage:'PAID',platform:'CAFE24',fulfillment:'SELLER'}).ok,true);
});

test('creates packing instructions from the actual item composition',()=>{
  const instructions=workbench.packagingInstructions({items:[{name:'작수차 티백 2개입'},{name:'사은품 샘플'}]});
  assert.ok(instructions.includes('상품 2종을 각각 수량 확인'));
  assert.ok(instructions.includes('세트 구성품 누락 확인'));
  assert.ok(instructions.includes('사은품 동봉 여부 확인'));
  assert.ok(instructions.includes('식품 포장 밀봉과 유통기한 확인'));
});

test('suggests same-address groups as candidates without automatic merge',()=>{
  const raw={receiver:{name:'홍길동',post_code:'12345',address:'서울시 중구',address2:'101호'}};
  const first=workbench.enrichOrder({hubOrderId:'HR-C24-AAAA0001',platform:'CAFE24',stage:'PAID',fulfillment:'SELLER'},raw);
  const second=workbench.enrichOrder({hubOrderId:'HR-C24-AAAA0002',platform:'CAFE24',stage:'PREPARING',fulfillment:'SELLER'},raw);
  const groups=workbench.groupCandidates([first,second]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].candidateOnly,true);
  assert.deepEqual(groups[0].orderIds,['HR-C24-AAAA0001','HR-C24-AAAA0002']);
  assert.ok(!JSON.stringify(first).includes('홍길동'));
  assert.ok(!JSON.stringify(first).includes('서울시 중구'));
});

test('shipping writes and print output stay authenticated and channel-isolated',()=>{
  const actionRoute=fs.readFileSync(path.join(__dirname,'..','app','api','shipping','actions','route.js'),'utf8');
  const printRoute=fs.readFileSync(path.join(__dirname,'..','app','api','shipping','print','route.js'),'utf8');
  assert.match(actionRoute,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(actionRoute,/operationQueue\.queueOperation/);
  assert.match(actionRoute,/process_status:'prepareproduct'/);
  assert.match(actionRoute,/order\.shippingEligible/);
  assert.match(printRoute,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(printRoute,/window\.print\(\)/);
});
