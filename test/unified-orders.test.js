'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const orders=require('../lib/orders/unified-orders.js');

test('maps Cafe24, Coupang and Naver statuses into the five common stages',()=>{
  assert.equal(orders.stageFor('CAFE24','N00'),'PAID');
  assert.equal(orders.stageFor('CAFE24','N21'),'READY_TO_SHIP');
  assert.equal(orders.stageFor('CAFE24','N40'),'DELIVERED');
  assert.equal(orders.stageFor('COUPANG','ACCEPT'),'PAID');
  assert.equal(orders.stageFor('COUPANG','INSTRUCT'),'PREPARING');
  assert.equal(orders.stageFor('COUPANG','DEPARTURE'),'READY_TO_SHIP');
  assert.equal(orders.stageFor('COUPANG','DELIVERING'),'SHIPPING');
  assert.equal(orders.stageFor('COUPANG','FINAL_DELIVERY'),'DELIVERED');
  assert.equal(orders.stageFor('NAVER','PAYED'),'PAID');
  assert.equal(orders.stageFor('NAVER','PREPARING_PRODUCT'),'PREPARING');
  assert.equal(orders.stageFor('NAVER','DISPATCHED'),'READY_TO_SHIP');
  assert.equal(orders.stageFor('NAVER','DELIVERING'),'SHIPPING');
  assert.equal(orders.stageFor('NAVER','PURCHASE_DECIDED'),'DELIVERED');
});

