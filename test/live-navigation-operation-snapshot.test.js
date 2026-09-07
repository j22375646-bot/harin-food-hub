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

function useMallId(t,mallId){
  const previous=process.env.CAFE24_MALL_ID;
  process.env.CAFE24_MALL_ID=mallId;
  t.after(()=>{
    if(previous===undefined)delete process.env.CAFE24_MALL_ID;
    else process.env.CAFE24_MALL_ID=previous;
  });
}

function deferredDatabase(){
  const gate=Promise.withResolvers();
  const calls=[];
  const responses=new Map();
  let constructionError=null;
  const db={from(table){
    const call={table,filters:[]};
    calls.push(call);
    if(constructionError)throw constructionError;
    const query={
      select(){return query;},order(){return query;},limit(){return query;},
      eq(key,value){call.filters.push([key,value]);return query;},
      in(){return query;},or(){return query;},gt(){return query;},maybeSingle(){return query;},
      then(resolve,reject){
        return gate.promise.then(()=>responses.get(table)||{data:[],count:0,error:null}).then(resolve,reject);
      }
    };
    return query;
  }};
  return {db,calls,responses,release:gate.resolve,setConstructionError(error){constructionError=error;}};
}

const queriesStarted=()=>new Promise(resolve=>setImmediate(resolve));

test('concurrent navigation reads share one query batch and keep each request timestamp',async t=>{
  useMallId(t,'navigation-test-mall');
  const database=deferredDatabase();
  const times=['2026-09-07T06:00:00.000Z','2026-09-07T06:00:01.000Z','2026-09-07T06:00:02.000Z'];
  const pending=times.map(now=>liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db,now}));
  t.after(database.release);
  await queriesStarted();
  assert.equal(database.calls.length,17,'three overlapping reads should issue one 17-query batch, not 51');
  database.release();
  const results=await Promise.all(pending);
  assert.deepEqual(results.map(result=>result.snapshot.generatedAt),times);
  assert.ok(results.every(result=>result.partial===false));
  assert.deepEqual(results[0].snapshot.badges,results[1].snapshot.badges);
});

test('a completed navigation read is never reused by a later refresh',async t=>{
  useMallId(t,'navigation-test-mall');
  const database=deferredDatabase();
  database.release();
  const first=await liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  database.responses.set('alerts',{data:[{id:'new-alert',status:'OPEN'}]});
  const second=await liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  assert.equal(database.calls.length,34);
  assert.equal(first.snapshot.badges.notifications,0);
  assert.equal(second.snapshot.badges.notifications,1);
});

test('concurrent navigation reads never share data across database clients',async t=>{
  useMallId(t,'navigation-test-mall');
  const firstDb=deferredDatabase();
  const secondDb=deferredDatabase();
  firstDb.responses.set('alerts',{data:[{id:'private-first',status:'OPEN'}]});
  secondDb.responses.set('alerts',{data:[{id:'private-second',status:'OPEN'},{id:'another-second',status:'OPEN'}]});
  const first=liveSnapshot.loadLiveNavigationOperationSnapshot({db:firstDb.db});
  const second=liveSnapshot.loadLiveNavigationOperationSnapshot({db:secondDb.db});
  firstDb.release();secondDb.release();
  const results=await Promise.all([first,second]);
  assert.equal(firstDb.calls.length,17);
  assert.equal(secondDb.calls.length,17);
  assert.deepEqual(results.map(result=>result.snapshot.badges.notifications),[1,2]);
});

test('navigation reads for different Cafe24 malls remain separate even with the same client',async t=>{
  useMallId(t,'first-mall');
  const database=deferredDatabase();
  const first=liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  process.env.CAFE24_MALL_ID='second-mall';
  const second=liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  database.release();
  await Promise.all([first,second]);
  assert.equal(database.calls.length,34);
  assert.deepEqual(database.calls.filter(call=>call.table==='cafe24_oauth_tokens').map(call=>call.filters),[
    [['mall_id','first-mall']],[['mall_id','second-mall']]
  ]);
});

test('partial navigation data stays unknown and is retried after the shared read completes',async t=>{
  useMallId(t,'navigation-test-mall');
  const database=deferredDatabase();
  database.responses.set('alerts',{data:null,error:{code:'CONNECTION_ERROR'}});
  const first=liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  const second=liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  database.release();
  const failed=await Promise.all([first,second]);
  assert.equal(database.calls.length,17);
  assert.ok(failed.every(result=>result.partial&&result.snapshot.badges.notifications===null));
  assert.deepEqual(failed[0].unavailable,['alerts']);
  database.responses.set('alerts',{data:[{id:'recovered',status:'OPEN'}]});
  const recovered=await liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  assert.equal(database.calls.length,34);
  assert.equal(recovered.partial,false);
  assert.equal(recovered.snapshot.badges.notifications,1);
});

test('an unexpected query construction error does not poison future navigation reads',async t=>{
  useMallId(t,'navigation-test-mall');
  const database=deferredDatabase();
  database.setConstructionError(new Error('temporary client failure'));
  const failed=await Promise.allSettled([
    liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db}),
    liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db})
  ]);
  assert.ok(failed.every(result=>result.status==='rejected'&&result.reason.message==='temporary client failure'));
  assert.equal(database.calls.length,1);
  database.setConstructionError(null);
  database.release();
  const recovered=await liveSnapshot.loadLiveNavigationOperationSnapshot({db:database.db});
  assert.equal(recovered.partial,false);
  assert.equal(database.calls.length,18);
});
