'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOrderCollection}=require('../order-collection.cjs');
const worker='12345678-1234-4123-8123-123456789abc';
const options=fetch=>({authorize:async()=> 'READY',fetch,readJson:r=>r.json(),permit(){},blocked:()=>false,timeoutMs:25});
function result(id,status='SETTLED',workerStatus='SUCCESS'){return {ok:true,collection:{id,status},worker:{ready:true},channelDiagnostics:{cafe24:{status:status==='RUNNING'?'PENDING':'SUCCESS',code:status==='RUNNING'?'PREPARING':'SUCCESS',observedAt:'2026-10-28T00:00:00Z'},naver:{status:status==='RUNNING'?'PENDING':workerStatus,code:status==='RUNNING'?'PREPARING':workerStatus==='SUCCESS'?'SUCCESS':'RUNNING'},coupang:{status:status==='RUNNING'?'PENDING':'SUCCESS',code:status==='RUNNING'?'PREPARING':'SUCCESS'}},requests:status==='RUNNING'?{}:{naver:{id:worker,status:workerStatus},coupang:{id:worker,status:'SUCCESS'}}};}
test('a lost POST response recovers the exact durable request with GET and no second POST',async()=>{
 let id,posts=0,gets=0;const c=createOrderCollection(options((url,o)=>{if(o.method==='POST'){posts++;id=JSON.parse(o.body).collectionId;return new Promise(()=>{});}gets++;assert.equal(new URL(url).searchParams.get('collectionId'),id);return Response.json(result(id));}));
 const lost=await c.collect();assert.equal(lost.canCheck,true);assert.equal(lost.canCollect,false);assert.equal(lost.recovering,true);assert.equal(lost.code,'RECOVERING');await c.collect();assert.equal(posts,1);
 const recovered=await c.check();assert.equal(recovered.status,'SUCCESS');assert.equal(recovered.canCollect,true);assert.equal(recovered.verifiedTerminal,true);assert.equal(recovered.recovering,false);assert.equal(gets,1);assert.doesNotMatch(JSON.stringify(recovered),new RegExp(id));
});
test('running receipt can acquire worker IDs later and never prematurely releases the retry lock',async()=>{
 let id,gets=0;const c=createOrderCollection(options((_url,o)=>{if(o.method==='POST'){id=JSON.parse(o.body).collectionId;return new Promise(()=>{});}return Response.json(++gets===1?result(id,'RUNNING'):result(id));}));await c.collect();const working=await c.check();assert.equal(working.channels.cafe24.code,'PREPARING');assert.equal(working.status,'PENDING');assert.equal(working.canCollect,false);const done=await c.check();assert.equal(done.status,'SUCCESS');
});
test('a receipt still processing worker jobs is checked using the receipt identity',async()=>{
 let id;const c=createOrderCollection(options((url,o)=>{if(o.method==='POST'){id=JSON.parse(o.body).collectionId;return Response.json(result(id,'SETTLED','RUNNING'));}assert.equal(new URL(url).searchParams.get('collectionId'),id);return Response.json(result(id));}));assert.equal((await c.collect()).status,'PENDING');assert.equal((await c.check()).status,'SUCCESS');
});
test('only an authoritative NOT_FOUND enables a retry and it reuses the original idempotency key',async()=>{
 const ids=[];let id;const c=createOrderCollection(options((_url,o)=>{if(o.method==='POST'){id=JSON.parse(o.body).collectionId;ids.push(id);return ids.length===1?new Promise(()=>{}):Response.json(result(id));}return Response.json({ok:false,collection:{id,status:'NOT_FOUND'}},{status:404});}));await c.collect();assert.equal((await c.check()).canCollect,true);assert.equal((await c.collect()).status,'SUCCESS');assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
});
test('wrong receipt and repeated read errors cannot unlock or replace a queued request; reset drops late results',async()=>{
 let id,mode='WRONG',finish;const c=createOrderCollection(options((_url,o)=>{if(o.method==='POST'){id=JSON.parse(o.body).collectionId;return new Promise(()=>{});}if(mode==='WRONG')return Response.json(result('00000000-0000-4000-8000-000000000001'));if(mode==='FAIL')throw Error('fetch failed');return new Promise(r=>finish=r);}));await c.collect();assert.equal((await c.check()).canCollect,false);mode='FAIL';assert.equal((await c.check()).canCollect,false);mode='LATE';const late=c.check();await new Promise(r=>setImmediate(r));c.reset();finish(Response.json(result(id)));await late;assert.equal(c.read().canCheck,false);assert.equal(c.read().status,'IDLE');
});
test('verified completed receipt stays successful even if the worker is now offline',async()=>{
 let id;const c=createOrderCollection(options((_url,o)=>{if(o.method==='POST'){id=JSON.parse(o.body).collectionId;return new Promise(()=>{});}return Response.json({...result(id),worker:{ready:false}});}));await c.collect();const done=await c.check();assert.equal(done.status,'SUCCESS');assert.equal(done.verifiedTerminal,true);assert.equal(done.canCollect,true);assert.equal(done.recovering,false);
});
