'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createImageService,generateImage}=require('../blog-image.cjs');
const key='AIza'+'x'.repeat(35),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function setup(extra={}){let state=null,calls=0;const service=createImageService({read:async()=>state,write:async s=>{state=structuredClone(s);},now:()=>Date.parse('2026-09-21T00:00:00Z'),generate:async()=>{calls++;return {dataUrl:'data:image/png;base64,AAA='};},...extra});return {service,count:()=>calls};}
test('disabled until explicit paid configuration; ten reservations persist and duplicates never call twice',async()=>{
 const {service,count}=setup();assert.equal((await service.status()).enabled,false);
 await assert.rejects(()=>service.generate({requestId:id(0),prompt:'차 한 잔'}),/SETUP_REQUIRED/);
 await service.configure({key,enabled:true,confirmed:true});
 for(let i=0;i<10;i++)await service.generate({requestId:id(i),prompt:'차 한 잔'});
 await assert.rejects(()=>service.generate({requestId:id(0),prompt:'차 한 잔'}),/DUPLICATE/);
 await assert.rejects(()=>service.generate({requestId:id(10),prompt:'차 한 잔'}),/QUOTA_BLOCKED/);
 assert.equal(count(),10);assert.equal((await service.status()).remaining,0);
 await service.configure({key:'',enabled:true,confirmed:true});assert.equal((await service.status()).remaining,0);
});
test('failure consumes a reservation and concurrent requests are blocked',async()=>{
 let release;const {service}=setup({generate:()=>new Promise((_,reject)=>{release=()=>reject(Error('TIMEOUT'));})});
 await service.configure({key,enabled:true,confirmed:true});const first=service.generate({requestId:id(1),prompt:'차'});
 await new Promise(r=>setImmediate(r));await assert.rejects(()=>service.generate({requestId:id(2),prompt:'차'}),/PENDING/);
 release();await assert.rejects(()=>first,/TIMEOUT/);assert.equal((await service.status()).used,1);
});
test('storage failure prevents provider calls',async()=>{
 let fail=false;const {service,count}=setup({write:async()=>{if(fail)throw Error('DISK');},read:async()=>({key,enabled:true,month:'2026-09',requests:[]})});fail=true;
 await assert.rejects(()=>service.generate({requestId:id(1),prompt:'차'}));assert.equal(count(),0);
});
test('provider uses fixed 1K one-image request and rejects non-image output without retry',async()=>{
 let calls=0;await assert.rejects(()=>generateImage({key,prompt:'차',fetchImpl:async(url,o)=>{calls++;assert.match(url,/gemini-3\.1-flash-image:generateContent$/);const b=JSON.parse(o.body);assert.equal(b.generationConfig.maxOutputTokens,2048);assert.equal(b.generationConfig.candidateCount,1);assert.equal(b.generationConfig.imageConfig.imageSize,'1K');assert.equal(o.redirect,'error');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'no image'}]}}]});}}),/INVALID_OUTPUT/);assert.equal(calls,1);
});
