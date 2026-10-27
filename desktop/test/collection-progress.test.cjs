'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOrderCollection}=require('../order-collection.cjs');
const id='12345678-1234-4123-8123-123456789abc';
const success={ok:true,worker:{ready:true},cafe24:{status:'SUCCESS'},requests:{naver:{id,status:'PENDING'},coupang:{id,status:'RUNNING'}}};
function setup(fetch){return createOrderCollection({authorize:async()=> 'READY',fetch,readJson:r=>r.json(),permit:()=>{},blocked:()=>false});}
test('safe local snapshot exposes real request and platform stages without request IDs',async()=>{
 let finish;const c=setup(()=>new Promise(r=>finish=r));assert.equal(c.read().phase,'IDLE');const work=c.collect();await new Promise(r=>setImmediate(r));
 assert.equal(c.read().phase,'REQUESTING');assert.equal(c.read().canCollect,false);finish(Response.json(success));await work;
 assert.equal(c.read().phase,'WAITING');assert.equal(c.read().channels.cafe24.status,'SUCCESS');assert.equal(c.read().channels.naver.status,'PENDING');assert.equal(JSON.stringify(c.read()).includes(id),false);
});
test('failed progress check preserves last platform success but never reports full completion',async()=>{
 let calls=0;const c=setup(()=>++calls===1?Response.json(success):Promise.reject(Error('private upstream failure')));await c.collect();const r=await c.check();
 assert.equal(r.reason,'UNAVAILABLE');assert.equal(r.phase,'ATTENTION');assert.equal(r.channels.cafe24.status,'SUCCESS');assert.equal(r.verifiedTerminal,false);assert.equal(r.canCollect,false);assert.equal(r.canCheck,true);await c.collect();assert.equal(calls,2);
});
test('terminal failures allow an explicit retry and are not a full success',async()=>{
 const c=setup(()=>Response.json({...success,requests:{naver:{id,status:'SUCCESS'},coupang:{id,status:'FAILED'}}}));const r=await c.collect();assert.equal(r.phase,'FINISHED');assert.equal(r.status,'CHECK_REQUIRED');assert.equal(r.canCollect,true);assert.equal(r.verifiedTerminal,true);c.reset();assert.equal(c.read().phase,'IDLE');
});
test('confirmed Cafe24 failure does not latch after both workers complete',async()=>{
 const c=setup(()=>Response.json({...success,cafe24:null,cafe24Error:'failed',channelDiagnostics:{cafe24:{status:'FAILED',code:'RATE_LIMITED',httpStatus:429,observedAt:'2026-10-27T06:00:00Z'}},requests:{naver:{id,status:'SUCCESS'},coupang:{id,status:'SUCCESS'}}}));
 const r=await c.collect();assert.equal(r.channels.cafe24.status,'FAILED');assert.equal(r.channels.cafe24.code,'RATE_LIMITED');assert.equal(r.channels.cafe24.httpStatus,429);assert.equal(r.canCollect,true);assert.equal(r.verifiedTerminal,true);
});
test('a structured all-failed response remains retryable and raw provider fields never escape',async()=>{
 const c=setup(()=>Response.json({ok:false,worker:{ready:false},channelDiagnostics:{cafe24:{status:'FAILED',code:'DATABASE_ERROR',observedAt:'2026-10-27T06:00:00Z',message:'PRIVATE',token:'SECRET'},naver:{status:'FAILED',code:'WORKER_OFFLINE'},coupang:{status:'FAILED',code:'WORKER_OFFLINE'}}},{status:503}));
 const r=await c.collect();assert.equal(r.channels.cafe24.code,'DATABASE_ERROR');assert.equal(r.canCollect,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET/);
});
for(const platform of ['naver','coupang'])for(const [status,code] of [['FAILED','RATE_LIMITED'],['FAILED','REQUEST_EXPIRED'],['CANCELLED','REQUEST_CANCELLED'],['RUNNING','DELAYED']])test(platform+' preserves channel-specific '+code+' on progress reads',async()=>{
 let calls=0;const c=setup(()=>Response.json(++calls===1?success:{ok:true,worker:{ready:true},requests:{naver:{id,status:'SUCCESS'},coupang:{id,status:'SUCCESS'},[platform]:{id,status}},channelDiagnostics:{[platform]:{status:status==='CANCELLED'?'FAILED':status,code}}}));
 await c.collect();const r=await c.check();assert.equal(r.channels[platform].code,code);assert.equal(r.channels[platform].status,status==='CANCELLED'?'FAILED':status);assert.equal(r.canCollect,status!=='RUNNING');assert.equal(r.channels.cafe24.status,'SUCCESS');
});
