'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHubConnection,registerConnectionIpc}=require('../hub-connection.cjs');
const {buildOrdersScopeUrl,isAllowedRemoteRequest}=require('../connection-policy.cjs');
const order=()=>({hubOrderId:'HR-C24-1234ABCD',externalOrderId:'WEB-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'차',quantity:1,shippingEligible:true,shippingHistoryStatus:'READY',cancelled:false,cancellationRequested:false,invoice:{status:'ISSUED',number:'1234567890123'}});
function setup({read=()=>[order()],post=()=>({ok:true,results:[{hubOrderId:order().hubOrderId,status:'SUCCESS',ok:true}]}),dialog=async()=>({response:1})}={}){
 const calls=[];const remote={setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){},webRequest:{onBeforeRequest(_filter,fn){remote.guard=fn;}},async clearStorageData(){},async clearCache(){},async clearAuthCache(){},async fetch(url,options){calls.push({url,options});if(options.method==='POST')return Response.json(await post());const orders=await read(url);return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});}};
 const connection=createHubConnection({BrowserWindow:class{},session:{fromPartition:()=>remote},getMainWindow:()=>({isDestroyed:()=>false}),showShipmentReview:dialog});
 return {connection,calls,remote};
}
test('channel choices query server even absent from current page and reject arbitrary values',async()=>{
 const {connection,calls}=setup({read:()=>[]});
 assert.equal(typeof connection.viewChannel,'function');
 assert.equal((await connection.viewChannel('COUPANG')).channel,'COUPANG');
 assert.equal(new URL(calls.at(-1).url).searchParams.get('platform'),'COUPANG');
 await connection.viewRegistered();assert.match(calls.at(-1).url,/stage=REGISTER&platform=COUPANG$/);
 await assert.rejects(async()=>connection.viewChannel('COUPANG&platform=ALL'));
 assert.equal(isAllowedRemoteRequest({method:'GET',url:buildOrdersScopeUrl('ACTIVE','CAFE24'),webContentsId:0}),true);
});
test('confirmed invoice registration uses one fixed POST and verifies stored registration',async()=>{
 let registered=false,dialogs=0;
 const {connection,calls}=setup({read:url=>registered&&new URL(url).searchParams.get('stage')==='ACTIVE'?[]:[{...order(),stage:'READY_TO_SHIP',invoice:{status:registered?'REGISTERED':'ISSUED',number:'1234567890123'}}],post:()=>{registered=true;return {ok:true,results:[{hubOrderId:order().hubOrderId,ok:true,status:'SUCCESS'}]};},dialog:async(_parent,options)=>{dialogs++;assert.equal(options.defaultId,0);assert.match(options.detail,/1234567890123/);return {response:1};}});
 const page=await connection.refresh();assert.equal(page.orders[0].registrationEligible,true);
 await connection.setOrderFilters({delayOnly:false,giftOnly:true});
 const result=await connection.registerInvoices([order().hubOrderId]);
 assert.deepEqual(result,{status:'COMPLETED',results:[{hubOrderId:order().hubOrderId,status:'REGISTERED',trackingStatus:'CHECK_REQUIRED'}]});
 const tracking=calls.filter(call=>call.url.endsWith('/api/shipping/tracking'));
 assert.equal(tracking.length,1);assert.deepEqual(JSON.parse(tracking[0].options.body),{orderIds:[order().hubOrderId],mode:'automatic'});
 const posts=calls.filter(call=>call.options.method==='POST'&&call.url.endsWith('/actions'));assert.equal(posts.length,1);assert.equal(dialogs,1);
 assert.equal(posts[0].url,'https://harin-cafe24-sync.vercel.app/api/shipping/actions');
 assert.equal(posts[0].options.headers.Origin,'https://harin-cafe24-sync.vercel.app');
 assert.deepEqual(JSON.parse(posts[0].options.body),{confirm:true,action:'UPLOAD_INVOICE',orders:[{hubOrderId:order().hubOrderId,invoiceNumber:'1234567890123',deliveryCompanyCode:'0012'}]});
 const fresh=calls.filter(call=>call.options.method==='GET'&&new URL(call.url).searchParams.get('stage')==='ACTIVE').at(-1).url;
 const recovery=calls.filter(call=>call.options.method==='GET'&&new URL(call.url).searchParams.get('stage')==='REGISTER');
 assert.match(fresh,/delayOnly=false&giftOnly=true/,'selected-order fresh recheck keeps current filters');
 assert.ok(recovery.length>0&&recovery.every(call=>!call.url.includes('giftOnly=')),'post-registration recovery deliberately ignores list filters');
});
test('Coupang seller registration returns pending instead of claiming registration',async()=>{
 const cp={...order(),hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',shipmentId:'123'};
 const {connection,calls}=setup({read:()=>[cp],post:()=>({ok:true,results:[{hubOrderId:cp.hubOrderId,ok:true,status:'QUEUED'}]})});
 await connection.refresh();assert.deepEqual(await connection.registerInvoices([cp.hubOrderId]),{status:'PARTIAL',results:[{hubOrderId:cp.hubOrderId,status:'PENDING'}]});
 assert.equal(JSON.parse(calls.find(call=>call.options.method==='POST').options.body).orders[0].deliveryCompanyCode,'EPOST');
 assert.equal((await connection.registerInvoices([cp.hubOrderId])).status,'CHECK_REQUIRED');
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
});
test('registered verification follows its snapshot for at most five pages and preserves ACTIVE scope',async()=>{
 for(const targetOffset of [20,100]){
  const env=setup(),original=env.remote.fetch,verification=[];
  env.remote.fetch=async(url,options)=>{
   const query=new URL(url).searchParams;
   if(query.get('stage')!=='REGISTER')return original(url,options);
   verification.push(url);const offset=Number(query.get('offset')||0),total=targetOffset+1;
   if(offset>0)assert.equal(query.get('snapshot'),'b'.repeat(64));
   const orders=offset===targetOffset?[{...order(),invoice:{status:'REGISTERED',number:'1234567890123'}}]:Array.from({length:20},(_,i)=>({hubOrderId:`OTHER-${offset+i}`}));
   return Response.json({ok:true,orders,total,offset,nextOffset:offset+20<total?offset+20:null,snapshot:'b'.repeat(64),partial:false});
  };
  await env.connection.refresh();
  const result=await env.connection.registerInvoices([order().hubOrderId]);
  assert.equal(result.results[0].status,targetOffset===20?'REGISTERED':'CHECK_REQUIRED');
  assert.equal(verification.length,targetOffset===20?2:5);
  assert.equal((await env.connection.recheckPage()).scope,'ACTIVE','private verification must preserve displayed cursor/scope');
 }
});
test('cancel, private change, logout, scope switch and expired auth never submit',async()=>{
 for(const mode of ['cancel','change','logout','scope','expired']){
  let current=order(),expired=false;let connection;
  const env=setup({read:()=>{if(expired)throw Error('expired');return [current];},dialog:async()=>{
   if(mode==='change')current={...current,receiver:{address:'changed'}};
   if(mode==='logout')await connection.disconnect();
   if(mode==='scope')await connection.viewChannel('CAFE24');
   if(mode==='expired')expired=true;
   return {response:mode==='cancel'?0:1};
  }});connection=env.connection;await connection.refresh();
  const value=await connection.registerInvoices([current.hubOrderId]);assert.notEqual(value.status,'COMPLETED',mode);
  assert.equal(env.calls.some(call=>call.options.method==='POST'),false,mode);
 }
});
test('unknown outcomes remain check required and never auto retry',async()=>{
 const {connection,calls}=setup({post:()=>{throw Error('response lost');}});
 await connection.refresh();assert.deepEqual(await connection.registerInvoices([order().hubOrderId]),{status:'PARTIAL',results:[{hubOrderId:order().hubOrderId,status:'CHECK_REQUIRED'}]});
 await connection.registerInvoices([order().hubOrderId]);assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
});
test('registration fails closed for invalid selection or missing eligibility inputs',async()=>{
 const {connection}=setup();await connection.refresh();
 for(const ids of [[],[order().hubOrderId,order().hubOrderId],['HR-NV-1234ABCD'],new Array(21).fill(order().hubOrderId),['https://evil.invalid']])await assert.rejects(async()=>connection.registerInvoices(ids));
 for(const patch of [{fulfillment:'ROCKET_GROWTH'},{shippingEligible:null},{cancelled:null},{invoice:{status:'REGISTERED',number:'1234567890123'}},{shippingHistoryStatus:'UNAVAILABLE'},{externalOrderId:''}]){
  const env=setup({read:()=>[{...order(),...patch}]});await env.connection.refresh();
  assert.equal((await env.connection.registerInvoices([order().hubOrderId])).status,'CHECK_REQUIRED');assert.equal(env.calls.length,1);
 }
});
test('registration transport is allowed only for active Main POST and rejects renderer, query and other verbs',()=>{
 const url='https://harin-cafe24-sync.vercel.app/api/shipping/actions';
 assert.equal(isAllowedRemoteRequest({url,method:'POST',webContentsId:0},{registrationRequestActive:true}),true);
 for(const [request,context] of [[{url,method:'POST',webContentsId:3},{registrationRequestActive:true}],[{url,method:'POST',webContentsId:0},{}],[{url:url+'?evil=1',method:'POST',webContentsId:0},{registrationRequestActive:true}],[{url,method:'GET',webContentsId:0},{registrationRequestActive:true}]])assert.equal(isAllowedRemoteRequest(request,context),false);
});

test('automatic tracking permit allows only exact Main POST while active',()=>{
 const url='https://harin-cafe24-sync.vercel.app/api/shipping/tracking',context={automaticTrackingRequestActive:true};
 assert.equal(isAllowedRemoteRequest({url,method:'POST',webContentsId:0},context),true);
 for(const request of [{url,method:'GET',webContentsId:0},{url,method:'POST',webContentsId:3},{url:url+'?mode=automatic',method:'POST',webContentsId:0},{url:url+'/',method:'POST',webContentsId:0}])assert.equal(isAllowedRemoteRequest(request,context),false);
 assert.equal(isAllowedRemoteRequest({url,method:'POST',webContentsId:0},{}),false);
});

test('changed invoice, private identity or cancelled verification cannot enqueue tracking',async()=>{
 for(const patch of [{invoice:{status:'REGISTERED',number:'9999999999999'}},{externalOrderId:'OTHER'},{cancelled:true},{cancellationRequested:true}]){
  const env=setup({read:url=>[{...order(),...(new URL(url).searchParams.get('stage')==='REGISTER'?{invoice:{status:'REGISTERED',number:'1234567890123'},...patch}:{})}]});
  await env.connection.refresh();const result=await env.connection.registerInvoices([order().hubOrderId]);
  assert.equal(env.calls.some(call=>call.url.endsWith('/tracking')),false);
  assert.notEqual(result.results[0].trackingStatus,'PENDING');
 }
});
test('new IPC methods validate caller, arity, enum and unique current order ids',async()=>{
 const handlers=new Map(),frame={url:'moaon://app/index.html'},calls=[];
 const sender={mainFrame:frame,getURL:()=>frame.url},main={isDestroyed:()=>false,webContents:sender};
 registerConnectionIpc({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getMainWindow:()=>main,connection:{viewChannel:async value=>calls.push(value),registerInvoices:async ids=>calls.push(ids)}});
 const trusted={sender,senderFrame:frame};
 for(const key of ['moaon-hub:view-channel','moaon-hub:register-invoices'])await assert.rejects(()=>handlers.get(key)({sender:{},senderFrame:frame},'ALL'));
 for(const args of [[],['INVALID'],['ALL',true]])await assert.rejects(()=>handlers.get('moaon-hub:view-channel')(trusted,...args));
 for(const args of [[],[[order().hubOrderId,order().hubOrderId]],[[order().hubOrderId],true]])await assert.rejects(()=>handlers.get('moaon-hub:register-invoices')(trusted,...args));
 await handlers.get('moaon-hub:view-channel')(trusted,'CAFE24');await handlers.get('moaon-hub:register-invoices')(trusted,[order().hubOrderId]);
 assert.deepEqual(calls,['CAFE24',[order().hubOrderId]]);
});
