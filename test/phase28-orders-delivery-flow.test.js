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

test('the mobile issue button starts the real shipment flow instead of opening a hidden rail tab',()=>{
  const page=fs.readFileSync(path.join(root,'app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(page,/className="mobileBatchAction"[\s\S]*?onClick=\{primaryAction\}/);
  assert.doesNotMatch(page,/className="mobileBatchAction"[\s\S]*?onClick=\{openActions\}/);
});

test('the orders page hydrates Cafe24 receiver details through the authenticated delivery endpoint',()=>{
  const page=fs.readFileSync(path.join(root,'app','_phase28','pages','orders-page.js'),'utf8');
  assert.match(page,/hydrateCafe24OrderReceivers/);
  assert.match(page,/setReceiverHydration/);
});
