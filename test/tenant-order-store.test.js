'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const {createTenantOrderStore}=require('../lib/tenancy/order-store.js');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const C='20000000-0000-4000-8000-000000000001',D='20000000-0000-4000-8000-000000000002';
let db,store;
async function context(tenantId,role='OWNER'){
 return resolveTenantContext({requestedTenantId:tenantId,session:{id:'session',userId:'user',expiresAt:'2099-01-01T00:00:00.000Z'}},{now:()=>new Date('2026-09-09'),findMembership:async()=>({tenantId,userId:'user',status:'ACTIVE',role,version:1})});
}
const row=(productName,extra={})=>({connectionId:C,externalOrderId:'same-order',productName,paidAmount:30000,status:'PAID',sourceUpdatedAt:'2026-09-09T00:00:00.000Z',...extra});
test.before(async()=>{
 db=new PGlite();
 await db.exec('create schema moaon_control; create table moaon_control.tenants(id uuid primary key);');
 await db.query('insert into moaon_control.tenants values ($1),($2)',[A,B]);
 await db.exec(await fs.readFile(path.join(__dirname,'../lib/tenancy/sql/order-ledger.sql'),'utf8'));
 await db.query("insert into moaon_data.connections(tenant_id,id,provider,status) values($1,$3,'CAFE24','ACTIVE'),($2,$3,'CAFE24','ACTIVE'),($2,$4,'COUPANG','ACTIVE')",[A,B,C,D]);
 await db.exec('create role order_test nologin; grant usage on schema moaon_data to order_test; grant select on moaon_data.connections to order_test; grant select,insert,update on moaon_data.orders to order_test;');
 store=createTenantOrderStore({database:{transaction:callback=>db.transaction(async tx=>{await tx.exec('set local role order_test');return callback(tx);})}});
});
test.after(async()=>{await db?.close();});
test('동일한 플랫폼 주문번호도 A/B 사업장에 별도로 저장되고 조회된다',async()=>{
 const a=await context(A),b=await context(B);
 await store.save(a,row('A 상품'));await store.save(b,row('B 상품'));
 assert.equal((await store.get(a,{connectionId:C,externalOrderId:'same-order'})).productName,'A 상품');
 assert.equal((await store.get(b,{connectionId:C,externalOrderId:'same-order'})).productName,'B 상품');
 assert.deepEqual((await store.list(a)).map(x=>x.productName),['A 상품']);
 assert.deepEqual((await store.list(b)).map(x=>x.productName),['B 상품']);
});
test('다른 사업장의 연결 ID로 저장·상세 조회할 수 없다',async()=>{
 const a=await context(A);
 await assert.rejects(()=>store.save(a,row('cross',{connectionId:D})),{code:'CONNECTION_UNAVAILABLE'});
 assert.equal(await store.get(a,{connectionId:D,externalOrderId:'same-order'}),null);
});
test('같은 사업장의 서로 다른 플랫폼 연결도 주문번호를 덮어쓰지 않는다',async()=>{
 const b=await context(B);
 await store.save(b,row('쿠팡 상품',{connectionId:D}));
 const records=await store.list(b);
 assert.deepEqual(records.map(x=>[x.provider,x.productName]),[['CAFE24','B 상품'],['COUPANG','쿠팡 상품']]);
});
test('중복 및 오래된 수집은 최신 상태를 되돌리지 않고 금액 미확인을 0으로 바꾸지 않는다',async()=>{
 const a=await context(A),latest=row('배송 상품',{status:'SHIPPING',paidAmount:null,sourceUpdatedAt:'2026-09-09T01:00:00.000Z'});
 assert.deepEqual(await store.save(a,latest),{saved:true});
 assert.deepEqual(await store.save(a,latest),{saved:false});
 assert.deepEqual(await store.save(a,row('오래된 상품')),{saved:false});
 const result=await store.get(a,{connectionId:C,externalOrderId:'same-order'});
 assert.equal(result.status,'SHIPPING');assert.equal(result.productName,'배송 상품');assert.equal(result.paidAmount,null);
});
test('위조 context와 조회 담당자의 저장은 차단하고 요청 tenant·비밀값·잘못된 금액을 거부한다',async()=>{
 const a=await context(A),viewer=await context(A,'VIEWER');
 await assert.rejects(()=>store.list({...a}),{code:'PERMISSION_DENIED'});
 await assert.rejects(()=>store.save(viewer,row('권한 없음')),{code:'PERMISSION_DENIED'});
 assert.equal((await store.list(viewer)).length,1);
 for(const extra of [{tenantId:B},{apiKey:'must-not-save'},{paidAmount:-1},{paidAmount:undefined},{status:'unknown'},{sourceUpdatedAt:'bad'}]){
  await assert.rejects(()=>store.save(a,row('invalid',extra)),{code:'INVALID_ORDER_INPUT'});
 }
 await assert.rejects(()=>store.list(a,{limit:101}),{code:'INVALID_ORDER_INPUT'});
 await assert.rejects(()=>store.list(a,{tenantId:B}),{code:'INVALID_ORDER_INPUT'});
});
test('RLS는 tenant 조건을 누락한 SQL도 격리하고 성공·실패 후 설정을 남기지 않는다',async()=>{
 for(const tenant of [A,B]){
  await db.transaction(async tx=>{
   await tx.exec('set local role order_test');
   assert.equal((await tx.query('select * from moaon_data.orders')).rows.length,0);
   await tx.query("select set_config('moaon.tenant_id',$1,true)",[tenant]);
   assert.ok((await tx.query('select * from moaon_data.orders')).rows.every(x=>x.tenant_id===tenant));
   const other=tenant===A?B:A;
   assert.equal((await tx.query('update moaon_data.orders set product_name=$1 where tenant_id=$2 returning tenant_id',['cross',other])).rows.length,0);
  });
 }
 await assert.rejects(()=>db.transaction(async tx=>{
  await tx.exec('set local role order_test');await tx.query("select set_config('moaon.tenant_id',$1,true)",[A]);
  await tx.query(`insert into moaon_data.orders(tenant_id,connection_id,external_order_id,product_name,paid_amount,status,source_updated_at)
   values($1,$2,'cross','no',1,'PAID',now())`,[B,C]);
 }),{code:'42501'});
 await db.transaction(async tx=>{await tx.exec('set local role order_test');assert.equal((await tx.query('select * from moaon_data.orders')).rows.length,0);});
});
test('연결 해제 후 기존 주문 노출·새 저장을 차단하며 다른 연결에는 영향이 없다',async()=>{
 await db.query("update moaon_data.connections set status='DISCONNECTED' where tenant_id=$1 and id=$2",[B,C]);
 const b=await context(B),a=await context(A);
 assert.equal(await store.get(b,{connectionId:C,externalOrderId:'same-order'}),null);
 await assert.rejects(()=>store.save(b,row('disconnected')),{code:'CONNECTION_UNAVAILABLE'});
 assert.deepEqual((await store.list(b)).map(x=>x.provider),['COUPANG']);
 assert.equal((await store.list(a)).length,1);
});
test('조회량을 제한하고 SQL 형태 주문번호는 값으로 처리하며 DB 오류 원문은 숨긴다',async()=>{
 const a=await context(A),externalOrderId="x'; select * from orders; --";
 await store.save(a,row('문자열 시험',{externalOrderId}));
 assert.equal((await store.get(a,{connectionId:C,externalOrderId})).productName,'문자열 시험');
 assert.equal((await store.list(a,{limit:1})).length,1);
 const broken=createTenantOrderStore({database:{transaction:async()=>{throw Error('password=fixture-secret');}}});
 await assert.rejects(()=>broken.list(a),error=>error.code==='ORDER_STORAGE_UNAVAILABLE'&&!error.message.includes('fixture-secret'));
});
