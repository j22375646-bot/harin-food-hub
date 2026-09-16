'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createReadQueue}=require('../assistant-read-queue.cjs');
test('read overlap is serialized; writes are not queued or replayed',async()=>{
 let active=false,calls=[],release;const gate=new Promise(r=>release=r);
 const run=createReadQueue(async v=>{if(active)return {ok:false,code:'BUSY'};active=true;calls.push(v.action);if(calls.length===1)await gate;active=false;return {ok:true};},()=>0);
 const a=run({action:'BOT_LIST'});await Promise.resolve();const b=run({action:'AUTO_READ'});
 assert.equal((await run({action:'AUTO_SAVE'})).code,'BUSY');release();assert.ok((await a).ok);assert.ok((await b).ok);assert.deepEqual(calls,['BOT_LIST','AUTO_READ']);
});
test('queued read never crosses a disconnected session generation',async()=>{
 let gen=0,calls=0,release;const gate=new Promise(r=>release=r),run=createReadQueue(async()=>{calls++;await gate;return {ok:true};},()=>gen);
 const a=run({action:'BOT_LIST'});await Promise.resolve();const b=run({action:'AUTO_READ'});gen++;release();await a;assert.equal((await b).code,'ASSISTANT_AUTH_REQUIRED');assert.equal(calls,1);
});
