'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInventoryTransport,INVENTORY_URL}=require('../inventory-transport.cjs');
const payload=()=>({ok:true,status:'READY',writePolicy:'READ_ONLY',generatedAt:'2026-09-10T00:00:00Z',truncated:false,items:[{id:'product',name:'김치',channels:['CAFE24:STORE','NAVER:STORE','COUPANG:MARKETPLACE','COUPANG:ROCKET_GROWTH'].map(key=>({platform:key.split(':')[0],family:key.split(':')[1],state:'UNKNOWN',quantity:null,updatedAt:null,stale:true,stopped:false,unmanaged:false,detail:'확인 필요',private:'PRIVATE'}))}]});
test('INVENTORY transport only issues fixed authenticated GET and projects safe metadata',async()=>{
 const result=await createInventoryTransport({fetch:async(url,options)=>{assert.equal(url,INVENTORY_URL);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return Response.json(payload());}})();assert.equal(result.status,'READY');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('INVENTORY rejects invalid payloads, excessive rows, duplicates and crossed channel identities',async()=>{
 for(const change of [p=>p.items.push(p.items[0]),p=>p.items[0].channels[0].platform='OTHER',p=>p.items=Array(1001).fill(p.items[0]),p=>p.truncated=null,p=>p.items[0].channels[0].quantity=-1]){const p=payload();change(p);assert.equal((await createInventoryTransport({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');}
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

test('1000 products and connection identifiers survive the app projection',async()=>{
 const p=payload();p.items=Array.from({length:1000},(_,i)=>({...p.items[0],id:'product-'+i}));p.items[0].channels[0].externalId='channel-123';
 const result=await createInventoryTransport({fetch:async()=>Response.json(p)})();assert.equal(result.status,'READY');assert.equal(result.items.length,1000);assert.equal(result.items[0].channels[0].externalId,'channel-123');
});
test('invalid connection identifiers are rejected',async()=>{
 for(const value of [123,'a'.repeat(161)]){const p=payload();p.items[0].channels[0].externalId=value;assert.equal((await createInventoryTransport({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');}
});

test('product metadata is projected while old responses remain readable',async()=>{
 const p=payload();p.items[0].channels[0].product={name:'원본 상품',basis:'CAFE24_CATALOG',min:10000,max:12000,updatedAt:null,stale:true,secret:'PRIVATE'};
 const result=await createInventoryTransport({fetch:async()=>Response.json(p)})();assert.equal(result.status,'READY');assert.equal(result.items[0].channels[0].product.max,12000);assert.equal(result.items[0].channels[1].product,null);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('invalid, partial, reversed and crossed provider prices are rejected',async()=>{
 for(const override of [{min:0},{max:null},{max:9000},{basis:'COUPANG_OPTIONS'},{min:NaN},{name:'a'.repeat(201)}]){const p=payload();p.items[0].channels[0].product={name:'상품',basis:'CAFE24_CATALOG',min:10000,max:12000,updatedAt:null,stale:true,...override};assert.equal((await createInventoryTransport({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');}
});

test('multiple connection data is projected and contradictory known values are rejected',async()=>{
 const p=payload(),c=p.items[0].channels[0];c.mapping={count:2,entries:[{id:'a',externalId:'x',name:'상품 A',active:true,reference:false,private:'PRIVATE'},{id:'b',externalId:'y',name:'상품 B',active:null,reference:false}]};
 const run=p=>createInventoryTransport({fetch:async()=>Response.json(p)})();
 const result=await run(p);assert.equal(result.status,'READY');assert.equal(result.items[0].channels[0].mapping.count,2);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 for(const change of [r=>r.quantity=5,r=>r.externalId='x',r=>r.mapping.entries[1].id='a',r=>r.mapping.count=3,r=>r.mapping.entries[0].active='yes']){const next=structuredClone(p);change(next.items[0].channels[0]);assert.equal((await run(next)).status,'UNAVAILABLE');}
});
