'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const liveSnapshot=require('../lib/navigation/live-operation-snapshot.js');

test('live navigation snapshot applies the same open-work boundaries as the hub pages',()=>{
  const snapshot=liveSnapshot.buildLiveNavigationOperationSnapshot({
    generatedAt:'2026-09-02T07:30:00.000Z',
    cafe24Orders:[
      {order_id:'C24-ACTIVE',order_date:'2026-09-02T06:00:00.000Z',payment_status:'N10',paid_amount:30000,raw_data:{order_place_name:'모바일웹'}},
      {order_id:'C24-CANCELLED',order_date:'2026-09-02T05:00:00.000Z',payment_status:'C40',paid_amount:20000,raw_data:{order_place_name:'모바일웹',canceled:'T'}}
    ],
    cafe24OrderItems:[
      {order_id:'C24-ACTIVE',product_name:'활성 상품',quantity:1,status:'N10'},
      {order_id:'C24-CANCELLED',product_name:'취소 상품',quantity:1,status:'C40'}
    ],
    coupangOrders:[
      {shipment_box_id:'SHIP-1',order_id:'CP-SELLER',ordered_at:'2026-09-02T04:00:00.000Z',status:'ACCEPT',gross_amount:18000},
      {shipment_box_id:'SHIP-2',order_id:'CP-RG',ordered_at:'2026-09-02T03:00:00.000Z',status:'ACCEPT',gross_amount:21000}
    ],
    coupangOrderItems:[
      {shipment_box_id:'SHIP-1',order_id:'CP-SELLER',product_name:'판매자배송',quantity:1},
      {shipment_box_id:'SHIP-2',order_id:'CP-RG',product_name:'로켓그로스',quantity:1}
    ],
    coupangRgOrders:[{order_id:'CP-RG'}],
    naverOrders:[{order_id:'NV-DONE',order_date:'2026-09-02T02:00:00.000Z',status:'DELIVERED',paid_amount:15000}],
    naverOrderItems:[{order_id:'NV-DONE',product_order_id:'NV-DONE',product_name:'배송 완료',quantity:1,status:'DELIVERED'}],
    customerServiceRows:[{id:'CS-OPEN',completed:false},{id:'CS-DONE',completed:true}],
    inventoryRows:[
      {vendor_item_id:'RG-LOW',external_sku_id:'RG 저재고',total_orderable_quantity:3,sales_last_30_days:20,stock_status:'LOW'},
      {vendor_item_id:'RG-INACTIVE',external_sku_id:'판매중단',total_orderable_quantity:3,sales_last_30_days:20,item_status:'STOPPED',stock_status:'LOW'}
    ],
    alerts:[{id:'ALERT-OPEN',status:'OPEN'},{id:'ALERT-CLOSED',status:'RESOLVED'}],
    channelConnections:{channels:[
      {platform:'NAVER',status:'READ_READY'},
      {platform:'CAFE24',status:'WRITE_READY'},
      {platform:'COUPANG',status:'READ_READY'}
    ]}
  });

  assert.deepEqual(snapshot.badges,{orders:2,cs:1,inventory:1,notifications:1});
  assert.deepEqual(snapshot.connection,{ready:3,total:3,label:'3개 채널 연결',tone:'ready'});
});

test('live navigation snapshot preserves unknown sources instead of converting failures to zero',()=>{
  const snapshot=liveSnapshot.buildLiveNavigationOperationSnapshot({
    generatedAt:'2026-09-02T07:30:00.000Z',
    availability:{orders:false,customerService:false,inventory:false,alerts:false,connections:false}
  });
  assert.deepEqual(snapshot.badges,{orders:null,cs:null,inventory:null,notifications:null});
  assert.deepEqual(snapshot.connection,{ready:null,total:null,label:'연결 상태 확인',tone:'check'});
});

test('operation snapshot endpoint is authenticated and never cached',()=>{
  const route=fs.readFileSync(path.join(root,'app/api/navigation/operation-snapshot/route.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/loadLiveNavigationOperationSnapshot/);
  assert.match(route,/Cache-Control':'no-store'/);
  assert.match(route,/운영 집계를 불러오지 못했습니다/);
});
