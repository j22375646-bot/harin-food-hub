'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInventoryTransport,INVENTORY_URL}=require('../inventory-transport.cjs');
const payload=()=>({ok:true,status:'READY',writePolicy:'READ_ONLY',generatedAt:'2026-09-10T00:00:00Z',truncated:false,items:[{id:'product',name:'김치',channels:['CAFE24:STORE','NAVER:STORE','COUPANG:MARKETPLACE','COUPANG:ROCKET_GROWTH'].map(key=>({platform:key.split(':')[0],family:key.split(':')[1],state:'UNKNOWN',quantity:null,updatedAt:null,stale:true,stopped:false,unmanaged:false,detail:'확인 필요',private:'PRIVATE'}))}]});
test('INVENTORY transport only issues fixed authenticated GET and projects safe metadata',async()=>{
 const result=await createInventoryTransport({fetch:async(url,options)=>{assert.equal(url,INVENTORY_URL);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return Response.json(payload());}})();assert.equal(result.status,'READY');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('INVENTORY rejects invalid payloads, excessive rows, duplicates and crossed channel identities',async()=>{
 for(const change of [p=>p.items.push(p.items[0]),p=>p.items[0].channels[0].platform='OTHER',p=>p.items=Array(201).fill(p.items[0]),p=>p.truncated=null,p=>p.items[0].channels[0].quantity=-1]){const p=payload();change(p);assert.equal((await createInventoryTransport({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');}
 for(const [status,expected] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[503,'UNAVAILABLE']])assert.equal((await createInventoryTransport({fetch:async()=>new Response('',{status})})()).status,expected);
});
test('INVENTORY request cancellation and timeout discard late data',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;assert.equal((await createInventoryTransport({fetch:()=>{calls++;}})({signal:controller.signal})).status,'CANCELLED');assert.equal(calls,0);
 assert.equal((await createInventoryTransport({fetch:()=>new Promise(()=>{}),timeoutMs:5})()).status,'TIMEOUT');
});
test('INVENTORY network permit is exact, temporary, GET only, and Main process only',()=>{
 const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
 const details={url:INVENTORY_URL,method:'GET',webContentsId:-1};assert.equal(isAllowedRemoteRequest(details,{inventoryPermit:INVENTORY_URL}),true);
 for(const changed of [{url:INVENTORY_URL+'?all=true'},{method:'POST'},{webContentsId:45}])assert.equal(isAllowedRemoteRequest({...details,...changed},{inventoryPermit:INVENTORY_URL}),false);
 assert.equal(isAllowedRemoteRequest(details,{}),false);
});
