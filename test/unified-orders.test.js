'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const orders=require('../lib/orders/unified-orders.js');

test('maps Cafe24 and Coupang statuses into the five common stages',()=>{
  assert.equal(orders.stageFor('CAFE24','N00'),'PAID');
  assert.equal(orders.stageFor('CAFE24','N21'),'READY_TO_SHIP');
  assert.equal(orders.stageFor('CAFE24','N40'),'DELIVERED');
  assert.equal(orders.stageFor('COUPANG','ACCEPT'),'PAID');
  assert.equal(orders.stageFor('COUPANG','INSTRUCT'),'PREPARING');
  assert.equal(orders.stageFor('COUPANG','DEPARTURE'),'READY_TO_SHIP');
  assert.equal(orders.stageFor('COUPANG','DELIVERING'),'SHIPPING');
  assert.equal(orders.stageFor('COUPANG','FINAL_DELIVERY'),'DELIVERED');
});

test('builds deterministic hub order numbers and keeps both channel orders',()=>{
  const input={
    cafe24Orders:[{order_id:'C-100',order_date:'2026-08-14T01:00:00Z',payment_status:'N10',paid_amount:21000}],
    cafe24OrderItems:[{order_id:'C-100',product_name:'작수차',quantity:2}],
    coupangOrders:[{shipment_box_id:'S-1',order_id:'P-200',ordered_at:'2026-08-14T02:00:00Z',status:'ACCEPT',gross_amount:12000}],
    coupangOrderItems:[{shipment_box_id:'S-1',order_id:'P-200',product_name:'작수차 티백',quantity:1}],
    channelConnections:[{platform:'CAFE24',status:'WRITE_READY'},{platform:'COUPANG',status:'READ_READY'},{platform:'NAVER',status:'SETUP_REQUIRED'}]
  };
  const center=orders.buildUnifiedOrders(input);
  assert.equal(center.orders.length,2);
  assert.match(center.orders[0].hubOrderId,/^HR-CP-[A-F0-9]{8}$/);
  assert.equal(center.orders.find(item=>item.platform==='CAFE24').productName,'작수차');
  assert.equal(center.channels.find(item=>item.platform==='NAVER').status,'SETUP_REQUIRED');
});

test('flags cancellation requests before shipment and filters action rows',()=>{
  const center=orders.buildUnifiedOrders({
    coupangOrders:[{shipment_box_id:'S-1',order_id:'P-200',ordered_at:'2026-08-14T02:00:00Z',status:'DEPARTURE',gross_amount:12000}],
    coupangReturns:[{order_id:'P-200',status:'RETURNS_UNCHECKED'}]
  });
  assert.equal(center.summary.cancellations,1);
  assert.equal(center.orders[0].cancellationRequested,true);
  assert.equal(orders.filterUnifiedOrders(center.orders,{actionRequired:true,platform:'COUPANG'}).length,1);
  assert.equal(orders.filterUnifiedOrders(center.orders,{query:'missing'}).length,0);
});

test('keeps Rocket Growth stored but outside every seller manual stage',()=>{
  const center=orders.buildUnifiedOrders({
    coupangOrders:[
      {shipment_box_id:'S-1',order_id:'P-200',ordered_at:'2026-08-14T02:00:00Z',status:'ACCEPT',gross_amount:12000},
      {shipment_box_id:'RG-S-1',order_id:'RG-300',ordered_at:'2026-08-14T03:00:00Z',status:'ACCEPT',gross_amount:30000}
    ],
    coupangRgOrders:[{order_id:'RG-300',paid_at:'2026-08-14T03:00:00Z',status:'ACCEPT',total_amount:30000}]
  });
  assert.equal(center.orders.length,1);
  assert.equal(center.orders[0].externalOrderId,'P-200');
  assert.equal(center.summary.rocketGrowthStored,1);
  assert.equal(center.stageCounts.PAID,1);
});

