const test=require('node:test');
const assert=require('node:assert/strict');
const unified=require('../lib/orders/unified-orders.js');
const calendar=require('../lib/calendar/calendar-center.js');
const adapter=require('../lib/ui/phase28-adapters/orders.js');
const readDatabase=require('./helpers/orders-audit-db.js');

test('failed invoice-history reads block Coupang issuance instead of treating history as empty',async()=>{
  const db=readDatabase({coupang_orders:[{order_id:'ORDER-1',shipment_box_id:'BOX-A',status:'ACCEPT',ordered_at:new Date().toISOString()}]},(table,filters)=>table==='coupang_operation_requests'&&filters.operation_type==='EPOST_LIVE_ISSUE'?{code:'TIMEOUT'}:null);
  const center=await unified.loadUnifiedOrders({db});
  assert.equal(center.orders[0].shippingEligible,false);
  assert.equal(center.orders[0].shippingHistoryStatus,'CHECK_REQUIRED');
});

test('failed invoice-history reads block Cafe24 postal issuance and leave Naver outside postal selection',async()=>{
  const db=readDatabase({cafe24_orders:[{order_id:'C1',order_date:new Date().toISOString(),payment_status:'PAID',paid_amount:10000}],naver_commerce_orders:[{order_id:'N1',order_date:new Date().toISOString(),status:'PAYED',paid_amount:10000}]},(table,filters)=>table==='coupang_operation_requests'&&filters.operation_type==='EPOST_LIVE_ISSUE'?{code:'TIMEOUT'}:null);
  const center=await unified.loadUnifiedOrders({db});
  const cafe24=center.orders.find(order=>order.platform==='CAFE24');
  assert.equal(cafe24.shippingEligible,false);
  assert.equal(cafe24.shippingHistoryStatus,'CHECK_REQUIRED');
  const naver=center.orders.find(order=>order.platform==='NAVER');
  assert.equal(naver.shippingEligible,false);
  assert.match(naver.shippingBlockedReason,/네이버에서 송장을 발급/);
});

