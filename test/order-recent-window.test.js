'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const unified=require('../lib/orders/unified-orders.js');
const readDatabase=require('./helpers/orders-audit-db.js');

const NOW=new Date('2026-11-28T03:00:00.000Z');
const RECENT='2026-11-25T01:00:00.000Z';
const OLD='2026-11-01T01:00:00.000Z';

function servedRows(){
  const served={};
  return {served,onServe(table,rows){served[table]=(served[table]||[]).concat(rows);}};
}

function ids(center,platform){return center.orders.filter(order=>order.platform===platform).map(order=>order.externalOrderId).sort();}

test('Coupang loads recent orders plus older unfinished ones, never older delivered or cancelled ones',async()=>{
  const db=readDatabase({
    coupang_orders:[
      {order_id:'C-RECENT-DONE',shipment_box_id:'B1',status:'FINAL_DELIVERY',ordered_at:RECENT,raw_data:{}},
      {order_id:'C-OLD-OPEN',shipment_box_id:'B2',status:'INSTRUCT',ordered_at:OLD,raw_data:{}},
      {order_id:'C-OLD-DONE',shipment_box_id:'B3',status:'FINAL_DELIVERY',ordered_at:OLD,raw_data:{}},
      {order_id:'C-OLD-CANCEL',shipment_box_id:'B4',status:'CANCELED',ordered_at:OLD,raw_data:{}}
    ]
  });
  const center=await unified.loadUnifiedOrders({db,now:NOW});
  assert.deepEqual(ids(center,'COUPANG'),['C-OLD-OPEN','C-RECENT-DONE']);
});

test('Naver keeps an older order open while any of its product orders is still unfinished',async()=>{
  const db=readDatabase({
    naver_commerce_orders:[
      {order_id:'N-RECENT',order_date:RECENT,status:'DELIVERED',paid_amount:1000},
      {order_id:'N-OLD-OPEN',order_date:OLD,status:'PAYED',paid_amount:1000},
      {order_id:'N-OLD-MIXED',order_date:OLD,status:'DELIVERED',paid_amount:1000},
      {order_id:'N-OLD-DONE',order_date:OLD,status:'PURCHASE_DECIDED',paid_amount:1000}
    ],
    naver_commerce_order_items:[
      {product_order_id:'P1',order_id:'N-OLD-MIXED',status:'DELIVERED',product_name:'A',quantity:1},
      {product_order_id:'P2',order_id:'N-OLD-MIXED',status:'PREPARING_PRODUCT',product_name:'B',quantity:1},
      {product_order_id:'P3',order_id:'N-OLD-DONE',status:'PURCHASE_DECIDED',product_name:'C',quantity:1}
    ]
  });
  const center=await unified.loadUnifiedOrders({db,now:NOW});
  assert.deepEqual(ids(center,'NAVER'),['N-OLD-MIXED','N-OLD-OPEN','N-RECENT']);
});

test('Cafe24 judges older orders by their item status and skips finished ones',async()=>{
  const db=readDatabase({
    cafe24_orders:[
      {order_id:'S-RECENT',order_date:RECENT,payment_status:'PAID',paid_amount:1000,raw_data:{}},
      {order_id:'S-OLD-OPEN',order_date:OLD,payment_status:'PAID',paid_amount:1000,raw_data:{}},
      {order_id:'S-OLD-DONE',order_date:OLD,payment_status:'PAID',paid_amount:1000,raw_data:{}},
      {order_id:'S-OLD-CANCEL',order_date:OLD,payment_status:'PAID',paid_amount:1000,raw_data:{}}
    ],
    cafe24_order_items:[
      {order_id:'S-RECENT',external_item_id:'I1',product_name:'A',quantity:1,raw_data:{order_status:'N40'}},
      {order_id:'S-OLD-OPEN',external_item_id:'I2',product_name:'B',quantity:1,raw_data:{order_status:'N20'}},
      {order_id:'S-OLD-DONE',external_item_id:'I3',product_name:'C',quantity:1,raw_data:{order_status:'N40'}},
      {order_id:'S-OLD-CANCEL',external_item_id:'I4',product_name:'D',quantity:1,raw_data:{order_status:'C40'}}
    ]
  });
  const center=await unified.loadUnifiedOrders({db,now:NOW});
  assert.deepEqual(ids(center,'CAFE24'),['S-OLD-OPEN','S-RECENT']);
  assert.equal(center.orders.find(order=>order.externalOrderId==='S-OLD-OPEN').productName,'B');
});

