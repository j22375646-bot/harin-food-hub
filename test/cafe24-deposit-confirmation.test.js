'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {depositState,confirmDeposit}=require('../lib/cafe24/deposit-confirmation.js');
const orderId='20261125-0000001';
const unpaid={order_id:orderId,currency:'KRW',paid:'F',payment_method:['cash'],canceled:'F',
  actual_order_amount:{total_amount_due:'20000.00',payment_amount:'0.00'},items:[{order_status:'N00'}]};
const paid={...unpaid,paid:'T',items:[{order_status:'N10'}]};

test('uses amount due and accepts only a pure, uncancelled bank deposit awaiting payment',()=>{
  assert.deepEqual(depositState(unpaid,orderId),{status:'READY',orderId,amount:20000});
  assert.deepEqual(depositState(paid,orderId),{status:'PAID'});
  for(const patch of [{payment_method:['cash','card']},{canceled:'T'},{items:[{order_status:'C00'}]},{items:[]},{actual_order_amount:{total_amount_due:'0'}},{order_place_id:'COUPANG'}]){
    assert.notEqual(depositState({...unpaid,...patch},orderId).status,'READY');
  }
});

test('enforces the reviewed amount and current authorization before reserving a submission',async()=>{
  const unused=()=>assert.fail('should not be invoked');
  const base={orderId,amount:100,actorId:'test',read:async()=>unpaid,reserve:unused,write:unused,save:unused,reauthorize:unused};
  assert.equal((await confirmDeposit(base)).status,'AMOUNT_CHANGED');
  await assert.rejects(confirmDeposit({...base,amount:20000,reauthorize:async()=>{throw Error('denied');}}),/denied/);
});

test('a concurrent or lost-response request can only transmit once and reconcile by reading',async()=>{
  let current=unpaid,claimed=false,writes=0,saves=0;
  const input={orderId,amount:20000,actorId:'actor',reauthorize:async()=>{},read:async()=>current,
    reserve:async()=>{if(claimed)return false;claimed=true;return true;},
    write:async()=>{writes++;throw Error('response lost');},save:async()=>{saves++;}};
  const results=await Promise.all([confirmDeposit(input),confirmDeposit(input)]);
  assert.deepEqual(results.map(r=>r.status),['CHECK_REQUIRED','CHECK_REQUIRED']);
  assert.equal(writes,1);
  current=paid;
  assert.equal((await confirmDeposit(input)).status,'PAID');
  assert.equal(writes,1);
  assert.equal(saves,1);
});
