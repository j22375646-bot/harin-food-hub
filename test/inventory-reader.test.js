'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInventoryReader}=require('../lib/dashboard/inventory-reader.js');
const {loadWorkspaceInventory}=require('../lib/dashboard/workspace-inventory-loader.js');
const {database}=require('../desktop/test/fixtures/inventory.cjs');
test('501 products are read through stable keys and no rows are lost at the page boundary',async()=>{
 const data={master_products:Array.from({length:501},(_,i)=>({id:String(i).padStart(4,'0'),name:'상품 '+i}))};
 const db=database(data),result=await loadWorkspaceInventory({db});assert.equal(result.items.length,501);assert.equal(new Set(result.items.map(r=>r.id)).size,501);
 assert.equal(db.operations.filter(r=>r[0]==='master_products'&&r[1]==='gt').length,3);
 assert.ok(db.operations.filter(r=>r[1]==='in').every(r=>r[3].length<=100));
 assert.equal(result.items[500].channels[0].quantity,null);
});
test('query chunks share a global bound and a later page failure discards the result',async()=>{
 const data={items:Array.from({length:501},(_,i)=>({id:i,owner:String(i%150)}))};
 const result=await createInventoryReader({db:database(data)})('items','id,owner','owner',Array.from({length:150},(_,i)=>String(i)),1000,'id');assert.equal(result.length,501);
 await assert.rejects(createInventoryReader({db:database(data)})('items','id,owner','owner',Array.from({length:150},(_,i)=>String(i)),500,'id'),/limit/);
 const db=database(data),original=db.from;db.from=table=>{const q=original(table),gt=q.gt;q.gt=(...args)=>{gt(...args);q.then=(ok,bad)=>Promise.resolve({error:{message:'PRIVATE_SQL'}}).then(ok,bad);return q;};return q;};
 await assert.rejects(createInventoryReader({db})('items','id','id'),/unavailable/);
});
test('duplicate pages and cancellation fail closed',async()=>{
 const db=database({items:[{id:'a'},{id:'a'}]});await assert.rejects(createInventoryReader({db})('items','id','id'),/Invalid/);
 const controller=new AbortController();controller.abort();await assert.rejects(createInventoryReader({db,signal:controller.signal})('items','id','id'));assert.equal(db.operations.filter(r=>r[1]==='select').length,1);
});
test('1001 products exceed the explicit ceiling rather than truncate silently',async()=>{
 await assert.rejects(loadWorkspaceInventory({db:database({master_products:Array.from({length:1001},(_,i)=>({id:i,name:'상품'}))})}),/limit/);
});
test('1100 linked options cross the old limit without losing quantities',async()=>{
 const options=Array.from({length:1100},(_,i)=>({vendor_item_id:String(i).padStart(4,'0'),seller_product_id:'seller'}));
 const db=database({master_products:[{id:'master',name:'상품'}],channel_products:[{id:'link',platform:'COUPANG',master_product_id:'master',external_product_id:'seller'}],coupang_product_items:options,coupang_item_inventory:options.map(r=>({...r,quantity:2,checked_at:new Date().toISOString()}))});
 const result=await loadWorkspaceInventory({db});assert.equal(result.items[0].channels[2].quantity,2200);assert.equal(result.items[0].channels[2].externalId,'seller');assert.equal(result.items[0].channels[3].quantity,null);
});
test('real Supabase client emits a cursor and abort signal for paged reads',async()=>{
 const {createClient}=require('@supabase/supabase-js');const calls=[];
 const db=createClient('https://inventory-test.invalid','test-only',{auth:{persistSession:false},global:{fetch:async(url,options)=>{
  calls.push({url:new URL(url),signal:options.signal});return Response.json(calls.length===1?[{id:'a'}]:[]);
 }}});
 const rows=await createInventoryReader({db})('items','id','id');assert.deepEqual(rows,[{id:'a'}]);assert.equal(calls[1].url.searchParams.get('id'),'gt.a');assert.equal(calls[0].url.searchParams.get('limit'),'250');assert.ok(calls[0].signal);
});
