'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHubConnection,registerConnectionIpc}=require('../hub-connection.cjs');
const {TENANT,BASE}=require('../shipping-progress-contract.cjs');
const {APP_ENTRY_URL,isAllowedRemoteRequest}=require('../connection-policy.cjs');
const id='HR-C24-AAAAAAAA',at='2026-10-24T06:00:00.000Z';
const feed=(key='a')=>({ok:true,contract:1,tenantId:TENANT,scopeKey:key.repeat(64),checkedAt:at,partial:false,items:[{hubOrderId:id,platform:'CAFE24',phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null}]});
function host(){let response=feed(),calls=0;const remote={setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){},webRequest:{onBeforeRequest(_f,fn){remote.guard=fn;}},clearStorageData:async()=>{},clearCache:async()=>{},clearAuthCache:async()=>{},fetch:async(url,options)=>{
 if(url.startsWith(BASE)){calls++;let decision;remote.guard({url,method:options.method,webContentsId:-1},r=>decision=r);assert.equal(decision.cancel,false);return typeof response==='function'?response():Response.json(response);}
 return Response.json({ok:true,orders:[{hubOrderId:id,platform:'CAFE24',productName:'시험',stage:'PREPARING',quantity:1,amount:1000}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});}};
 return {connection:createHubConnection({BrowserWindow:class{},session:{fromPartition:()=>remote},getMainWindow:()=>null}),set:r=>response=r,calls:()=>calls};}
test('connection binds opaque selection to current loaded rows and rejects changing identity',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);const h=host();await h.connection.refresh();assert.equal((await h.connection.readShippingProgress([id])).status,'READY');
 now+=2001;h.set(feed('b'));assert.equal((await h.connection.readShippingProgress([id])).status,'WORKSPACE_CHANGED');assert.equal(h.calls(),2);
 assert.equal((await h.connection.readShippingProgress(['HR-C24-BBBBBBBB'])).status,'CANCELLED');
});
test('disconnect drops an in-flight progress response without retry',async()=>{
 const h=host();await h.connection.refresh();h.set(()=>new Promise(()=>{}));const pending=h.connection.readShippingProgress([id]);await h.connection.disconnect();assert.equal((await pending).status,'CANCELLED');assert.equal(h.calls(),1);
});
test('progress IPC rejects other windows, extra arguments, arbitrary targets and duplicate ids',async()=>{
 const handlers=new Map(),frame={url:APP_ENTRY_URL},wc={mainFrame:frame,getURL:()=>APP_ENTRY_URL},win={isDestroyed:()=>false,webContents:wc},event={sender:wc,senderFrame:frame};let count=0;
 registerConnectionIpc({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getMainWindow:()=>win,connection:{readShippingProgress:async()=>{count++;return {status:'READY'};},cancelShippingProgress(){}}});const read=handlers.get('moaon-hub:shipping-progress-read');
 for(const [e,args] of [[{},[[id]]],[event,[[id],true]],[event,[[id,id]]],[event,[['HR-NV-AAAAAAAA']]]])await assert.rejects(()=>read(e,...args));
 await read(event,[id]);assert.equal(count,1);
});