test('heavy item and order-detail rows are read only for the orders in the window',async()=>{
  const {served,onServe}=servedRows();
  const db=readDatabase({
    coupang_orders:[
      {order_id:'C-NEW',shipment_box_id:'B-NEW',status:'ACCEPT',ordered_at:RECENT,raw_data:{}},
      {order_id:'C-OLD',shipment_box_id:'B-OLD',status:'FINAL_DELIVERY',ordered_at:OLD,raw_data:{}}
    ],
    coupang_order_items:[
      {shipment_box_id:'B-NEW',order_id:'C-NEW',product_name:'새 상품',quantity:1,raw_data:{}},
      {shipment_box_id:'B-OLD',order_id:'C-OLD',product_name:'옛 상품',quantity:1,raw_data:{big:'x'.repeat(1000)}}
    ],
    coupang_operation_requests:[
      {operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'B-NEW',status:'CANCELLED',error_message:'Order has been cancelled or returned',created_at:RECENT},
      {operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'B-OLD',status:'SUCCESS',result_json:{big:'x'.repeat(1000)},created_at:OLD}
    ]
  },()=>null,{onServe});
  const center=await unified.loadUnifiedOrders({db,now:NOW});
  assert.deepEqual((served.coupang_order_items||[]).map(row=>row.shipment_box_id),['B-NEW']);
  assert.ok(!(served.coupang_operation_requests||[]).some(row=>row.target_id==='B-OLD'));
  // Cancellation evidence for an order inside the window still applies.
  assert.equal(center.orders.find(order=>order.externalOrderId==='C-NEW').stage,'CANCELLED');
});

test('an explicit since date widens the window for searches and exports',async()=>{
  const db=readDatabase({
    coupang_orders:[{order_id:'C-OLD-DONE',shipment_box_id:'B3',status:'FINAL_DELIVERY',ordered_at:OLD,raw_data:{}}]
  });
  const center=await unified.loadUnifiedOrders({db,now:NOW,since:'2026-10-30'});
  assert.deepEqual(ids(center,'COUPANG'),['C-OLD-DONE']);
});

test('legacy export route reads back to its requested start date',async()=>{
  const {pathToFileURL}=require('node:url'),path=require('node:path');
  const auth=require('../lib/dashboard-auth.js'),supabase=require('../lib/cafe24/supabase.js');
  const oldSecret=process.env.DASHBOARD_SESSION_SECRET,get=supabase.getSupabase;
  process.env.DASHBOARD_SESSION_SECRET='test-only-order-window-export';
  // Delivered history stays visible for 30 days; 20 days is outside the 7-day read window.
  const orderedAt=new Date(Date.now()-20*86400000).toISOString();
  const start=new Date(Date.now()-21*86400000).toISOString().slice(0,10);
  supabase.getSupabase=()=>readDatabase({coupang_orders:[{order_id:'C-OLDER',shipment_box_id:'B9',status:'FINAL_DELIVERY',ordered_at:orderedAt,raw_data:{}}]});
  try{
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/orders/export/route.js')));
    const response=await route.GET(new Request(`http://localhost/api/orders/export?start=${start}`,{headers:{cookie:`${auth.COOKIE_NAME}=${auth.createSessionToken()}`}}));
    assert.equal(response.status,200);
    const ExcelJS=require('exceljs');const book=new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
    assert.equal(String(book.worksheets[0].getRow(2).getCell(3).value),'C-OLDER');
  }finally{supabase.getSupabase=get;if(oldSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=oldSecret;}
});