test('shows only unresolved claim requests and ignores completed cancellations',()=>{
  const completed=orders.buildUnifiedOrders({
    coupangOrders:[{shipment_box_id:'S-1',order_id:'P-200',status:'DEPARTURE'}],
    coupangReturns:[{order_id:'P-200',status:'RETURNS_COMPLETED'}],
    cafe24Orders:[{order_id:'C-100',raw_data:{canceled:'F',shipping_status:'T'}}]
  });
  assert.equal(completed.summary.cancellations,0);
  assert.equal(completed.orders.every(order=>order.cancellationRequested===false),true);
  assert.equal(orders.isActiveClaimStatus('RETURNS_UNCHECKED'),true);
  assert.equal(orders.isActiveClaimStatus('RETURNS_COMPLETED'),false);
});

test('order export stays authenticated and guards spreadsheet formulas',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','orders','export','route.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/\^\[=\+\\-@\]/);
  assert.match(route,/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
});

test('orders page renders unified center while preserving Coupang action detail',()=>{
  const client=fs.readFileSync(path.join(__dirname,'..','app','dashboard-client.js'),'utf8');
  assert.match(client,/UnifiedOrdersCenter center=\{initialData\.unifiedOrders\}/);
  assert.match(client,/<CoupangOrdersView coupang=\{initialData\.coupang\}\/>/);
});