test('legacy pending invoice beyond the database row cap remains an issuance lock',async()=>{
  const jobs=Array.from({length:1000},(_,i)=>({id:`job-${i}`,operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:`OTHER-${i}`,status:'PENDING'}));
  jobs.push({id:'legacy-job',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-CP-C1484BA5',status:'PENDING'});
  const center=await unified.loadUnifiedOrders({db:readDatabase({coupang_orders:[{order_id:'ORDER-1',shipment_box_id:'BOX-A',status:'ACCEPT',ordered_at:new Date().toISOString()}],coupang_operation_requests:jobs})});
  assert.equal(center.orders[0].shippingEligible,false);
  assert.match(center.orders[0].shippingBlockedReason,/진행 중/);
});

test('split shipment boxes retain distinct executable targets and reject ambiguous legacy IDs',()=>{
  const center=unified.buildUnifiedOrders({asOf:'2026-09-07T00:00:00Z',coupangOrders:['BOX-A','BOX-B'].map(shipment_box_id=>({order_id:'ORDER-1',shipment_box_id,status:'ACCEPT',ordered_at:'2026-09-06T00:00:00Z'}))});
  assert.equal(new Set(center.orders.map(row=>row.hubOrderId)).size,2);
  const legacy=unified.hubOrderId('COUPANG','ORDER-1');
  assert.throws(()=>unified.resolveOrderTarget(center.orders,legacy),{code:'AMBIGUOUS_ORDER_TARGET'});
  assert.equal(unified.resolveOrderTarget(center.orders,center.orders[0].hubOrderId).shipmentId,center.orders[0].shipmentId);
  assert.throws(()=>unified.resolveOrderTarget([center.orders[0]],legacy),{code:'AMBIGUOUS_ORDER_TARGET'});
  const single=unified.buildUnifiedOrders({asOf:'2026-09-07',coupangOrders:[{order_id:'ORDER-1',shipment_box_id:'BOX-A',status:'ACCEPT',ordered_at:'2026-09-06'}]});
  assert.equal(unified.resolveOrderTarget(single.orders,legacy).shipmentId,'BOX-A');
});

test('database row caps do not hide the 1001st active order or its item',async()=>{
  const records=Array.from({length:1201},(_,index)=>({order_id:`C-${index}`,order_date:'2026-09-06',payment_status:'PAID',paid_amount:10000,raw_data:{}}));
  const tables={cafe24_orders:records,cafe24_order_items:[{order_id:'C-1200',external_item_id:'item-last',product_name:'마지막 주문 상품',quantity:1}]};
  const db={from(table){
    let start=0,end=999;
    const query={then(resolve){return Promise.resolve({data:(tables[table]||[]).slice(start,end+1),error:null}).then(resolve);},range(a,b){start=a;end=b;return query;}};
    for(const method of ['select','order','eq','in','limit','neq','gte','lt'])query[method]=()=>query;
    return query;
  }};
  const center=await unified.loadUnifiedOrders({db});
  assert.equal(center.orders.length,1201);
  assert.equal(center.orders.find(order=>order.externalOrderId==='C-1200').productName,'마지막 주문 상품');
});

test('legacy invoice history is reused only for one unambiguous shipment and otherwise blocks issuance',()=>{
  const legacy=unified.hubOrderId('COUPANG','ORDER-1');
  const row=shipment_box_id=>({order_id:'ORDER-1',shipment_box_id,status:'ACCEPT',ordered_at:'2026-09-06'});
  const input={asOf:'2026-09-07',successfulIssues:new Map([[legacy,{invoiceNumber:'1234567890123'}]])};
  assert.equal(unified.buildUnifiedOrders({...input,coupangOrders:[row('A')]}).orders[0].issuedInvoiceNumber,'1234567890123');
  const split=unified.buildUnifiedOrders({...input,coupangOrders:[row('A'),row('B')]}).orders;
  assert.ok(split.every(order=>!order.shippingEligible&&order.legacyHistoryAmbiguous));
});

test('bounded order pages expose order 61 and 201 and reject stale continuations',()=>{
  const orders=Array.from({length:221},(_,index)=>({hubOrderId:`order-${String(index).padStart(3,'0')}`,platform:'CAFE24',stage:'PAID',shippingEligible:true,amount:10000,timingBadge:index===220?{type:'DELAYED'}:null}));
  const received=[];
  let offset=0,snapshot;
  do{
    const page=adapter.buildOrderPage(orders,[],{stage:'ACTIVE',offset,limit:20,snapshot});
    assert.ok(page.orders.length<=20);
    received.push(...page.orders.map(row=>row.hubOrderId));
    snapshot=page.snapshot;offset=page.nextOffset;
  }while(offset!==null);
  assert.equal(received.length,221);
  assert.equal(new Set(received).size,221);
  assert.ok(received.includes('order-060')&&received.includes('order-200'));
  assert.equal(adapter.buildOrderPage(orders,[],{stage:'ACTIVE',delayOnly:true}).orders[0].hubOrderId,'order-220');
  assert.throws(()=>adapter.buildOrderPage(orders.slice(1),[],{stage:'ACTIVE',offset:20,snapshot}),{code:'ORDERS_SNAPSHOT_CHANGED'});
});

test('calendar revision changes when an older event is deleted and ignores row order',()=>{
  const old={id:'old',updatedAt:'2026-09-01'},latest={id:'latest',updatedAt:'2026-09-07'};
  assert.notEqual(calendar.eventRevision([old,latest]),calendar.eventRevision([latest]));
  assert.equal(calendar.eventRevision([old,latest]),calendar.eventRevision([latest,old]));
  assert.notEqual(calendar.eventRevision([old,latest]),calendar.eventRevision([{...old,updatedAt:'2026-09-02'},latest]));
});

test('Cafe24 gift basis uses actual payment including zero and never nominal order price',()=>{
  for(const [paid_amount,raw_data,want] of [[0,{actual_payment_amount:'40000'},40000],[60000,{actual_payment_amount:0},0],[0,{},0],[null,{},null],[60000,{actual_order_amount:{payment_amount:30000}},30000]]){
    const result=unified.buildUnifiedOrders({asOf:'2026-09-07',cafe24Orders:[{order_id:'C1',order_date:'2026-09-06',payment_status:'PAID',order_price:60000,paid_amount,raw_data}]});
    assert.equal(result.orders[0].amount,want);
  }
});

test('gift thresholds use paid boundaries and keep missing payment unresolved',()=>{
  const events=[{id:'gift',type:'EVENT',title:'행사',date:'2026-09-01',endDate:'2026-09-30',giftTiers:[{minimumAmount:50000,maximumAmount:null,giftName:'사은품',quantity:1}]}];
  for(const [amount,required,status] of [[49999,false,'READY'],[50000,true,'READY'],[0,false,'READY'],[null,false,'CHECK_REQUIRED']]){
    const order=adapter.buildOrderPage([{hubOrderId:'C1',stage:'PAID',platform:'CAFE24',orderedAt:'2026-09-07',amount}],events).orders[0];
    assert.equal(order.giftRequired,required);
    assert.equal(order.giftEligibilityStatus,status);
  }
});
