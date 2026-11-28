'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const unified=require('../lib/orders/unified-orders.js');
const readDatabase=require('./helpers/orders-audit-db.js');

const PRODUCT_TABLES=['cafe24_products','channel_products','coupang_products','coupang_product_items'];
const T0=new Date('2026-11-28T03:00:00.000Z');
const minutes=n=>new Date(T0.getTime()+n*60000);

function fixture(){
  const served=[];
  const tables={
    coupang_orders:[{order_id:'C1',shipment_box_id:'B1',status:'ACCEPT',ordered_at:'2026-11-27T01:00:00.000Z',raw_data:{}}],
    coupang_order_items:[{shipment_box_id:'B1',order_id:'C1',seller_product_id:'SP1',product_name:'작두콩차',quantity:1,raw_data:{}}],
    coupang_products:[{seller_product_id:'SP1',product_id:'P1',product_name:'작두콩차',raw_data:{images:[{imageType:'REPRESENTATION',url:'https://img.example/sp1.jpg'}]}}]
  };
  let fail=false;
  const db=readDatabase(tables,table=>fail&&table==='coupang_products'?{code:'TIMEOUT'}:null,{onServe(table){served.push(table);}});
  return {db,tables,productReads:()=>served.filter(table=>PRODUCT_TABLES.includes(table)).length,setFail(value){fail=value;}};
}

const image=center=>center.orders.find(order=>order.externalOrderId==='C1').items[0].imageUrl;

test('product catalog rows are reused for ten minutes on the same database client',async()=>{
  const f=fixture();
  const first=await unified.loadUnifiedOrders({db:f.db,now:T0});
  const readsAfterFirst=f.productReads();
  assert.ok(readsAfterFirst>0);
  const second=await unified.loadUnifiedOrders({db:f.db,now:minutes(9)});
  assert.equal(f.productReads(),readsAfterFirst);
  assert.equal(image(first),'https://img.example/sp1.jpg');
  assert.equal(image(second),'https://img.example/sp1.jpg');
});

test('product catalog is read again once the ten minutes have passed',async()=>{
  const f=fixture();
  await unified.loadUnifiedOrders({db:f.db,now:T0});
  const readsAfterFirst=f.productReads();
  f.tables.coupang_products[0].raw_data.images[0].url='https://img.example/new.jpg';
  const later=await unified.loadUnifiedOrders({db:f.db,now:minutes(11)});
  assert.ok(f.productReads()>readsAfterFirst);
  assert.equal(image(later),'https://img.example/new.jpg');
});

test('a failed product read is never cached',async()=>{
  const f=fixture();
  f.setFail(true);
  const broken=await unified.loadUnifiedOrders({db:f.db,now:T0});
  assert.equal(image(broken),'');
  f.setFail(false);
  const healed=await unified.loadUnifiedOrders({db:f.db,now:minutes(1)});
  assert.equal(image(healed),'https://img.example/sp1.jpg');
});

test('separate database clients never share cached products',async()=>{
  const a=fixture(),b=fixture();
  await unified.loadUnifiedOrders({db:a.db,now:T0});
  await unified.loadUnifiedOrders({db:b.db,now:minutes(1)});
  assert.ok(b.productReads()>0);
});