test('네이버 판매자배송 주문의 옵션과 배송정보를 바로 표시한다',()=>{
  const center=orders.buildUnifiedOrders({
    naverOrders:[{order_id:'N-1',order_date:'2026-08-14T08:00:00+09:00',status:'PREPARING_PRODUCT',paid_amount:24000,receiver_name:'홍길동',receiver_phone:'010-0000-0000',receiver_address:'12345 서울시 1층',shipping_memo:'문 앞'}],
    naverOrderItems:[{product_order_id:'NI-1',order_id:'N-1',product_name:'작두콩차',option_name:'30티백',quantity:2,paid_amount:24000,status:'PREPARING_PRODUCT'}]
  });
  const order=center.orders[0];
  assert.equal(order.platform,'NAVER');
  assert.equal(order.stage,'PREPARING');
  assert.equal(order.items[0].option,'30티백');
  assert.equal(order.receiver.contact,'010-0000-0000');
  assert.equal(order.receiver.message,'문 앞');
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
  const calendar={holidayReady:true,holidayDates:[]};
  const sameDay=orders.fulfillmentTiming({orderedAt:'2026-08-14T14:59:00+09:00',stage:'PREPARING'},new Date('2026-08-14T06:00:00Z'),calendar);
  const atCutoff=orders.fulfillmentTiming({orderedAt:'2026-08-14T15:00:00+09:00',stage:'PREPARING'},new Date('2026-08-14T06:01:00Z'),calendar);
  const afterCutoff=orders.fulfillmentTiming({orderedAt:'2026-08-14T15:01:00+09:00',stage:'PREPARING'},new Date('2026-08-14T07:00:00Z'),calendar);
  const delayed=orders.fulfillmentTiming({orderedAt:'2026-08-13T16:00:00+09:00',stage:'PREPARING'},new Date('2026-08-14T00:00:00Z'),calendar);
  assert.equal(sameDay.timingBadge.type,'SAME_DAY');
  assert.equal(atCutoff.timingBadge.type,'SAME_DAY');
  assert.equal(afterCutoff.timingBadge.type,'SCHEDULED');
  assert.equal(delayed.timingBadge.type,'SAME_DAY');
  assert.equal(delayed.shippingEstimate.plannedShipDate,'2026-08-14');
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
  assert.match(center,/최근 30일 완료 건만 확인/);
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

test('phase 11-9 preserves bulk selection and retry while focusing the postal automation flow',()=>{
  const center=fs.readFileSync(path.join(__dirname,'..','app','unified-orders-center.js'),'utf8');
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','shipping','actions','route.js'),'utf8');
  const transfer=fs.readFileSync(path.join(__dirname,'..','lib','shipping','channel-transfer.js'),'utf8');
  assert.match(center,/선택 주문 출고 작업/);
  assert.match(center,/출고 가능 주문 전체선택/);
  assert.match(center,/bulkEligible=visible\.filter/);
  assert.match(center,/className=\{`orderInvoiceEntry/);
  assert.match(center,/우체국 송장번호/);
  assert.match(center,/replace\(\/\\D\/g,''\)\.slice\(0,13\)/);
  assert.match(center,/POSTAL_COURIER_BY_PLATFORM=Object\.freeze\(\{COUPANG:'EPOST',NAVER:'EPOST',CAFE24:'0012'\}\)/);
  assert.match(center,/setActionResults/);
  assert.match(route,/channelTransfer\.postalTracking/);
  assert.match(transfer,/return expected/);
  assert.match(transfer,/\^\\d\{13\}\$/);
  assert.match(center,/송장 자동발급 \+ 쇼핑몰 등록/);
  assert.match(center,/배송상태 확인/);
  assert.match(center,/postalAutomationFlow/);
  assert.doesNotMatch(center,/<ShippingQaPanel\/>/);
  assert.doesNotMatch(center,/className="orderAdvancedTools"/);
});

test('ePost tracking result advances seller orders without overwriting channel source rows',()=>{
  const hubOrderId=orders.hubOrderId('CAFE24','C-TRACKED');
  const center=orders.buildUnifiedOrders({
    asOf:'2026-08-14T00:00:00Z',
    cafe24Orders:[{order_id:'C-TRACKED',order_date:'2026-08-14T01:00:00Z',raw_data:{tracking_no:'1234567890123'}}],
    cafe24OrderItems:[{order_id:'C-TRACKED',external_item_id:'I-1',product_name:'Tea',quantity:1,raw_data:{order_status:'N20'}}],
    trackingStates:{[hubOrderId]:{status:'SUCCESS',statusCode:'DELIVERED',statusLabel:'배달완료',checkedAt:'2026-08-15T04:00:00Z'}}
  });
  assert.equal(center.orders[0].stage,'DELIVERED');
  assert.equal(center.orders[0].actionRequired,false);
  assert.equal(center.orders[0].shippingEligible,false);
  assert.equal(center.orders[0].tracking.statusCode,'DELIVERED');
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

test('주문 상품 이미지 URL은 안전하게 정규화되고 플랫폼 상품 매칭을 따라간다',()=>{
  const catalog=orders.buildOrderImageCatalog(
    [{external_product_no:'10',raw_data:{small_image:'//img.cafe24.com/tea.jpg'}}],
    [
      {platform:'CAFE24',external_product_id:'10',master_product_id:'MASTER-1',raw_data:{}},
      {platform:'COUPANG',external_product_id:'CP-20',master_product_id:'MASTER-1',raw_data:{}},
      {platform:'NAVER',external_product_id:'NV-30',external_product_name:'2026년 국내산 하린식품 작두콩차 36g',raw_data:{originProductNo:'ORIGIN-30',representativeImage:{url:'https://shop-phinf.pstatic.net/naver.jpg'}}}
    ]
  );
  const cafe=orders.attachOrderImages([{external_product_no:'10',product_name:'작두콩차'}],'CAFE24','external_product_no',catalog);
  const coupang=orders.attachOrderImages([{seller_product_id:'CP-20',product_name:'작두콩차'}],'COUPANG','seller_product_id',catalog);
  const naver=orders.attachOrderImages([{product_id:'NV-30',product_name:'작두콩차'}],'NAVER','product_id',catalog);
  assert.equal(cafe[0].image_url,'https://img.cafe24.com/tea.jpg');
  assert.equal(coupang[0].image_url,'https://img.cafe24.com/tea.jpg');
  assert.equal(naver[0].image_url,'https://shop-phinf.pstatic.net/naver.jpg');
  const naverOrigin=orders.attachOrderImages([{product_id:'DIFFERENT-ID',original_product_id:'ORIGIN-30',product_name:'다른 이름'}],'NAVER','product_id',catalog);
  const naverName=orders.attachOrderImages([{product_id:'UNKNOWN',product_name:'2026년 국내산 하린식품 작두콩차 36g, 3개'}],'NAVER','product_id',catalog);
  assert.equal(naverOrigin[0].image_url,'https://shop-phinf.pstatic.net/naver.jpg');
  assert.equal(naverName[0].image_url,'https://shop-phinf.pstatic.net/naver.jpg');
  const center=orders.buildUnifiedOrders({
    cafe24Orders:[{order_id:'IMG-1'}],
    cafe24OrderItems:[{order_id:'IMG-1',product_name:'작두콩차',quantity:1,image_url:cafe[0].image_url}]
  });
  assert.equal(center.orders[0].items[0].imageUrl,'https://img.cafe24.com/tea.jpg');
  assert.equal(orders.safeProductImage('javascript:alert(1)'),'');
  assert.equal(orders.productImageFromRaw({images:[{cdnPath:'//image10.coupangcdn.com/tea.jpg'}]}),'https://image10.coupangcdn.com/tea.jpg');
});

test('registered Cafe24 invoices wait for real ePost movement before entering shipping',()=>{
  const hubOrderId=orders.hubOrderId('CAFE24','C-WAITING');
  const base={
    asOf:'2026-08-17T00:00:00Z',
    cafe24Orders:[{order_id:'C-WAITING',order_date:'2026-08-17T01:00:00Z',raw_data:{tracking_no:'1234567890123'}}],
    cafe24OrderItems:[{order_id:'C-WAITING',external_item_id:'I-1',product_name:'Tea',quantity:1,raw_data:{order_status:'N22'}}]
  };
  const before=orders.buildUnifiedOrders({...base,trackingStates:{[hubOrderId]:{status:'SUCCESS',statusCode:'NOT_FOUND',statusLabel:'우체국 접수 확인 전'}}});
  const accepted=orders.buildUnifiedOrders({...base,trackingStates:{[hubOrderId]:{status:'SUCCESS',statusCode:'ACCEPTED',statusLabel:'우체국 접수중'}}});
  const moving=orders.buildUnifiedOrders({...base,trackingStates:{[hubOrderId]:{status:'SUCCESS',statusCode:'IN_TRANSIT',statusLabel:'배송중'}}});
  assert.equal(before.orders[0].stage,'WAITING_FOR_CARRIER');
  assert.equal(accepted.orders[0].stage,'WAITING_FOR_CARRIER');
  assert.equal(before.orders[0].shippingEligible,false);
  assert.equal(moving.orders[0].stage,'SHIPPING');
});
