'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCsTransport,CS_URL}=require('../cs-transport.cjs');
const payload=()=>({ok:true,status:'READY',writePolicy:'READ_ONLY',generatedAt:'2026-09-10T00:00:00Z',truncated:false,items:[{id:'NAVER:INQUIRY:1',platform:'NAVER',kind:'INQUIRY',status:'OPEN',occurredAt:null,private:'PRIVATE'}]});
test('CS transport only issues fixed authenticated GET and projects safe metadata',async()=>{
 const result=await createCsTransport({fetch:async(url,options)=>{assert.equal(url,CS_URL);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return Response.json(payload());}})();assert.equal(result.status,'READY');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('CS rejects invalid payloads, excessive rows, duplicates and crossed channel identities',async()=>{
 for(const change of [p=>p.items.push(p.items[0]),p=>p.items[0].platform='COUPANG',p=>p.items=Array(201).fill(p.items[0]),p=>p.truncated=null,p=>p.items[0].kind='OTHER']){const p=payload();change(p);assert.equal((await createCsTransport({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');}
 for(const [status,expected] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[503,'UNAVAILABLE']])assert.equal((await createCsTransport({fetch:async()=>new Response('',{status})})()).status,expected);
});
test('CS request cancellation and timeout discard late data',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;assert.equal((await createCsTransport({fetch:()=>{calls++;}})({signal:controller.signal})).status,'CANCELLED');assert.equal(calls,0);
 assert.equal((await createCsTransport({fetch:()=>new Promise(()=>{}),timeoutMs:5})()).status,'TIMEOUT');
});
test('CS network permit is exact, temporary, GET only, and Main process only',()=>{
 const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
 const details={url:CS_URL,method:'GET',webContentsId:-1};assert.equal(isAllowedRemoteRequest(details,{csPermit:CS_URL}),true);
 for(const changed of [{url:CS_URL+'?all=true'},{method:'POST'},{webContentsId:45}])assert.equal(isAllowedRemoteRequest({...details,...changed},{csPermit:CS_URL}),false);
 assert.equal(isAllowedRemoteRequest(details,{}),false);
});
test('CS details validate size and state, project only text, and support older servers',async()=>{
 const p=payload();p.items[0].details={status:'AVAILABLE',title:'제목',body:'본문',history:[{content:'답변',occurredAt:null,private:'SECRET'}],updatedAt:null,truncated:false,secret:'SECRET'};
 const read=()=>createCsTransport({fetch:async()=>Response.json(p)})();
 assert.doesNotMatch(JSON.stringify(await read()),/SECRET/);
 for(const change of [d=>d.body='x'.repeat(2001),d=>d.history=Array(6).fill({content:'x',occurredAt:null}),d=>d.status='MISSING',d=>d.updatedAt='bad']){const saved=structuredClone(p.items[0].details);change(p.items[0].details);assert.equal((await read()).status,'UNAVAILABLE');p.items[0].details=saved;}
 delete p.items[0].details;assert.equal((await read()).items[0].details,null);
});