test('delivery details are authenticated and rendered without a reveal button',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','cafe24','orders','delivery-detail','route.js'),'utf8');
  const center=fs.readFileSync(path.join(__dirname,'..','app','unified-orders-center.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/\/receivers/);
  assert.match(center,/<DeliveryInfo order=\{order\}\/>/);
  assert.match(center,/자동으로 불러오는 중/);
  assert.doesNotMatch(center,/배송정보·연락처 보기/);
});

test('Cafe24 item status drives the live shipping stage and raw payment amount fills older zero columns',()=>{
  const center=orders.buildUnifiedOrders({
    asOf:'2026-08-14T00:00:00Z',
    cafe24Orders:[
      {order_id:'C-READY',order_date:'2026-08-13T01:00:00Z',paid_amount:0,order_price:0,raw_data:{shipping_status:'T',payment_amount:'27000'}},
      {order_id:'C-DONE',order_date:'2026-08-13T02:00:00Z',paid_amount:0,order_price:0,raw_data:{shipping_status:'T',payment_amount:'31000'}}
    ],
    cafe24OrderItems:[
      {order_id:'C-READY',external_item_id:'I-1',product_name:'Tea',option_name:'30 bags',quantity:1,raw_data:{order_status:'N10'}},
      {order_id:'C-DONE',external_item_id:'I-2',product_name:'Tea',option_name:'60 bags',quantity:1,raw_data:{order_status:'N40'}}
    ]
  });
  const ready=center.orders.find(item=>item.externalOrderId==='C-READY');
  const done=center.orders.find(item=>item.externalOrderId==='C-DONE');
  assert.equal(ready.stage,'PREPARING');
  assert.equal(ready.amount,27000);
  assert.equal(done.stage,'DELIVERED');
  assert.equal(done.actionRequired,false);
});

test('Cafe24 open-market mirrors are excluded from the Cafe24 storefront lane',()=>{
  const center=orders.buildUnifiedOrders({
    cafe24Orders:[
      {order_id:'C-NATIVE',order_date:'2026-08-14T01:00:00Z',raw_data:{market_id:'self',payment_amount:'12000'}},
      {order_id:'C-COUPANG-MIRROR',order_date:'2026-08-14T02:00:00Z',raw_data:{market_id:'coupang',payment_amount:'50000'}}
    ],
    cafe24OrderItems:[
      {order_id:'C-NATIVE',external_item_id:'I-1',product_name:'Tea',quantity:1,raw_data:{order_status:'N10'}},
      {order_id:'C-COUPANG-MIRROR',external_item_id:'I-2',product_name:'Tea',quantity:1,raw_data:{order_status:'N10'}}
    ]
  });
  assert.deepEqual(center.orders.map(order=>order.externalOrderId),['C-NATIVE']);
  assert.equal(center.stageCounts.PREPARING,1);
});

test('hourly order collection is scheduled and the manual button is explicit',()=>{
  const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  const center=fs.readFileSync(path.join(__dirname,'..','app','unified-orders-center.js'),'utf8');
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','cron','hourly-orders','route.js'),'utf8');
  const timer=fs.readFileSync(path.join(__dirname,'..','ops','systemd','harin-orders-hourly.timer'),'utf8');
  assert.equal(vercel.crons.some(item=>item.path==='/api/cron/hourly-orders'),false);
  assert.match(timer,/OnCalendar=hourly/);
  assert.match(center,/전체 플랫폼 수동수집/);
  assert.match(route,/CRON_SECRET/);
  assert.match(route,/x-harin-hourly-token/);
  assert.match(route,/ORDER_REALTIME/);
});

test('live work window is separated from cumulative stored history',()=>{
  const center=orders.buildUnifiedOrders({
    asOf:'2026-08-14T00:00:00Z',
    cafe24Orders:[
      {order_id:'CURRENT',order_date:'2026-08-13T01:00:00Z',raw_data:{payment_amount:'10000'}},
      {order_id:'OLD',order_date:'2026-05-15T01:00:00Z',raw_data:{payment_amount:'20000'}}
    ],
    cafe24OrderItems:[
      {order_id:'CURRENT',external_item_id:'I-1',product_name:'Current',quantity:1,raw_data:{order_status:'N10'}},
      {order_id:'OLD',external_item_id:'I-2',product_name:'Old',quantity:1,raw_data:{order_status:'N40'}}
    ]
  });
  assert.equal(center.summary.historyTotal,2);
  assert.equal(center.summary.total,1);
  assert.equal(center.summary.windowDays,30);
  assert.equal(center.orders[0].externalOrderId,'CURRENT');
});

test('old active work stays visible while completed deliveries are limited to 30 days',()=>{
  const center=orders.buildUnifiedOrders({
    asOf:'2026-08-14T00:00:00Z',
    cafe24Orders:[
      {order_id:'OLD-ACTIVE',order_date:'2026-05-15T01:00:00Z'},
      {order_id:'DAY-30-DONE',order_date:'2026-07-16T01:00:00Z'},
      {order_id:'DAY-31-DONE',order_date:'2026-07-15T01:00:00Z'}
    ],
    cafe24OrderItems:[
      {order_id:'OLD-ACTIVE',external_item_id:'I-1',product_name:'Active',raw_data:{order_status:'N10'}},
      {order_id:'DAY-30-DONE',external_item_id:'I-2',product_name:'Done',raw_data:{order_status:'N40'}},
      {order_id:'DAY-31-DONE',external_item_id:'I-3',product_name:'Old done',raw_data:{order_status:'N40'}}
    ]
  });
  assert.deepEqual(center.orders.map(order=>order.externalOrderId).sort(),['DAY-30-DONE','OLD-ACTIVE']);
  assert.equal(center.summary.visibleDefaultTotal,1);
  assert.equal(center.stageCounts.DELIVERED,1);
});

test('15시까지 오늘 주문은 당일출고, 다음 날까지 준비중이면 배송지연이다',()=>{
  const sameDay=orders.fulfillmentTiming({orderedAt:'2026-08-14T14:59:00+09:00',stage:'PREPARING'},new Date('2026-08-14T06:00:00Z'));
  const atCutoff=orders.fulfillmentTiming({orderedAt:'2026-08-14T15:00:00+09:00',stage:'PREPARING'},new Date('2026-08-14T06:01:00Z'));
  const afterCutoff=orders.fulfillmentTiming({orderedAt:'2026-08-14T15:01:00+09:00',stage:'PREPARING'},new Date('2026-08-14T07:00:00Z'));
  const delayed=orders.fulfillmentTiming({orderedAt:'2026-08-13T16:00:00+09:00',stage:'PREPARING'},new Date('2026-08-14T00:00:00Z'));
  assert.equal(sameDay.timingBadge.type,'SAME_DAY');
  assert.equal(atCutoff.timingBadge.type,'SAME_DAY');
  assert.equal(afterCutoff.timingBadge,null);
  assert.equal(delayed.timingBadge.type,'DELAYED');
});

test('live work window uses the Korea business date on a UTC deployment',()=>{
  const center=orders.buildUnifiedOrders({asOf:'2026-08-13T15:30:00Z'});
  assert.equal(center.summary.windowEnd,'2026-08-14');
  assert.equal(center.summary.windowStart,'2026-07-16');
});

test('orders center labels seller delivery and refreshes current channel status',()=>{
  const center=fs.readFileSync(path.join(__dirname,'..','app','unified-orders-center.js'),'utf8');
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','orders','live-refresh','route.js'),'utf8');
  assert.match(center,/판매자배송/);
  assert.match(center,/\/api\/orders\/live-refresh/);
  assert.match(center,/상품명/);
  assert.match(center,/기본 옵션/);
  assert.match(center,/전체 플랫폼 수동수집/);
  assert.match(center,/배송완료는 5단계를 눌렀을 때만 표시됩니다/);
  assert.match(center,/당일출고/);
  assert.match(center,/배송지연/);
  assert.match(center,/orderBadgeGroup/);
  assert.match(center,/orderStatusGroup/);
  assert.match(center,/orderTimingNotice/);
  assert.match(center,/오늘 출고할 주문입니다/);
  assert.doesNotMatch(center,/orderTimingBadge[^\n]*<small>/);
  const css=fs.readFileSync(path.join(__dirname,'..','app','globals.css'),'utf8');
  assert.match(css,/--order-badge-height:32px/);
  assert.match(css,/--order-badge-size:12px/);
  assert.match(css,/data-font-scale="xlarge"[^\n]*--order-badge-height:34px/);
  assert.doesNotMatch(center,/<section className=\{`orderDeliveryInfo/);
  assert.match(route,/ORDER_REALTIME/);
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
});

test('phase 11-3B preserves 11-3A bulk work selection and the postal invoice field',()=>{
  const center=fs.readFileSync(path.join(__dirname,'..','app','unified-orders-center.js'),'utf8');
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','shipping','actions','route.js'),'utf8');
  assert.match(center,/PHASE 11-3B · FIXED IP & SEED-128/);
  assert.match(center,/결제완료·준비중 전체선택/);
  assert.match(center,/bulkEligible=visible\.filter/);
  assert.match(center,/className=\{`orderInvoiceEntry/);
  assert.match(center,/우체국 송장번호/);
  assert.match(center,/replace\(\/\\D\/g,''\)\.slice\(0,13\)/);
  assert.match(center,/useState\('EPOST'\)/);
  assert.match(center,/setActionResults/);
  assert.match(route,/deliveryCompanyCode==='EPOST'/);
  assert.match(route,/\\d\{13\}/);
});

test('registered tracking numbers from channel data are retained in unified orders',()=>{
  const center=orders.buildUnifiedOrders({
    cafe24Orders:[{order_id:'C-TRACKED',order_date:'2026-08-14T01:00:00Z',raw_data:{tracking_no:'1234567890123'}}],
    cafe24OrderItems:[{order_id:'C-TRACKED',external_item_id:'I-1',product_name:'Tea',quantity:1,raw_data:{order_status:'N20'}}],
    coupangOrders:[{order_id:'P-TRACKED',shipment_box_id:'S-1',ordered_at:'2026-08-14T02:00:00Z',status:'INSTRUCT',raw_data:{invoiceNumber:'9876543210987',deliveryCompanyCode:'EPOST'}}]
  });
  const cafe24=center.orders.find(order=>order.externalOrderId==='C-TRACKED');
  const coupang=center.orders.find(order=>order.externalOrderId==='P-TRACKED');
  assert.equal(cafe24.invoiceNumber,'1234567890123');
  assert.equal(coupang.invoiceNumber,'9876543210987');
  assert.equal(coupang.deliveryCompanyCode,'EPOST');
});
