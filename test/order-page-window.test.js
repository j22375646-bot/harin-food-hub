const test=require('node:test');
const assert=require('node:assert/strict');
const {loadOrderPageWindow,revalidationDepth}=require('../lib/ui/order-page-window.js');
const {buildOrderPage}=require('../lib/ui/phase28-adapters/orders.js');

test('background revalidation retains all 83 expanded orders instead of replacing them with page one',async()=>{
  const orders=Array.from({length:83},(_,i)=>({hubOrderId:`order-${String(i).padStart(3,'0')}`,stage:'DELIVERED',platform:'CAFE24',amount:10000}));
  const requestPage=async params=>({ok:true,...buildOrderPage(orders,[],{stage:params.get('stage'),offset:params.get('offset'),snapshot:params.get('snapshot')})});
  const refreshed=await loadOrderPageWindow({query:'stage=COMPLETED',minimumRows:83,requestPage});
  assert.equal(refreshed.orders.length,83);
  assert.equal(refreshed.nextOffset,null);
  assert.equal(refreshed.orders[82].hubOrderId,'order-082');
});

test('repeated server-model refreshes preserve a 221-row window while changing filters resets to page one',async()=>{
  const orders=Array.from({length:221},(_,i)=>({hubOrderId:`order-${i}`,stage:'DELIVERED',platform:'CAFE24',amount:10000}));
  const requestPage=async params=>buildOrderPage(orders,[],{stage:params.get('stage'),offset:params.get('offset'),snapshot:params.get('snapshot')});
  let depth=221;
  for(let refresh=0;refresh<3;refresh++){
    const result=await loadOrderPageWindow({query:'stage=COMPLETED',minimumRows:revalidationDepth('COMPLETED/ALL','COMPLETED/ALL',depth),requestPage});
    depth=result.orders.length;
    assert.equal(depth,221);
    assert.equal(result.nextOffset,null);
  }
  const newFilter=await loadOrderPageWindow({query:'stage=COMPLETED',minimumRows:revalidationDepth('COMPLETED/ALL','COMPLETED/CAFE24',depth),requestPage});
  assert.equal(newFilter.orders.length,20);
  assert.equal(newFilter.nextOffset,20);
});

test('a snapshot change during window revalidation rejects the whole replacement',async()=>{
  let orders=Array.from({length:83},(_,i)=>({hubOrderId:`order-${i}`,stage:'DELIVERED',platform:'CAFE24',amount:10000}));
  const requestPage=async params=>{
    const result=buildOrderPage(orders,[],{stage:params.get('stage'),offset:params.get('offset'),snapshot:params.get('snapshot')});
    orders=orders.slice(1);
    return result;
  };
  await assert.rejects(loadOrderPageWindow({query:'stage=COMPLETED',minimumRows:83,requestPage}),{code:'ORDERS_SNAPSHOT_CHANGED'});
});
