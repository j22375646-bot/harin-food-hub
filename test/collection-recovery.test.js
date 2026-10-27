'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),r=require('../lib/orders/collection-recovery.js');
const id='12345678-1234-4123-8123-123456789abc',workerId='11111111-1111-4111-8111-111111111111';
function database(){const tables=new Map([[r.TABLE,new Map()],['coupang_sync_requests',new Map()],['coupang_operation_requests',new Map()]]);let inserts=0;return {tables,get inserts(){return inserts;},from(table){let mode='read',value,filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},insert(v){mode='insert';value=v;return this;},update(v){mode='update';value=v;return this;},async single(){return this.maybeSingle();},async maybeSingle(){const rows=tables.get(table);if(mode==='insert'){inserts++;if(rows.has(value.id))return {data:null,error:{code:'23505'}};const row={...value,started_at:new Date().toISOString()};rows.set(value.id,row);return {data:row,error:null};}const row=[...rows.values()].find(row=>filters.every(([k,v])=>row[k]===v));if(mode==='update'&&row)Object.assign(row,value);return {data:row||null,error:null};}};}};}
test('claiming a durable receipt twice never starts a second collection',async()=>{const db=database();const first=await r.claim(db,id),again=await r.claim(db,id);assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(db.tables.get(r.TABLE).size,1);const pending=await r.response(db,again.record,{ready:true});assert.equal(pending.pending,true);assert.equal(pending.collection.status,'RUNNING');});
test('settled receipts link exact workers and strip provider messages and extra metadata',async()=>{const db=database();await r.claim(db,id);const channels={cafe24:{status:'SUCCESS',code:'SUCCESS',raw:'SECRET'},naver:{status:'PENDING',code:'QUEUED'},coupang:{status:'FAILED',code:'WORKER_OFFLINE'}};const record=await r.settle(db,id,channels,{naver:{id:workerId},coupang:null});db.tables.get('coupang_operation_requests').set(workerId,{id:workerId,status:'FAILED',error_message:'SECRET PRIVATE (429)'});const result=await r.response(db,record,{ready:true});assert.equal(result.channelDiagnostics.naver.code,'RATE_LIMITED');assert.equal(result.channelDiagnostics.cafe24.status,'SUCCESS');assert.equal(result.pending,false);assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|error_message|raw/);assert.equal(result.collection.id,id);});
test('missing queue records remain uncertain rather than fabricating success',async()=>{const db=database();await r.claim(db,id);const record=await r.settle(db,id,{cafe24:{status:'SUCCESS',code:'SUCCESS'},naver:{status:'PENDING',code:'QUEUED'},coupang:{status:'FAILED',code:'WORKER_OFFLINE'}},{naver:{id:workerId}});assert.equal((await r.response(db,record,{ready:true})).channelDiagnostics.naver.code,'RESULT_MISSING');assert.equal(await r.load(db,'00000000-0000-4000-8000-000000000001'),null);});
module.exports={database};

const apiSafety=require('../lib/api/safety.js'),supabase=require('../lib/cafe24/supabase.js'),config=require('../lib/cafe24/config.js'),sync=require('../lib/cafe24/sync.js'),requestQueue=require('../lib/coupang/request-queue.js'),operations=require('../lib/coupang/operation-queue.js'),reliability=require('../lib/operations/reliability-center.js'),unified=require('../lib/orders/unified-orders.js'),{pathToFileURL}=require('node:url'),path=require('node:path');
test('compact route persists before long work, recovers with GET, deduplicates POST and skips the full orders query',async()=>{
 const db=database();let resolveCafe,cafeCalls=0,queueCalls=0;
 const patches=[
  [apiSafety,'isAuthorized',()=>true],[supabase,'getSupabase',()=>db],[config,'getConfig',()=>({})],
  [reliability,'loadLiveRefreshWorkerReadiness',async()=>({ready:true})],
  [sync,'syncOrdersRealtime',()=>{cafeCalls++;return new Promise(resolve=>resolveCafe=resolve);}],
  [requestQueue,'queueRequest',async()=>{queueCalls++;const row={id:workerId,status:'SUCCESS',finished_at:new Date().toISOString()};db.tables.get('coupang_sync_requests').set(workerId,row);return {request:row};}],
  [operations,'queueOperation',async()=>{const row={id:workerId,status:'SUCCESS',executed_at:new Date().toISOString()};db.tables.get('coupang_operation_requests').set(workerId,row);return {request:row};}],
  [unified,'loadUnifiedOrders',async()=>{throw Error('Compact path must not query all orders');}]
 ];const saved=patches.map(([o,k])=>o[k]);
 try{
  patches.forEach(([o,k,v])=>o[k]=v);const route=await import(pathToFileURL(path.join(__dirname,'../app/api/orders/live-refresh/route.js')).href+'?recovery='+Date.now());
  const post=()=>route.POST(new Request('https://example.com/api/orders/live-refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collectionId:id})}));
  const running=post();for(let i=0;i<100&&!resolveCafe;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof resolveCafe,'function');
  const waiting=await route.GET(new Request('https://example.com/api/orders/live-refresh?collectionId='+id));assert.equal(waiting.status,202);assert.equal((await waiting.json()).collection.status,'RUNNING');
  const duplicate=await post();assert.equal(duplicate.status,202);assert.equal(cafeCalls,1);
  resolveCafe({status:'SUCCESS',finishedAt:new Date().toISOString()});const done=await running;assert.equal(done.status,200);assert.equal((await done.json()).channelDiagnostics.cafe24.status,'SUCCESS');
  const recovered=await route.GET(new Request('https://example.com/api/orders/live-refresh?collectionId='+id));assert.equal(recovered.status,200);assert.equal((await recovered.json()).channelDiagnostics.naver.status,'SUCCESS');assert.equal(cafeCalls,1);assert.equal(queueCalls,1);
  assert.equal((await post()).status,200);assert.equal(cafeCalls,1);
  const missing=await route.GET(new Request('https://example.com/api/orders/live-refresh?collectionId=00000000-0000-4000-8000-000000000001'));assert.equal(missing.status,404);assert.equal((await missing.json()).collection.status,'NOT_FOUND');
  assert.equal((await route.GET(new Request('https://example.com/api/orders/live-refresh?collectionId=bad'))).status,400);
  apiSafety.isAuthorized=()=>false;assert.equal((await route.GET(new Request('https://example.com/api/orders/live-refresh?collectionId='+id))).status,401);
 }finally{patches.forEach(([o,k],i)=>o[k]=saved[i]);}
});
