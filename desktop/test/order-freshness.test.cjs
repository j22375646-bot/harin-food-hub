'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const test=require('node:test');
const {createHubConnection}=require('../hub-connection.cjs');
const SNAP='0123456789abcdef'.repeat(4);
const order=(changes={})=>({hubOrderId:'HR-C24-1234ABCD',platform:'CAFE24',fulfillment:'SELLER',externalOrderId:'C1',productName:'작두콩차',quantity:1,amount:12000,orderedAt:'2026-09-09T00:00:00Z',items:[{name:'차',option:'1상자',quantity:1}],gifts:['스푼'],receiver:{name:'홍길동',contact:'01012345678',postCode:'12345',address:'서울',addressDetail:'1층'},invoiceNumber:'',issuedInvoiceNumber:'',invoice:null,stage:'PAID',cancelled:false,cancellationRequested:false,shippingHistoryStatus:'READY',shippingEligible:true,selectionEligible:true,...changes});
const payload=(rows=[order()],changes={})=>({ok:true,orders:rows,total:rows.length,offset:0,nextOffset:null,snapshot:SNAP,partial:false,...changes});
function fixture(fetchImpl,{clock={value:0},timeoutMs=30,minimized={value:false}}={}){
 const remote={fetch:fetchImpl,webRequest:{onBeforeRequest(){}},on(){},setPermissionCheckHandler(){},setPermissionRequestHandler(){},async clearStorageData(){},async clearCache(){},async clearAuthCache(){}};
 class Window extends EventEmitter{constructor(){super();this.webContents=Object.assign(new EventEmitter(),{id:2,getURL:()=>'',setWindowOpenHandler(){}});}isDestroyed(){return false;}destroy(){}close(){}show(){}loadURL(){}}
 const connection=createHubConnection({BrowserWindow:Window,session:{fromPartition:()=>remote},getMainWindow:()=>({isDestroyed:()=>false,isMinimized:()=>minimized.value,webContents:{id:1}}),now:()=>new Date(clock.value),timeoutMs});
 return {connection,clock};
}
test('freshness does no GET without a loaded snapshot and same page is CURRENT without replacing state',async()=>{
 let calls=0;const {connection}=fixture(async()=>{calls++;return Response.json(payload());});
 assert.equal((await connection.checkOrderFreshness()).status,'SKIPPED');assert.equal(calls,0);
 const loaded=await connection.refresh(),result=await connection.checkOrderFreshness();
 assert.equal(result.status,'CURRENT');assert.equal(calls,2);assert.equal((await connection.recheckPage()).orders[0].productName,loaded.orders[0].productName);
});
test('freshness detects 409 and private document changes while retaining the displayed selection source',async()=>{
 let mode='same',calls=0;const {connection,clock}=fixture(async()=>{calls++;return mode==='409'?new Response('',{status:409}):Response.json(payload([order(mode==='detail'?{gifts:['새 사은품'],items:[{name:'차',option:'2상자',quantity:2}],receiver:{name:'변경',contact:'01000000000',postCode:'54321',address:'부산',addressDetail:''}}:{})]));});
 const loaded=await connection.refresh();mode='detail';assert.equal((await connection.checkOrderFreshness()).status,'CHANGED');assert.equal(loaded.orders[0].details.items[0].option,'1상자');
 clock.value=61_000;mode='409';assert.equal((await connection.checkOrderFreshness()).status,'CHANGED');assert.equal(calls,3);
});
test('freshness shares concurrency, throttles failures, and discards late results after context changes',async()=>{
 let release,calls=0;const {connection,clock}=fixture(async()=>{calls++;if(calls===2)return new Promise(resolve=>release=resolve);return Response.json(payload());});
 await connection.refresh();const first=connection.checkOrderFreshness(),second=connection.checkOrderFreshness();assert.strictEqual(first,second);release(Response.json(payload()));assert.equal((await first).status,'CURRENT');assert.equal((await connection.checkOrderFreshness()).status,'CURRENT');assert.equal(calls,2);
 clock.value=61_000;let lateRelease;const lateFixture=fixture(async()=>{if(!lateRelease)return Response.json(payload());return new Promise(resolve=>lateRelease=resolve);},{clock});
 await lateFixture.connection.refresh();lateRelease=()=>{};const pending=lateFixture.connection.checkOrderFreshness();await new Promise(resolve=>setImmediate(resolve));await lateFixture.connection.disconnect();lateRelease(Response.json(payload()));assert.equal((await pending).status,'SKIPPED');
});
test('freshness rate cap is global when channel or filter identity changes',async()=>{
 let calls=0;const {connection}=fixture(async()=>{calls++;return Response.json(payload());});
 await connection.refresh();assert.equal((await connection.checkOrderFreshness()).status,'CURRENT');
 await connection.setOrderFilters({delayOnly:true,giftOnly:false});const afterFilter=calls;
 assert.equal((await connection.checkOrderFreshness()).status,'SKIPPED');assert.equal(calls,afterFilter);
});
test('minimized window performs no GET and restore can check under the existing rate cap',async()=>{
 let calls=0;const minimized={value:false},clock={value:0};const {connection}=fixture(async()=>{calls++;return Response.json(payload());},{clock,minimized});
 await connection.refresh();minimized.value=true;clock.value=61_000;assert.equal((await connection.checkOrderFreshness()).status,'SKIPPED');assert.equal(calls,1);
 minimized.value=false;assert.equal((await connection.checkOrderFreshness()).status,'CURRENT');assert.equal(calls,2);
 assert.equal((await connection.checkOrderFreshness()).status,'CURRENT');assert.equal(calls,2);
});
test('a same-snapshot page replacement invalidates cached freshness without bypassing the global cap',async()=>{
 let changed=true,calls=0;const {connection,clock}=fixture(async()=>{calls++;return Response.json(payload([order(changed?{gifts:['변경']}:{})]));});
 changed=false;await connection.refresh();changed=true;assert.equal((await connection.checkOrderFreshness()).status,'CHANGED');
 await connection.recheckPage();const before=calls;assert.equal((await connection.checkOrderFreshness()).status,'SKIPPED');assert.equal(calls,before);
 clock.value=61_000;assert.equal((await connection.checkOrderFreshness()).status,'CURRENT');
});
test('freshness maps partial, bad JSON, auth and timeout to explicit safe statuses',async()=>{
 for(const [response,status] of [[()=>Response.json(payload([], {partial:true})),'UNAVAILABLE'],[()=>Response.json({}),'UNAVAILABLE'],[()=>Response.json(null),'UNAVAILABLE'],[()=>Response.json([]),'UNAVAILABLE'],[()=>new Response('{'),'UNAVAILABLE'],[()=>new Response('',{status:401}),'AUTH_REQUIRED'],[()=>new Response('',{status:403}),'AUTH_REQUIRED']]){
  let n=0;const {connection}=fixture(async()=>++n===1?Response.json(payload()):response());await connection.refresh();assert.equal((await connection.checkOrderFreshness()).status,status);
 }
 let n=0;const {connection}=fixture(async()=>++n===1?Response.json(payload()):new Promise(()=>{}),{timeoutMs:5});await connection.refresh();assert.equal((await connection.checkOrderFreshness()).status,'UNAVAILABLE');
});
