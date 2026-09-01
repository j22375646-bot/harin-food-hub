'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('Cafe24 active orders load authenticated receiver details without changing other channels',async()=>{
  const delivery=require('../lib/ui/phase28-orders-delivery.js');
  const calls=[];
  const orders=[
    {hubOrderId:'HR-C24-ONE',externalOrderId:'20260831-1',platform:'CAFE24',selectionEligible:true,receiver:{}},
    {hubOrderId:'HR-NV-TWO',externalOrderId:'N-2',platform:'NAVER',selectionEligible:false,receiver:{name:'네이버 수취인'}}
  ];
  const hydrated=await delivery.hydrateCafe24OrderReceivers(orders,async url=>{
    calls.push(url);
    return {ok:true,json:async()=>({ok:true,receiver:{name:'Cafe24 수취인',contact:'01012345678',postCode:'12345',address:'서울시',addressDetail:'101호',message:'문 앞'}})};
  });

  assert.deepEqual(calls,['/api/cafe24/orders/delivery-detail?orderId=20260831-1']);
  assert.equal(hydrated[0].receiver.address,'서울시');
  assert.equal(hydrated[0].receiver.addressDetail,'101호');
  assert.equal(hydrated[1],orders[1]);
});

test('Coupang active orders queue and poll the fixed-IP detail before showing receiver details',async()=>{
  const delivery=require('../lib/ui/phase28-orders-delivery.js');
  const calls=[];
  const source=[{
    hubOrderId:'HR-CP-ONE',externalOrderId:'9001',shipmentId:'853138000000000001',
    platform:'COUPANG',selectionEligible:true,receiver:{}
  }];
  const hydrated=await delivery.hydrateOrderReceivers(source,async url=>{
    calls.push(url);
    if(url.startsWith('/api/coupang/orders/detail'))return {
      ok:true,status:202,json:async()=>({ok:true,request:{id:'detail-1'}})
    };
    if(calls.filter(value=>value==='/api/coupang/operations/detail-1').length===1)return {
      ok:true,status:202,json:async()=>({ok:true,pending:true})
    };
    return {ok:true,status:200,json:async()=>({ok:true,order:{receiver:{
      name:'쿠팡 수취인',safeNumber:'050700000000',postCode:'12345',address:'서울시',addressDetail:'101호',message:'문 앞'
    }}})};
  },async()=>{});

  assert.deepEqual(calls,[
    '/api/coupang/orders/detail?shipmentBoxId=853138000000000001',
    '/api/coupang/operations/detail-1',
    '/api/coupang/operations/detail-1'
  ]);
  assert.deepEqual(hydrated[0].receiver,{
    name:'쿠팡 수취인',contact:'050700000000',postCode:'12345',address:'서울시',addressDetail:'101호',message:'문 앞'
  });
});

test('the mobile issue button starts the real shipment flow instead of opening a hidden rail tab',()=>{
  const page=fs.readFileSync(path.join(root,'app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(page,/className="mobileBatchAction"[\s\S]*?onClick=\{primaryAction\}/);
  assert.doesNotMatch(page,/className="mobileBatchAction"[\s\S]*?onClick=\{openActions\}/);
});

test('the orders page hydrates Cafe24 and Coupang receiver details through authenticated delivery endpoints',()=>{
  const page=fs.readFileSync(path.join(root,'app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(page,/hydrateOrderReceivers/);
  assert.match(page,/setReceiverHydration/);
});

test('successful invoice registration starts tracking and live rail movement keeps refreshing',()=>{
  const page=fs.readFileSync(path.join(root,'app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(page,/const completedIds=settled\.filter\(item=>item\.status==='SUCCESS'\)/);
  assert.match(page,/queueAndPollTracking\(completedIds,\{silent:true\}\)/);
  assert.match(page,/fetch\('\/api\/shipping\/tracking',\{method:'POST'/);
  assert.match(page,/fetch\('\/api\/shipping\/tracking',\{cache:'no-store'\}\)/);
  assert.match(page,/window\.setInterval\(run,60000\)/);
});
