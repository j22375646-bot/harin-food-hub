'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const TEST_SNAPSHOT = '0123456789abcdef'.repeat(4);
test('collection retains Cafe24 partial result across a successful worker GET',async()=>{
 const id='12345678-1234-4123-8123-123456789abc';let poll=false;
 const {connection}=makeConnection(makeRemoteSession(async url=>url.includes('/live-refresh')?Response.json(poll?{ok:true,partial:false,requests:{naver:{id,status:'SUCCESS'}}}:{ok:true,partial:true,cafe24:{status:'PARTIAL',finishedAt:'2026-09-09T00:00:00Z'},requests:{naver:{id,status:'PENDING'}}}):Response.json(makePagePayload())));
 assert.equal((await connection.collectOrders()).channels.cafe24.status,'PARTIAL');poll=true;
 const result=await connection.checkOrderCollection();assert.equal(result.channels.cafe24.status,'PARTIAL');assert.equal(result.status,'CHECK_REQUIRED');assert.equal(result.channels.cafe24.observedAt,'2026-09-09T00:00:00Z');
});
test('collection reauthentication failure never replays an earlier success',async()=>{
 const id='12345678-1234-4123-8123-123456789abc';let auth=true;
 const {connection}=makeConnection(makeRemoteSession(async(url)=>url.includes('/live-refresh')?Response.json({ok:true,cafe24:{status:'SUCCESS'},requests:{naver:{id,status:'SUCCESS'},coupang:{id,status:'SUCCESS'}}}):auth?Response.json(makePagePayload()):new Response('',{status:401})));
 assert.equal((await connection.collectOrders()).status,'SUCCESS');auth=false;
 const checked=await connection.checkOrderCollection();assert.notEqual(checked.status,'SUCCESS');assert.equal(checked.verifiedTerminal,false);assert.equal(checked.channels.cafe24.status,'CHECK_REQUIRED');
});
test('collection rejects auth, invalid IDs/statuses, concurrent calls and uncertain retries; logout discards late data',async()=>{
 const base='https://harin-cafe24-sync.vercel.app/api/orders/live-refresh',id='12345678-1234-4123-8123-123456789abc';
 for(const status of [401,403]){let posts=0;const {connection}=makeConnection(makeRemoteSession(async(_url,o)=>{if(o.method==='POST')posts++;return new Response('',{status});}));assert.equal((await connection.collectOrders()).status,'CHECK_REQUIRED');assert.equal(posts,0);}
 for(const row of [{id:'bad',status:'SUCCESS'},{id,status:'QUEUED'},{id,status:'success'}]){
  let posts=0;const {connection}=makeConnection(makeRemoteSession(async(url)=>{if(url.startsWith(base)){posts++;return Response.json({ok:true,cafe24:{status:'PARTIAL',finishedAt:'2026-09-09T00:00:00Z'},requests:{naver:row}});}return Response.json(makePagePayload());}));
  const result=await connection.collectOrders();assert.equal(result.channels.naver.status,'CHECK_REQUIRED');assert.equal(result.channels.cafe24.status,'PARTIAL');assert.equal(result.verifiedTerminal,false);await connection.collectOrders();assert.equal(posts,1);
 }
 let release,posts=0;const {connection}=makeConnection(makeRemoteSession(async(url)=>{if(url.startsWith(base)){posts++;return new Promise(resolve=>release=resolve);}return Response.json(makePagePayload());}),{timeoutMs:10});
 const pending=connection.collectOrders();assert.equal((await connection.collectOrders()).status,'BUSY');await pending;await connection.collectOrders();assert.equal(posts,1);
 await connection.disconnect();release(Response.json({ok:true,cafe24:{status:'SUCCESS'},requests:{naver:{id,status:'PENDING'}}}));await new Promise(r=>setImmediate(r));assert.equal((await connection.checkOrderCollection()).canCheck,false);
 const next=connection.collectOrders();await new Promise(r=>setImmediate(r));await connection.disconnect();assert.equal((await next).status,'DISCONNECTED');
});
test('collection keeps original requests through page changes and rejects swapped response identity',async()=>{
 const base='https://harin-cafe24-sync.vercel.app/api/orders/live-refresh',id='12345678-1234-4123-8123-123456789abc';let poll=false;
 const {connection}=makeConnection(makeRemoteSession(async(url)=>url.startsWith(base)?Response.json({ok:true,cafe24:{status:'SUCCESS',finishedAt:'bad'},requests:{naver:{id:poll?'12345678-1234-4123-8123-123456789abd':id,status:poll?'SUCCESS':'PENDING'}}}):Response.json(makePagePayload())));
 await connection.collectOrders();await connection.viewActive();poll=true;const result=await connection.checkOrderCollection();assert.equal(result.channels.naver.status,'CHECK_REQUIRED');assert.equal(result.channels.cafe24.observedAt,null);assert.equal(result.canCheck,true);assert.equal(result.verifiedTerminal,false);
});
test('collection is authenticated all-channel POST then original-ID GET with private response projection',async()=>{
 const id='12345678-1234-4123-8123-123456789abc',base='https://harin-cafe24-sync.vercel.app/api/orders/live-refresh';let remote;const calls=[];
 remote=makeRemoteSession(async(url,options)=>{
  if(!url.startsWith(base))return Response.json(makePagePayload());
  calls.push([url,options.method]);assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
  for(const [target,method,wc,expected] of [[url,options.method,0,false],[url,options.method,8,true],[url+'&evil=1',options.method,0,true],[url,options.method==='POST'?'GET':'POST',0,true]]){
   let cancel;remote.beforeRequestHandler({url:target,method,webContentsId:wc},r=>cancel=r.cancel);assert.equal(cancel,expected);
  }
  return Response.json(options.method==='POST'?{ok:true,partial:true,cafe24Error:'failed',requests:{naver:{id,status:'PENDING'}}}:{ok:true,partial:false,requests:{naver:{id,status:'SUCCESS',executed_at:'2026-09-09T01:00:00Z'}},center:{customer:'PRIVATE'}});
 });
 const {connection}=makeConnection(remote);
 const first=await connection.collectOrders();assert.equal(first.status,'PENDING');assert.equal(first.channels.cafe24.status,'CHECK_REQUIRED');
 assert.deepEqual(await connection.collectOrders(),first);
 const last=await connection.checkOrderCollection();assert.equal(last.status,'CHECK_REQUIRED');assert.equal(last.channels.naver.status,'SUCCESS');assert.equal(last.channels.cafe24.status,'CHECK_REQUIRED');
 assert.equal(JSON.stringify(last).includes(id),false);assert.equal(JSON.stringify(last).includes('PRIVATE'),false);
 assert.deepEqual(calls,[[base,'POST'],[base+'?naverRequestId='+id,'GET']]);
});
test('tracking refresh refuses incoherent platform IDs and missing external identity before POST',async()=>{
 for(const changes of [{platform:'COUPANG'},{externalOrderId:''}]){
  const order={...reviewOrder(),invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'},...changes};let posts=0;
  const {connection}=makeConnection(makeRemoteSession(async(url,options)=>{
   if(options.method==='POST'){posts++;return Response.json({ok:true,queued:[{trackingNo:order.invoiceNumber,hubOrderIds:[order.hubOrderId],status:'PENDING'}]},{status:202});}
   return Response.json(makePagePayload({orders:[order]}));
  }));
  await connection.refresh();assert.deepEqual(await connection.refreshTracking(order.hubOrderId),{status:'CHECK_REQUIRED'});assert.equal(posts,0);
 }
});
test('tracking deadline, concurrent refresh and logout cannot dispatch duplicate or late work',async()=>{
 const order={...reviewOrder(),invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}};
 let posts=0,release;
 const remote=makeRemoteSession(async url=>{
  if(url.endsWith('/api/shipping/tracking')){posts++;return new Promise(resolve=>release=resolve);}
  return Response.json(makePagePayload({orders:[order]}));
 });
 const {connection}=makeConnection(remote,{timeoutMs:20});await connection.refresh();
 const first=connection.refreshTracking(order.hubOrderId);
 assert.deepEqual(await connection.refreshTracking(order.hubOrderId),{status:'CHECK_REQUIRED'});
 assert.deepEqual(await first,{status:'CHECK_REQUIRED'});assert.equal(posts,1);
 release(Response.json({ok:true,queued:[]}));
 const second=connection.readTracking(order.hubOrderId);await new Promise(resolve=>setImmediate(resolve));
 await connection.disconnect();assert.deepEqual(await second,{status:'READY',state:{status:'CHECK_REQUIRED',checkedAt:null}});
 release(Response.json({ok:true,states:[{hubOrderId:order.hubOrderId,trackingNo:order.invoiceNumber,status:'SUCCESS',statusCode:'DELIVERED',checkedAt:'2026-09-09T00:00:00Z'}]}));
});
test('tracking refuses missing current evidence, rocket, auth failures and failed stale delivery',async()=>{
 for(const mode of ['rocket','issued','auth','failed','date','missing']){
  const order={...reviewOrder(),fulfillment:mode==='rocket'?'ROCKET_GROWTH':'SELLER',invoiceNumber:'1234567890123',invoice:{status:mode==='issued'?'ISSUED':'REGISTERED',number:'1234567890123'}};
  let initial=true,calls=0;
  const {connection}=makeConnection(makeRemoteSession(async url=>{
   if(url.endsWith('/api/shipping/tracking')){calls++;return Response.json({ok:true,states:mode==='missing'?[]:[{hubOrderId:order.hubOrderId,trackingNo:order.invoiceNumber,status:mode==='failed'?'FAILED':'SUCCESS',statusCode:'DELIVERED',checkedAt:mode==='date'?'bad':'2026-09-09T00:00:00Z'}]});}
   return !initial&&mode==='auth'?new Response('',{status:401}):Response.json(makePagePayload({orders:[order]}));
  }));
  await connection.refresh();initial=false;
  assert.deepEqual(await connection.readTracking(order.hubOrderId),{status:'READY',state:{status:'CHECK_REQUIRED',checkedAt:null}});
  if(['rocket','issued','auth'].includes(mode))assert.equal(calls,0);
 }
});
test('tracking refresh dispatches only selected current invoice after recheck and returns pending',async()=>{
 let order={...reviewOrder(),invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}},posts=0,remote;
 remote=makeRemoteSession(async(url,options)=>{
  if(url.endsWith('/api/shipping/tracking')){
   posts++;assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{orderIds:['HR-C24-1234ABCD'],mode:'manual'});
   for(const [suffix,webContentsId,method,want] of [['',0,'POST',false],['',8,'POST',true],['?all=1',0,'POST',true],['',0,'GET',true]]){
    let cancel;remote.beforeRequestHandler({url:url+suffix,webContentsId,method},value=>cancel=value.cancel);assert.equal(cancel,want);
   }
   return Response.json({ok:true,pending:false,queued:[{trackingNo:'1234567890123',hubOrderIds:[order.hubOrderId],status:'SUCCESS',requestId:'PRIVATE'}]});
  }return Response.json(makePagePayload({orders:[order]}));
 });
 const {connection}=makeConnection(remote);await connection.refresh();assert.equal(typeof connection.refreshTracking,'function');
 assert.deepEqual(await connection.refreshTracking(order.hubOrderId),{status:'PENDING'});
 order={...order,invoice:{status:'REGISTERED',number:'9999999999999'}};
 assert.equal((await connection.refreshTracking(order.hubOrderId)).status,'CHECK_REQUIRED');
 for(const id of ['',[],null,'HR-NV-1234ABCD','HR-CP-FFFFFFFF'])assert.equal((await connection.refreshTracking(id)).status,'CHECK_REQUIRED');
 assert.equal(posts,1);
 let cancel;remote.beforeRequestHandler({url:'https://harin-cafe24-sync.vercel.app/api/shipping/tracking',method:'POST',webContentsId:0},value=>cancel=value.cancel);assert.equal(cancel,true);
});
test('tracking reads bind current invoice and hide queue metadata and stale delivery',async()=>{
 const order={...reviewOrder(),invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}};
 let state={hubOrderId:order.hubOrderId,trackingNo:order.invoiceNumber,status:'SUCCESS',statusCode:'DELIVERED',checkedAt:'2026-09-09T01:00:00.000Z',error:'PRIVATE',events:['PRIVATE']};
 const {connection}=makeConnection(makeRemoteSession(async url=>Response.json(url.endsWith('/api/shipping/tracking')?{ok:true,states:[state]}:makePagePayload({orders:[order]}))));
 await connection.refresh();assert.equal(typeof connection.readTracking,'function');
 assert.deepEqual(await connection.readTracking(order.hubOrderId),{status:'READY',state:{status:'DELIVERED',checkedAt:'2026-09-09T01:00:00.000Z'}});
 for(const statusCode of ['ACCEPTED','NOT_FOUND']){
  state={...state,statusCode};
  assert.deepEqual(await connection.readTracking(order.hubOrderId),{status:'READY',state:{status:'WAITING',checkedAt:'2026-09-09T01:00:00.000Z'}});
 }
 state={...state,statusCode:'DELIVERED'};
 state={...state,status:'QUEUED'};
 assert.deepEqual(await connection.readTracking(order.hubOrderId),{status:'READY',state:{status:'PENDING',checkedAt:null}});
 state={...state,status:'SUCCESS',trackingNo:'9999999999999'};
 assert.deepEqual(await connection.readTracking(order.hubOrderId),{status:'READY',state:{status:'CHECK_REQUIRED',checkedAt:null}});
});
test('server shipping history returns bounded safe statuses over authenticated GET only',async()=>{
 let remote;remote=makeRemoteSession(async(url,options)=>{
  assert.equal(options.method,'GET');
  if(url.endsWith('/api/shipping/actions')){
   let cancel;remote.beforeRequestHandler({url,method:'GET',webContentsId:0},r=>cancel=r.cancel);assert.equal(cancel,false);
   remote.beforeRequestHandler({url,method:'GET',webContentsId:8},r=>cancel=r.cancel);assert.equal(cancel,true);
   return Response.json({ok:true,results:[{hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',status:'QUEUED',invoiceNumber:'1234567890123',error:'PRIVATE',requestId:'PRIVATE'}]});
  }
  return Response.json(makePagePayload());
 });
 const {connection}=makeConnection(remote);await connection.refresh();
 assert.deepEqual(await connection.readServerShippingHistory(),{status:'READY',orders:[{hubOrderId:'HR-CP-1234ABCD',status:'PENDING'}]});
});
test('server history rejects mismatched channel and unauthenticated responses',async()=>{
 let authenticated=true,calls=0;
 const {connection}=makeConnection(makeRemoteSession(async url=>{
  if(url.endsWith('/api/shipping/actions')){calls++;return Response.json({ok:true,results:[{hubOrderId:'HR-CP-1234ABCD',platform:'CAFE24',status:'SUCCESS'}]});}
  return authenticated?Response.json(makePagePayload()):new Response('',{status:401});
 }));
 await connection.refresh();
 assert.deepEqual(await connection.readServerShippingHistory(),{status:'CHECK_REQUIRED',orders:[]});
 authenticated=false;
 assert.deepEqual(await connection.readServerShippingHistory(),{status:'CHECK_REQUIRED',orders:[]});assert.equal(calls,1);
});

test('order lookup limits reads and does not confuse a limit with missing order',async()=>{
 let calls=0;
 const {connection}=makeConnection(makeRemoteSession(async url=>{
  calls++;const offset=Number(new URL(url).searchParams.get('offset')||0);
  return Response.json({ok:true,orders:Array.from({length:20},(_,i)=>({...reviewOrder(),hubOrderId:'HR-C24-'+(offset+i).toString(16).padStart(8,'0').toUpperCase()})),offset,total:500,nextOffset:offset+20,snapshot:TEST_SNAPSHOT,partial:false});
 }));
 assert.equal((await connection.findOrder('HR-C24-FFFFFFFF')).status,'SEARCH_LIMIT');assert.equal(calls,8);
});
test('order lookup discards a response after logout and rejects malformed targets',async()=>{
 let release,calls=0;
 const {connection}=makeConnection(makeRemoteSession(()=>{calls++;return new Promise(resolve=>release=resolve);}));
 assert.equal((await connection.findOrder('../other')).status,'CHECK_REQUIRED');assert.equal(calls,0);
 const pending=connection.findOrder('HR-C24-1234ABCD');await connection.disconnect();
 release(Response.json(makePagePayload()));assert.deepEqual(await pending,{status:'DISCONNECTED'});
});
test('order lookup finds the next page in its own channel using reads only',async()=>{
 const target='HR-CP-1234ABCD';let calls=0;
 const {connection}=makeConnection(makeRemoteSession(async(url,options)=>{
  calls++;assert.equal(options.method,'GET');const params=new URL(url).searchParams;assert.equal(params.get('platform'),'COUPANG');
  const offset=Number(params.get('offset')||0),orders=offset?[{...reviewOrder(),hubOrderId:target,platform:'COUPANG'}]:Array.from({length:20},(_,i)=>({...reviewOrder(),hubOrderId:'HR-CP-'+i.toString(16).padStart(8,'0').toUpperCase()}));
  return Response.json({ok:true,orders,total:21,offset,nextOffset:offset?null:20,snapshot:TEST_SNAPSHOT,partial:false});
 }));
 const result=await connection.findOrder(target);
 assert.equal(result.status,'FOUND');assert.equal(result.page.offset,20);assert.equal(result.page.channel,'COUPANG');assert.equal(calls,2);
});
test('history restoration requires fresh authenticated read and never writes shipping requests',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-restore-'));
 try{
  await require('../shipping-action-journal.cjs').createShippingActionJournal({directory,hubOrderId:'HR-CP-1234ABCD',action:'ISSUE',fingerprint:'a'.repeat(64)}).write({status:'UNKNOWN'});
  let allowed=true;
  const {connection}=makeConnection(makeRemoteSession(async(_url,options)=>{assert.equal(options.method,'GET');return allowed?Response.json(makePagePayload()):new Response('',{status:401});}),{shipmentDirectory:directory});
  await connection.refresh();assert.equal((await connection.restoreShippingHistory()).orders.length,1);
  allowed=false;assert.deepEqual(await connection.restoreShippingHistory(),{status:'CHECK_REQUIRED',orders:[]});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('overview returns only counts and preserves selected order scope',async()=>{
 const remote=makeRemoteSession(async url=>{
  const scope=new URL(url).searchParams.get('stage');
  if(scope==='IN_TRANSIT')return new Response('',{status:503});
  const total=scope==='REGISTER'?0:1;
  return Response.json({ok:true,orders:total?[{hubOrderId:'secret-order'}]:[],total,offset:0,nextOffset:null,snapshot:TEST_SNAPSHOT,partial:scope==='COMPLETED'});
 });
 const {connection}=makeConnection(remote);
 await connection.viewRegistered();
 assert.equal(typeof connection.readOverview,'function');
 const result=await connection.readOverview();
 assert.equal(result.scopes.ACTIVE.total,1);assert.equal(result.scopes.REGISTER.total,0);
 assert.equal(result.scopes.IN_TRANSIT.total,null);assert.equal(result.scopes.COMPLETED.status,'PARTIAL');
 assert.equal(JSON.stringify(result).includes('secret-order'),false);
 assert.equal((await connection.refresh()).scope,'REGISTER');
});
test('overview deadline and logout settle even when fetch ignores abort',async()=>{
 const {connection}=makeConnection(makeRemoteSession(()=>new Promise(()=>{})),{timeoutMs:10});
 assert.deepEqual(await connection.readOverview(),{status:'TIMEOUT',scopes:{}});
 const pending=connection.readOverview();await connection.disconnect();
 assert.deepEqual(await pending,{status:'DISCONNECTED',scopes:{}});
});
test('overview authentication failure discards all counts and duplicate requests share a read',async()=>{
 let calls=0;
 const {connection}=makeConnection(makeRemoteSession(async()=>{calls++;return new Response('',{status:403});}));
 const [a,b]=await Promise.all([connection.readOverview(),connection.readOverview()]);
 assert.deepEqual(a,{status:'FORBIDDEN',scopes:{}});assert.deepEqual(b,a);assert.equal(calls,4);
});

test('business list uses the private session and disconnect discards an in-flight response',async()=>{
 let release;
 const remote=makeRemoteSession(()=>new Promise(resolve=>{release=resolve;}));
 const {connection}=makeConnection(remote);
 assert.equal(typeof connection.listBusinesses,'function');
 const pending=connection.listBusinesses();
 await connection.disconnect();
 release(Response.json({ok:true,businesses:[]}));
 assert.equal((await pending).status,'DISCONNECTED');
});

const reviewOrder=()=>({hubOrderId:'HR-C24-1234ABCD',externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,productName:'시험 상품',cancelled:false,cancellationRequested:false,invoiceNumber:'',issuedInvoiceNumber:'',shippingHistoryStatus:'READY',shippingEligible:true,selectionEligible:true,receiver:{name:'시험',address:'시험 주소',postCode:'12345',contact:'01012345678'}});
test('Coupang delivery uses bound seller shipment and maps safeNumber without exposing raw detail',async()=>{
 const order={...reviewOrder(),hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',shipmentId:'123456789',receiver:null};
 const requestId='12345678-1234-4123-8123-123456789abc';let detailCalls=0,remote;
 remote=makeRemoteSession(async(url,options)=>{
  if(url.includes('/api/orders')||url.includes('/api/moaon/orders'))return Response.json(makePagePayload({orders:[order]}));
  if(url.includes('/coupang/')){
   let cancel;remote.beforeRequestHandler({url,method:'GET',webContentsId:0},r=>cancel=r.cancel);assert.equal(cancel,false);
   remote.beforeRequestHandler({url,method:'GET',webContentsId:8},r=>cancel=r.cancel);assert.equal(cancel,true);
   assert.equal(options.method,'GET');
   if(url.includes('/orders/detail?')){detailCalls++;assert.ok(url.endsWith('shipmentBoxId=123456789'));return Response.json({ok:true,request:{id:requestId}},{status:202});}
   assert.ok(url.endsWith('/operations/'+requestId));return Response.json({ok:true,order:{shipmentBoxId:'123456789',receiver:{name:'시험',address:'가상 주소',safeNumber:'05012345678',secret:'NO'}}});
  }
  return Response.json(makePagePayload({orders:[order]}));
 });
 const {connection}=makeConnection(remote);await connection.refresh();
 const [a,b]=await Promise.all([connection.readDelivery(order.hubOrderId),connection.readDelivery(order.hubOrderId)]);
 assert.equal(a.status,'READY');assert.deepEqual(b,a);assert.equal(a.receiver.contact,'05012345678');assert.equal('secret' in a.receiver,false);assert.equal(detailCalls,1);
});
test('Coupang delivery rejects mismatched shipment, malformed job and non-seller lookup',async()=>{
 for(const mode of ['mismatch','bad-id','rocket']){
  const order={...reviewOrder(),hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',shipmentId:'123',receiver:null,fulfillment:mode==='rocket'?'ROCKET_GROWTH':'SELLER'};let calls=0;
  const {connection}=makeConnection(makeRemoteSession(async url=>{
   if(url.includes('/orders/detail?')){calls++;return Response.json({ok:true,request:{id:mode==='bad-id'?'../../other':'12345678-1234-4123-8123-123456789abc'}},{status:202});}
   if(url.includes('/operations/'))return Response.json({ok:true,order:{shipmentBoxId:'999',receiver:{name:'WRONG',address:'WRONG'}}});
   return Response.json(makePagePayload({orders:[order]}));
  }));
  await connection.refresh();assert.deepEqual(await connection.readDelivery(order.hubOrderId),{status:'CHECK_REQUIRED'});if(mode==='rocket')assert.equal(calls,0);
 }
});
test('Coupang delivery timeout resumes the same job and logout discards late receiver',async()=>{
 const order={...reviewOrder(),hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',shipmentId:'123',receiver:null};let queue=0,ready=false,release;
 const {connection}=makeConnection(makeRemoteSession(async url=>{
  if(url.includes('/orders/detail?')){queue++;return Response.json({ok:true,request:{id:'12345678-1234-4123-8123-123456789abc'}},{status:202});}
  if(url.includes('/operations/'))return ready?Response.json({ok:true,order:{shipmentBoxId:'123',receiver:{name:'시험',address:'가상 주소'}}}):new Promise(resolve=>{release=resolve;});
  return Response.json(makePagePayload({orders:[order]}));
 }),{timeoutMs:20});
 await connection.refresh();assert.equal((await connection.readDelivery(order.hubOrderId)).status,'CHECK_REQUIRED');
 ready=true;assert.equal((await connection.readDelivery(order.hubOrderId)).status,'READY');assert.equal(queue,1);
 ready=false;const pending=connection.readDelivery(order.hubOrderId);await connection.disconnect();
 release(Response.json({ok:true,order:{shipmentBoxId:'123',receiver:{name:'DO NOT DISPLAY',address:'OLD'}}}));
 assert.equal((await pending).status,'DISCONNECTED');
});
test('Coupang server recheck refreshes delivery eligibility without a shipping write',async()=>{
 const receiver={name:'시험',address:'가상 주소',contact:'05012345678',postCode:'12345'};
 const order={...reviewOrder(),hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',shipmentId:'123',receiver:null};let refreshed=false;
 const {connection}=makeConnection(makeRemoteSession(async(url,options)=>{
  assert.equal(options.method,'GET');
  return Response.json(makePagePayload({orders:[{...order,receiver:refreshed?receiver:null}]}));
 }));
 const before=await connection.refresh();assert.equal(before.orders[0].issueAndRegisterEligible,false);
 refreshed=true;const after=await connection.recheckPage();
 assert.equal(after.orders[0].issueAndRegisterEligible,true);assert.equal(after.orders[0].details.receiver.address,'가상 주소');
 refreshed=false;const unavailable=await connection.recheckPage();assert.equal(unavailable.orders[0].issueAndRegisterEligible,false);
});
test('authenticated order read exposes only explicit delivery fields and logout removes them',async()=>{
 const order=reviewOrder();order.receiver={...order.receiver,addressDetail:'가상 101호',message:'문 앞',token:'NEVER_EXPOSE'};
 const {connection}=makeConnection(makeRemoteSession(async()=>Response.json(makePagePayload({orders:[order]}))));
 const result=await connection.refresh();
 assert.deepEqual(result.orders[0].details.receiver,{name:'시험',address:'시험 주소',postCode:'12345',contact:'01012345678',addressDetail:'가상 101호',message:'문 앞'});
 assert.equal(JSON.stringify(result).includes('NEVER_EXPOSE'),false);
 assert.deepEqual((await connection.disconnect()).orders,[]);
});
test('delivery detail fetch binds Cafe24 API to loaded order and discards response after logout',async()=>{
 let release;const order=reviewOrder();delete order.receiver;
 const {connection}=makeConnection(makeRemoteSession(async url=>{
  if(url.includes('/delivery-detail?')){assert.ok(url.endsWith('orderId=TEST-1'));return new Promise(resolve=>{release=resolve;});}
  return Response.json(makePagePayload({orders:[order]}));
 }));
 await connection.refresh();
 assert.equal((await connection.readDelivery('HR-C24-FFFFFFFF')).status,'UNAVAILABLE');
 const pending=connection.readDelivery(order.hubOrderId);await connection.disconnect();
 release(Response.json({ok:true,receiver:{name:'DO NOT DISPLAY'}}));assert.equal((await pending).status,'DISCONNECTED');
});
test('Cafe24 detail reads the exact permitted URL and returns bounded delivery fields',async()=>{
 const order=reviewOrder();delete order.receiver;let remote;
 remote=makeRemoteSession(async(url,options)=>{
  if(!url.includes('/delivery-detail?'))return Response.json(makePagePayload({orders:[order]}));
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  let cancelled;remote.beforeRequestHandler({url,method:'GET',webContentsId:0},r=>cancelled=r.cancel);assert.equal(cancelled,false);
  remote.beforeRequestHandler({url,method:'GET',webContentsId:8},r=>cancelled=r.cancel);assert.equal(cancelled,true);
  remote.beforeRequestHandler({url:url+'&tenant=other',method:'GET',webContentsId:0},r=>cancelled=r.cancel);assert.equal(cancelled,true);
  return Response.json({ok:true,receiver:{name:'시험',address:'가상 주소',message:'m'.repeat(700),token:'NO'}});
 });
 const {connection}=makeConnection(remote);await connection.refresh();const result=await connection.readDelivery(order.hubOrderId);
 assert.equal(result.status,'READY');assert.equal(result.receiver.name,'시험');assert.equal(result.receiver.message.length,500);assert.equal('token' in result.receiver,false);
});
test('label preview requires registered invoice and revalidates private shipping inputs before print',async()=>{
  let order={...reviewOrder(),invoice:{status:'REGISTERED',number:'1234567890123'}},opened;
  const preview={context:()=>({}),close(){},open:async target=>{opened=target;return {status:'PREVIEW_OPEN'};}};
  const {connection}=makeConnection(makeRemoteSession(async(_url,options)=>{assert.equal(options.method,'GET');return Response.json(makePagePayload({orders:[order]}));}),{labelPreview:preview});
  await connection.refresh();assert.equal((await connection.previewLabel(order.hubOrderId)).status,'PREVIEW_OPEN');
  assert.equal(await opened.validate(),true);
  order={...order,receiver:{...order.receiver,address:'changed'}};
  assert.equal(await opened.validate(),false);
  order={...order,invoice:{status:'ISSUED',number:'1234567890123'}};
  assert.equal((await connection.previewLabel(order.hubOrderId)).status,'PRINT_CHECK_REQUIRED');
});
test('native issue confirmation binds authenticated order to durable single POST and result GET',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-host-test-'));
  try{
    const order=reviewOrder(),id='a2345678-1234-4234-8234-123456789012';let posts=0,dialogs=0;
    const remote=makeRemoteSession(async(url,options)=>{
      if(url.includes('/api/epost/issue')){
        let cancelled;remote.beforeRequestHandler({url,method:options.method,webContentsId:0},value=>{cancelled=value.cancel;});assert.equal(cancelled,false);
        if(options.method==='POST'){posts++;assert.deepEqual(JSON.parse(options.body),{confirm:true,orderIds:[order.hubOrderId]});return Response.json({ok:true,results:[{ok:true,hubOrderId:order.hubOrderId,request:{id,status:'PENDING'}}]},{status:202});}
        return Response.json({ok:true,request:{id,hubOrderId:order.hubOrderId,status:'SUCCESS'},result:{trackingNo:'1234567890123'}});
      }
      if(posts&&url.includes('&snapshot='))return Response.json({ok:false},{status:409});
      return Response.json(makePagePayload({orders:[order]}));
    });
    const {connection}=makeConnection(remote,{shipmentDirectory:directory,showShipmentReview:async(_parent,options)=>{dialogs++;assert.equal(options.defaultId,0);assert.ok(options.message.includes('실제'));return {response:1};}});
    await connection.refresh();
    assert.equal((await connection.issueShipment(order.hubOrderId)).status,'PENDING');
    assert.equal((await connection.checkShipment(order.hubOrderId)).status,'SUCCEEDED');
    await connection.refresh();await connection.issueShipment(order.hubOrderId);assert.equal(posts,1);assert.equal(dialogs,1);
    await connection.disconnect();
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('shipment IPC rejects foreign frames, unsupported orders and extra execution arguments',async()=>{
  const handlers=new Map(),frame={url:'moaon://app/index.html'};
  const sender={mainFrame:frame,getURL:()=>frame.url},main={isDestroyed:()=>false,webContents:sender};
  const calls=[];
  registerConnectionIpc({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getMainWindow:()=>main,connection:{issueShipment:async id=>{calls.push(id);return {status:'PENDING'};},checkShipment:async()=>({status:'EMPTY'})}});
  for(const key of ['moaon-hub:issue-shipment','moaon-hub:check-shipment']){
    const handler=handlers.get(key);assert.equal(typeof handler,'function');
    await assert.rejects(()=>handler({sender:{},senderFrame:frame},'HR-C24-1234ABCD'));
    for(const args of [[],['HR-NV-1234ABCD'],['HR-C24-1234ABCD',true],[{id:'HR-C24-1234ABCD'}]])await assert.rejects(()=>handler({sender,senderFrame:frame},...args));
    await handler({sender,senderFrame:frame},'HR-C24-1234ABCD');
  }
  assert.deepEqual(calls,['HR-C24-1234ABCD']);
});
test('cancel, changed order, expired login and disconnect refuse native issue without POST',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  for(const kind of ['cancel','change','receiver','shipment','expired','disconnect','scope']){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-host-test-'));
    try{
      let order=reviewOrder(),expired=false,posts=0;
      const remote=makeRemoteSession(async(_url,options)=>{if(options.method==='POST'){posts++;throw Error('must not send');}return expired?new Response('',{status:401}):Response.json(makePagePayload({orders:[order]}));});
      const {connection}=makeConnection(remote,{shipmentDirectory:directory,showShipmentReview:async()=>{
        if(kind==='change')order={...order,quantity:2};
        if(kind==='receiver')order={...order,receiver:{...order.receiver,address:'CHANGED PRIVATE ADDRESS'}};
        if(kind==='shipment')order={...order,shipmentId:'CHANGED SHIPMENT'};
        if(kind==='expired')expired=true;
        if(kind==='disconnect')await connection.disconnect();
        if(kind==='scope')await connection.viewCompleted();
        return {response:kind==='cancel'?0:1};
      }});
      await connection.refresh();const result=await connection.issueShipment(order.hubOrderId);
      assert.notEqual(result.status,'PENDING',kind);assert.equal(posts,0,kind);
      await connection.disconnect();
    }finally{await fs.rm(directory,{recursive:true,force:true});}
  }
});
test('lost issue response remains unknown on reconnect and cannot send another POST',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-host-test-'));
  try{
    const order=reviewOrder();let posts=0;
    const remote=makeRemoteSession(async(_url,options)=>{if(options.method==='POST'){posts++;throw Error('lost response');}return Response.json(makePagePayload({orders:[order]}));});
    const {connection}=makeConnection(remote,{shipmentDirectory:directory,showShipmentReview:async()=>({response:1})});
    await connection.refresh();assert.equal((await connection.issueShipment(order.hubOrderId)).status,'UNKNOWN');
    await connection.disconnect();await connection.refresh();
    assert.equal((await connection.issueShipment(order.hubOrderId)).status,'UNKNOWN');assert.equal(posts,1);
    await connection.disconnect();
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('shipment network permit cannot authorize login renderer or arbitrary URL and verb',()=>{
  const context={shipmentRequestActive:true,loginWindowActive:true,loginWebContentsId:41};
  const endpoint='https://harin-cafe24-sync.vercel.app/api/epost/issue';
  for(const request of [{url:endpoint,method:'POST',webContentsId:41},{url:endpoint,method:'DELETE',webContentsId:0},{url:endpoint+'?extra=1',method:'POST',webContentsId:0},{url:endpoint+'?requestId=bad',method:'GET',webContentsId:0},{url:'https://example.com/api/epost/issue',method:'POST',webContentsId:0}])assert.equal(isAllowedRemoteRequest(request,context),false);
  assert.equal(isAllowedRemoteRequest({url:endpoint,method:'POST',webContentsId:0},{}),false);
});
test('native review confirms server-read content then rereads without issuing',async()=>{
  let calls=0,dialogs=0;const order=reviewOrder();
  const {connection}=makeConnection(makeRemoteSession(async(_url,options)=>{assert.equal(options.method,'GET');calls++;return new Response(JSON.stringify(makePagePayload({orders:[order]})),{status:200});}),{showShipmentReview:async(_parent,options)=>{dialogs++;assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);assert.ok(options.detail.includes(order.hubOrderId));assert.ok(!options.detail.includes('01012345678'));return {response:1};}});
  await connection.refresh();assert.equal((await connection.confirmShipmentReview(order.hubOrderId)).status,'REVIEW_CONFIRMED');assert.equal(calls,3);assert.equal(dialogs,1);
});
test('native review cancellation and changed order never confirm',async()=>{
  for(const kind of ['cancel','change','disconnect']){
    let order=reviewOrder(),calls=0;
    const {connection}=makeConnection(makeRemoteSession(async()=>{calls++;return new Response(JSON.stringify(makePagePayload({orders:[order]})),{status:200});}),{showShipmentReview:async()=>{
      if(kind==='change')order={...order,quantity:2};
      if(kind==='disconnect')await connection.disconnect();
      return {response:kind==='cancel'?0:1};
    }});
    await connection.refresh();const result=await connection.confirmShipmentReview(order.hubOrderId);
    assert.equal(result.status,kind==='cancel'?'REVIEW_CANCELLED':kind==='change'?'ORDER_CHANGED':'DISCONNECTED');assert.equal(result.order,undefined);
  }
});
test('shipment review rereads authenticated page and returns only matching safe order',async()=>{
  const calls=[];let order=reviewOrder();
  const {connection}=makeConnection(makeRemoteSession(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(makePagePayload({orders:[order]})),{status:200});}));
  await connection.refresh();order={...order,productName:'변경된 상품'};
  const result=await connection.reviewShipment(order.hubOrderId);
  assert.equal(result.status,'REVIEW_ONLY');assert.equal(result.order.productName,'변경된 상품');
  assert.equal(calls[1].url,buildOrdersPageUrl(0,TEST_SNAPSHOT));assert.equal(calls[1].options.credentials,'include');
  assert.equal(result.order.details.receiver.contact,'01012345678');
});
test('shipment review rejects bad identifiers and missing cursor without network calls',async()=>{
  let calls=0;const {connection}=makeConnection(makeRemoteSession(async()=>{calls++;throw Error();}));
  for(const id of ['HR-NV-1234ABCD',['HR-C24-1234ABCD'],null])await assert.rejects(()=>connection.reviewShipment(id));
  assert.equal((await connection.reviewShipment('HR-C24-1234ABCD')).status,'UNAVAILABLE');assert.equal(calls,0);
});
test('shipment review cannot approve cancelled, missing, duplicate or unauthenticated orders',async()=>{
  for(const kind of ['cancelled','missing','duplicate','unauthenticated']){
    let count=0;const order=reviewOrder();
    const {connection}=makeConnection(makeRemoteSession(async()=>{
      count++;if(count>1&&kind==='unauthenticated')return new Response('',{status:401});
      const orders=count===1?[order]:kind==='missing'?[]:kind==='duplicate'?[order,order]:[{...order,cancelled:true}];
      return new Response(JSON.stringify(makePagePayload({orders})),{status:200});
    }));
    await connection.refresh();const result=await connection.reviewShipment(order.hubOrderId);
    assert.notEqual(result.status,'REVIEW_ONLY');assert.equal(result.order,null);
  }
});
test('disconnect while shipment review is reading discards the late order',async()=>{
  let release,count=0;const order=reviewOrder();
  const {connection}=makeConnection(makeRemoteSession(async()=>{if(++count===2)return new Promise(resolve=>{release=resolve;});return new Response(JSON.stringify(makePagePayload({orders:[order]})),{status:200});}));
  await connection.refresh();const pending=connection.reviewShipment(order.hubOrderId);await Promise.resolve();await connection.disconnect();
  release(new Response(JSON.stringify(makePagePayload({orders:[order]})),{status:200}));
  const result=await pending;assert.equal(result.status,'DISCONNECTED');assert.equal(result.order,null);
});

const {
  HARIN_ORIGIN,
  LOGIN_URL,
  ORDERS_URL,
  ORDER_SCOPES,
  READONLY_PARTITION,
  buildOrdersPageUrl,
  isAllowedRemoteRequest,
  isTrustedRenderer,
} = require('../connection-policy.cjs');
const {
  createHubConnection,
  projectOrdersPayload,
  registerConnectionIpc,
} = require('../hub-connection.cjs');

test('remote request policy allows only the fixed login, assets, login POST and main-process order GET', () => {
  const snapshot = 'a'.repeat(64);
  const context = { loginWindowActive: true, loginWebContentsId: 41 };
  const allowed = [
    { method: 'GET', url: LOGIN_URL, webContentsId: 41 },
    { method: 'GET', url: `${LOGIN_URL}?error=invalid&next=%2F`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/_next/static/chunks/login-123.js`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/favicon.ico`, webContentsId: 41 },
    { method: 'POST', url: `${HARIN_ORIGIN}/api/dashboard/login`, webContentsId: 41 },
    { method: 'GET', url: ORDERS_URL, webContentsId: 0 },
    ...['REGISTER', 'IN_TRANSIT', 'COMPLETED'].map((scope) => ({
      method: 'GET',
      url: `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=${scope}&platform=ALL`,
      webContentsId: 0,
    })),
    ...['REGISTER', 'IN_TRANSIT', 'COMPLETED'].map((scope) => ({
      method: 'GET',
      url: buildOrdersPageUrl(20, snapshot, scope),
      webContentsId: 0,
    })),
    { method: 'GET', url: `${ORDERS_URL}&offset=0&snapshot=${snapshot}`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=20&snapshot=${snapshot}`, webContentsId: undefined },
  ];

  for (const request of allowed) {
    assert.equal(isAllowedRemoteRequest(request, context), true, JSON.stringify(request));
  }

  const denied = [
    { method: 'GET', url: `${HARIN_ORIGIN}/`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?platform=ALL&stage=ACTIVE`, webContentsId: 0 },
    { method: 'GET', url: `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=UNKNOWN&platform=ALL`, webContentsId: 0 },
    { method: 'GET', url: `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=ACTIVE&platform=ALL&offset=20`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&snapshot=${snapshot}&offset=20`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=020&snapshot=${snapshot}`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=21&snapshot=${snapshot}`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=${Number.MAX_SAFE_INTEGER + 1}&snapshot=${snapshot}`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=20&snapshot=${snapshot}&offset=40`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=20&snapshot=${snapshot}&extra=1`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=20&snapshot=${'A'.repeat(64)}`, webContentsId: 0 },
    { method: 'GET', url: `${ORDERS_URL}&offset=20&snapshot=${snapshot}#orders`, webContentsId: 0 },
    { method: 'GET', url: `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=ACTIVE&platform=ALL`, webContentsId: 41 },
    { method: 'GET', url: ORDERS_URL, webContentsId: '0' },
    { method: 'POST', url: `${HARIN_ORIGIN}/api/dashboard/login`, webContentsId: 99 },
    { method: 'POST', url: `${HARIN_ORIGIN}/api/dashboard/login`, webContentsId: 41, loginWindowActive: false },
    { method: 'GET', url: `${HARIN_ORIGIN}/_next/static/../server.js`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/api/_next/static/orders`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/login?password=secret`, webContentsId: 41 },
    { method: 'GET', url: `${HARIN_ORIGIN}/login?${'x'.repeat(600)}`, webContentsId: 41 },
    { method: 'GET', url: 'https://user:password@harin-cafe24-sync.vercel.app/login', webContentsId: 41 },
    { method: 'GET', url: 'https://user@harin-cafe24-sync.vercel.app/_next/static/chunks/app.js', webContentsId: 41 },
    { method: 'GET', url: 'https://example.invalid/login', webContentsId: 41 },
    { method: 'PUT', url: LOGIN_URL, webContentsId: 41 },
  ];

  for (const request of denied) {
    const requestContext = request.loginWindowActive === false
      ? { ...context, loginWindowActive: false }
      : context;
    assert.equal(isAllowedRemoteRequest(request, requestContext), false, JSON.stringify(request));
  }
});

test('orders page URL builder emits only canonical bounded cursor URLs', () => {
  const snapshot = '0123456789abcdef'.repeat(4);

  assert.equal(buildOrdersPageUrl(0, snapshot), `${ORDERS_URL}&offset=0&snapshot=${snapshot}`);
  assert.equal(buildOrdersPageUrl(40, snapshot), `${ORDERS_URL}&offset=40&snapshot=${snapshot}`);
  assert.deepEqual(ORDER_SCOPES, ['ACTIVE', 'REGISTER', 'IN_TRANSIT', 'COMPLETED']);
  for (const scope of ORDER_SCOPES) {
    assert.equal(
      buildOrdersPageUrl(20, snapshot, scope),
      `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=${scope}&platform=ALL&offset=20&snapshot=${snapshot}`,
    );
  }
  for (const [offset, cursor] of [
    [-20, snapshot], [1, snapshot], [Number.MAX_SAFE_INTEGER, snapshot], [20, 'A'.repeat(64)], [20, ''],
  ]) {
    assert.throws(() => buildOrdersPageUrl(offset, cursor), /Invalid orders page cursor/);
  }
  for (const scope of ['', 'UNKNOWN', 'active', null, 1]) {
    assert.throws(() => buildOrdersPageUrl(20, snapshot, scope), /Invalid orders scope/);
  }
});

test('IPC sender must be the exact local main frame and fixed app URL', () => {
  const mainFrame = { url: 'moaon://app/index.html' };
  const webContents = { mainFrame, getURL: () => 'moaon://app/index.html' };
  const mainWindow = { isDestroyed: () => false, webContents };

  assert.equal(isTrustedRenderer({ sender: webContents, senderFrame: mainFrame }, mainWindow), true);
  assert.equal(isTrustedRenderer({ sender: { ...webContents }, senderFrame: mainFrame }, mainWindow), false);
  assert.equal(isTrustedRenderer({ sender: webContents, senderFrame: { url: mainFrame.url } }, mainWindow), false);
  assert.equal(isTrustedRenderer({ sender: webContents, senderFrame: { ...mainFrame, url: 'moaon://app/styles.css' } }, mainWindow), false);
  assert.equal(isTrustedRenderer({ sender: webContents, senderFrame: null }, mainWindow), false);
});

test('orders payload is deeply frozen, limited to 20, and excludes non-delivery provider fields', () => {
  const source = Array.from({ length: 20 }, (_, index) => ({
    hubOrderId: `H-${index + 1}`,
    platform: index % 2 ? 'NAVER' : 'CAFE24',
    productName: `상품 ${index + 1}`,
    stage: 'PAID',
    quantity: index === 0 ? '2' : index + 1,
    amount: index === 0 ? null : index * 1000,
    orderedAt: `2026-09-${String(index + 1).padStart(2, '0')}T01:02:03.000Z`,
    receiver: { name: '비공개', address: '비공개' },
    items: [{ imageUrl: 'https://secret.invalid/image.jpg' }],
    token: 'never-return-this',
  }));

  const result = projectOrdersPayload({
    ok: true,
    orders: source,
    total: 21,
    offset: 0,
    nextOffset: 20,
    snapshot: TEST_SNAPSHOT,
    partial: true,
    warning: 'raw provider warning',
    scope: 'UNTRUSTED_SERVER_SCOPE',
  }, '2026-09-08T12:00:00.000Z');

  assert.deepEqual(Object.keys(result), ['status', 'orders', 'total', 'offset', 'hasPrevious', 'hasMore', 'checkedAt', 'partial', 'message', 'scope']);
  assert.equal(result.scope, 'ACTIVE');
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.orders.length, 20);
  assert.equal(result.total, 21);
  assert.equal(result.offset, 0);
  assert.equal(result.hasPrevious, false);
  assert.equal(result.hasMore, true);
  assert.equal(result.checkedAt, '2026-09-08T12:00:00.000Z');
  assert.equal(result.partial, true);
  assert.equal(result.message, '일부 채널 자료를 확인하지 못했습니다. 표시된 저장 주문만 확인하세요.');
  assert.deepEqual(result.orders[0], {
    hubOrderId: 'H-1',
    platform: 'CAFE24',
    productName: '상품 1',
    stage: 'PAID',
    quantity: null,
    amount: null,
    orderedAt: '2026-09-01T01:02:03.000Z',
    registrationEligible: false,
    issueAndRegisterEligible: false,
    details: {externalOrderId:'',receiver:{name:'비공개',address:'비공개',contact:'',postCode:'',addressDetail:'',message:''},items:[{name:'',option:'',quantity:null}],invoice:null,delivery:null,cancelled:null,cancellationRequested:null},
    preflight: {status:'CHECK_REQUIRED',route:'HUB',codes:['ROUTE_UNKNOWN','CANCEL_UNKNOWN','INVOICE_UNKNOWN','ORDER_ID','HISTORY_UNAVAILABLE','SERVER_CHECK','DELIVERY_INFO','QUANTITY','PARTIAL']},
  });
  assert.equal(Object.isFrozen(result.orders[0].details.receiver), true);
  assert.equal(JSON.stringify(result).includes('never-return-this'), false);
  assert.equal(JSON.stringify(result).includes('raw provider warning'), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.orders), true);
  assert.equal(Object.isFrozen(result.orders[0]), true);
});

test('malformed successful payloads fail closed rather than claiming zero orders', () => {
  for (const payload of [null, {}, { ok: true }, { ok: true, orders: [], total: '0', nextOffset: null }]) {
    assert.throws(() => projectOrdersPayload(payload, '2026-09-08T12:00:00.000Z'), /Invalid orders payload/);
  }
});

test('orders payload rejects inconsistent paging metadata and an unexpected navigation snapshot', () => {
  const base = {
    ok: true,
    orders: [{ hubOrderId: 'H-21' }],
    total: 45,
    offset: 20,
    nextOffset: 40,
    snapshot: TEST_SNAPSHOT,
    partial: false,
  };
  const invalid = [
    { ...base, offset: 21 },
    { ...base, nextOffset: 20 },
    { ...base, nextOffset: 60 },
    { ...base, total: 20 },
    { ...base, orders: Array.from({ length: 21 }, () => ({})) },
    { ...base, snapshot: 'A'.repeat(64) },
  ];

  for (const payload of invalid) {
    assert.throws(() => projectOrdersPayload(payload, '2026-09-08T12:00:00.000Z', {
      requestedOffset: 20,
      expectedSnapshot: TEST_SNAPSHOT,
    }), /Invalid orders payload/);
  }
  assert.throws(() => projectOrdersPayload({ ...base, snapshot: 'f'.repeat(64) }, '2026-09-08T12:00:00.000Z', {
    requestedOffset: 20,
    expectedSnapshot: TEST_SNAPSHOT,
  }), /Invalid orders payload/);
  for (const snapshot of [[TEST_SNAPSHOT], { value: TEST_SNAPSHOT }, 123]) {
    assert.throws(() => projectOrdersPayload({
      ...makePagePayload({ orders: [{ hubOrderId: 'H-1' }], total: 1 }),
      snapshot,
    }, '2026-09-08T12:00:00.000Z'), /Invalid orders payload/);
  }
});

test('non-string snapshots fail refresh closed, invalidate the cursor, and block a later next-page fetch', async () => {
  for (const snapshot of [[TEST_SNAPSHOT], { value: TEST_SNAPSHOT }, 123]) {
    let fetchCount = 0;
    const remoteSession = makeRemoteSession(async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response(JSON.stringify(makePagePayload({
          orders: Array.from({ length: 20 }, () => ({})),
          total: 21,
        })), { status: 200 });
      }
      return new Response(JSON.stringify({
        ...makePagePayload({ orders: Array.from({ length: 20 }, () => ({})), total: 21 }),
        snapshot,
      }), { status: 200 });
    });
    const { connection } = makeConnection(remoteSession);

    assert.equal((await connection.refresh()).status, 'READY');
    assert.equal((await connection.refresh()).status, 'UNAVAILABLE');
    assert.equal((await connection.nextPage()).status, 'UNAVAILABLE');
    assert.equal(fetchCount, 2);
  }
});

test('refresh uses fixed fetch options and maps partial data while retaining no raw response', async () => {
  const fetchCalls = [];
  const remoteSession = makeRemoteSession(async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response(JSON.stringify({
      ...makePagePayload({
      orders: [{ hubOrderId: 'H-1', platform: 'NAVER', productName: '김', stage: 'PAID', quantity: 1, amount: null, orderedAt: null, receiver: { name: 'PII' } }],
      total: 21,
      nextOffset: 20,
      partial: true,
      }),
      warning: 'provider detail',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const { connection, sessionModule } = makeConnection(remoteSession);

  const result = await connection.refresh();

  assert.equal(sessionModule.calls[0].partition, READONLY_PARTITION);
  assert.equal(READONLY_PARTITION, 'persist:moaon-harin-readonly');
  assert.deepEqual(sessionModule.calls[0].options, { cache: false });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, ORDERS_URL);
  assert.equal(fetchCalls[0].options.method, 'GET');
  assert.equal(fetchCalls[0].options.credentials, 'include');
  assert.equal(fetchCalls[0].options.cache, 'no-store');
  assert.equal(fetchCalls[0].options.redirect, 'error');
  assert.ok(fetchCalls[0].options.signal instanceof AbortSignal);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.orders[0].amount, null);
  assert.equal(result.orders[0].details.receiver.name, 'PII');
});

test('page actions fetch exactly 20 plus 20 plus 5 rows, move backward, stop at bounds, and refresh from page one', async () => {
  const fetchUrls = [];
  const remoteSession = makeRemoteSession(async (url) => {
    fetchUrls.push(url);
    const offset = url === ORDERS_URL ? 0 : Number(new URL(url).searchParams.get('offset'));
    const count = offset === 40 ? 5 : 20;
    return new Response(JSON.stringify(makePagePayload({
      orders: Array.from({ length: count }, (_, index) => ({ hubOrderId: `H-${offset + index + 1}` })),
      total: 45,
      offset,
      nextOffset: offset < 40 ? offset + 20 : null,
    })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);

  const first = await connection.refresh();
  const second = await connection.nextPage();
  const third = await connection.nextPage();
  const atEnd = await connection.nextPage();
  const previous = await connection.previousPage();
  const refreshed = await connection.refresh();

  assert.deepEqual([first.offset, second.offset, third.offset, previous.offset, refreshed.offset], [0, 20, 40, 20, 0]);
  assert.deepEqual([first.orders.length, second.orders.length, third.orders.length], [20, 20, 5]);
  assert.deepEqual([first.hasPrevious, second.hasPrevious, third.hasMore], [false, true, false]);
  assert.equal(atEnd.status, 'UNAVAILABLE');
  assert.deepEqual(fetchUrls, [
    ORDERS_URL,
    buildOrdersPageUrl(20, TEST_SNAPSHOT),
    buildOrdersPageUrl(40, TEST_SNAPSHOT),
    buildOrdersPageUrl(20, TEST_SNAPSHOT),
    ORDERS_URL,
  ]);
});

test('scope actions reset paging and refresh, next, and previous stay on the selected trusted scope', async () => {
  const fetchUrls = [];
  const remoteSession = makeRemoteSession(async (url) => {
    fetchUrls.push(url);
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get('offset') || 0);
    return new Response(JSON.stringify(makePagePayload({
      orders: Array.from({ length: 20 }, (_, index) => ({ hubOrderId: `R-${offset + index + 1}` })),
      total: 45,
      offset,
      nextOffset: offset < 40 ? offset + 20 : null,
    })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);

  const registered = await connection.viewRegistered();
  const next = await connection.nextPage();
  const previous = await connection.previousPage();
  const refreshed = await connection.refresh();

  assert.deepEqual([registered.scope, next.scope, previous.scope, refreshed.scope], ['REGISTER', 'REGISTER', 'REGISTER', 'REGISTER']);
  assert.deepEqual(fetchUrls, [
    `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=REGISTER&platform=ALL`,
    buildOrdersPageUrl(20, TEST_SNAPSHOT, 'REGISTER'),
    buildOrdersPageUrl(0, TEST_SNAPSHOT, 'REGISTER'),
    `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=REGISTER&platform=ALL`,
  ]);
});

test('scope switch detaches an abort-ignoring old read and a delayed old response cannot replace the new cursor', async () => {
  const registeredSnapshot = 'b'.repeat(64);
  let releaseActive;
  const urls = [];
  const remoteSession = makeRemoteSession(async (url) => {
    urls.push(url);
    if (urls.length === 1) return new Promise((resolve) => { releaseActive = resolve; });
    const offset = Number(new URL(url).searchParams.get('offset') || 0);
    return new Response(JSON.stringify(makePagePayload({
      orders: Array.from({ length: offset ? 1 : 20 }, () => ({ hubOrderId: offset ? 'REGISTER-21' : 'REGISTER' })),
      total: 21,
      offset,
      snapshot: registeredSnapshot,
    })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);

  const oldRead = connection.refresh();
  await Promise.resolve();
  const registered = await connection.viewRegistered();
  releaseActive(new Response(JSON.stringify(makePagePayload({ orders: [{ hubOrderId: 'STALE' }] })), { status: 200 }));
  const stale = await oldRead;
  const next = await connection.nextPage();

  assert.equal(registered.scope, 'REGISTER');
  assert.equal(stale.status, 'DISCONNECTED');
  assert.equal(next.orders[0].hubOrderId, 'REGISTER-21');
  assert.equal(urls[2], buildOrdersPageUrl(20, registeredSnapshot, 'REGISTER'));
});

test('failed selected-scope read retries that scope from page one and disconnect resets selection to ACTIVE', async () => {
  const urls = [];
  let status = 500;
  const remoteSession = makeRemoteSession(async (url) => {
    urls.push(url);
    if (status !== 200) return new Response('', { status });
    return new Response(JSON.stringify(makePagePayload({ orders: [{ hubOrderId: 'OK' }] })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);

  assert.equal((await connection.viewCompleted()).status, 'UNAVAILABLE');
  await new Promise(resolve => setImmediate(resolve));
  status = 200;
  assert.equal((await connection.refresh()).scope, 'COMPLETED');
  await connection.disconnect();
  assert.equal((await connection.refresh()).scope, 'ACTIVE');
  assert.deepEqual(urls, [
    `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=COMPLETED&platform=ALL`,
    `${HARIN_ORIGIN}/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=COMPLETED&platform=ALL`,
    ORDERS_URL,
  ]);
});

test('a scope action blocked during disconnect cannot replace the ACTIVE reset', async () => {
  const urls = [];
  let releaseClear;
  const remoteSession = makeRemoteSession(async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(makePagePayload({ orders: [{ hubOrderId: 'OK' }] })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);
  await connection.viewRegistered();
  remoteSession.clearStorageData = () => new Promise((resolve) => { releaseClear = resolve; });

  const disconnecting = connection.disconnect();
  assert.equal((await connection.viewCompleted()).status, 'UNAVAILABLE');
  await new Promise(resolve => setImmediate(resolve));
  releaseClear();
  await disconnecting;
  assert.equal((await connection.refresh()).scope, 'ACTIVE');
  assert.equal(urls.at(-1), ORDERS_URL);
});

test('snapshot change and authorization failures invalidate page navigation until a fresh first-page read', async () => {
  const responses = [
    new Response(JSON.stringify(makePagePayload({ orders: Array.from({ length: 20 }, (_, index) => ({ hubOrderId: `A-${index}` })), total: 45 })), { status: 200 }),
    new Response('', { status: 409 }),
    new Response(JSON.stringify(makePagePayload({ orders: Array.from({ length: 20 }, (_, index) => ({ hubOrderId: `B-${index}` })), total: 45 })), { status: 200 }),
    new Response('', { status: 401 }),
  ];
  let fetchCount = 0;
  const { connection } = makeConnection(makeRemoteSession(async () => responses[fetchCount++]));

  await connection.refresh();
  const changed = await connection.nextPage();
  const blockedAfterChange = await connection.nextPage();
  await connection.refresh();
  const unauthorized = await connection.nextPage();
  const blockedAfterAuth = await connection.previousPage();

  assert.equal(changed.status, 'SNAPSHOT_CHANGED');
  assert.equal(changed.message, '주문 목록이 변경되었습니다. 첫 페이지를 다시 조회하세요.');
  assert.equal(blockedAfterChange.status, 'UNAVAILABLE');
  assert.equal(unauthorized.status, 'LOGIN_REQUIRED');
  assert.equal(blockedAfterAuth.status, 'UNAVAILABLE');
  assert.equal(fetchCount, 4);
});

test('duplicate pending navigation shares one operation and issues one page request', async () => {
  let releaseNext;
  let fetchCount = 0;
  const remoteSession = makeRemoteSession(async () => {
    fetchCount += 1;
    if (fetchCount === 1) return new Response(JSON.stringify(makePagePayload({ orders: Array.from({ length: 20 }, () => ({})), total: 21 })), { status: 200 });
    return new Promise((resolve) => { releaseNext = () => resolve(new Response(JSON.stringify(makePagePayload({ orders: [{}], total: 21, offset: 20 })), { status: 200 })); });
  });
  const { connection } = makeConnection(remoteSession);
  await connection.refresh();

  const first = connection.nextPage();
  const duplicate = connection.nextPage();
  assert.equal(first, duplicate);
  assert.equal(fetchCount, 2);
  releaseNext();
  assert.equal((await first).offset, 20);
});

test('disconnect detaches an abort-ignoring old read so a fresh read wins and keeps its cursor', async () => {
  const freshSnapshot = 'f'.repeat(64);
  let releaseOld;
  let fetchCount = 0;
  const urls = [];
  const remoteSession = makeRemoteSession(async (url) => {
    urls.push(url);
    fetchCount += 1;
    if (fetchCount === 1) return new Promise((resolve) => { releaseOld = resolve; });
    if (fetchCount === 2) return new Response(JSON.stringify(makePagePayload({ orders: Array.from({ length: 20 }, () => ({ hubOrderId: 'FRESH' })), total: 21, snapshot: freshSnapshot })), { status: 200 });
    return new Response(JSON.stringify(makePagePayload({ orders: [{ hubOrderId: 'FRESH-21' }], total: 21, offset: 20, snapshot: freshSnapshot })), { status: 200 });
  });
  const { connection } = makeConnection(remoteSession);
  const oldRead = connection.refresh();
  await Promise.resolve();
  await connection.disconnect();

  const fresh = await connection.refresh();
  releaseOld(new Response(JSON.stringify(makePagePayload({ orders: [{ hubOrderId: 'STALE' }] })), { status: 200 }));
  const stale = await oldRead;
  const next = await connection.nextPage();

  assert.equal(fresh.orders[0].hubOrderId, 'FRESH');
  assert.equal(stale.status, 'DISCONNECTED');
  assert.equal(next.orders[0].hubOrderId, 'FRESH-21');
  assert.equal(urls[2], buildOrdersPageUrl(20, freshSnapshot));
});

test('remote session observes every URL so an external-origin request reaches the deny policy', async () => {
  const remoteSession = makeRemoteSession(async () => new Response(JSON.stringify(makePagePayload()), { status: 200 }));
  const { connection } = makeConnection(remoteSession);
  await connection.refresh();

  assert.deepEqual(remoteSession.beforeRequestFilter, { urls: ['<all_urls>'] });
  let decision;
  remoteSession.beforeRequestHandler({
    method: 'GET',
    url: 'https://example.invalid/tracker.js',
    webContentsId: 41,
  }, (result) => { decision = result; });
  assert.deepEqual(decision, { cancel: true });
});

test('authorization failures return safe empty state and never reuse prior orders', async () => {
  let response = new Response(JSON.stringify(makePagePayload({
    orders: [{ hubOrderId: 'H-1', platform: 'NAVER', productName: '김', stage: 'PAID', quantity: 1, amount: 1000, orderedAt: null }],
    total: 1,
  })), { status: 200 });
  const remoteSession = makeRemoteSession(async () => response);
  const { connection } = makeConnection(remoteSession);
  assert.equal((await connection.refresh()).orders.length, 1);

  response = new Response('', { status: 401 });
  const unauthorized = await connection.refresh();

  assert.equal(unauthorized.status, 'LOGIN_REQUIRED');
  assert.deepEqual(unauthorized.orders, []);
  assert.equal(unauthorized.total, null);
  assert.equal(unauthorized.hasMore, null);
  assert.equal(unauthorized.checkedAt, null);
});

test('forbidden, unavailable, oversized, and invalid JSON responses map to fixed safe statuses', async () => {
  const cases = [
    [new Response('', { status: 403 }), 'FORBIDDEN'],
    [new Response('', { status: 502 }), 'UNAVAILABLE'],
    [new Response('x'.repeat(5 * 1024 * 1024 + 1), { status: 200 }), 'UNAVAILABLE'],
    [new Response('{not json', { status: 200 }), 'UNAVAILABLE'],
  ];

  for (const [response, expectedStatus] of cases) {
    const { connection } = makeConnection(makeRemoteSession(async () => response));
    const result = await connection.refresh();
    assert.equal(result.status, expectedStatus);
    assert.deepEqual(result.orders, []);
  }
});

test('timeout aborts a read and returns unavailable without exposing the thrown error', async () => {
  const remoteSession = makeRemoteSession((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('secret timeout detail')), { once: true });
  }));
  const { connection } = makeConnection(remoteSession, { timeoutMs: 5 });

  const result = await connection.refresh();

  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('secret timeout detail'), false);
});

test('disconnect aborts the read, clears the ephemeral session, and late completion stays disconnected', async () => {
  let finishFetch;
  const remoteSession = makeRemoteSession(() => new Promise((resolve) => {
    finishFetch = resolve;
  }));
  const { connection } = makeConnection(remoteSession);
  const pending = connection.refresh();
  await Promise.resolve();

  const disconnected = await connection.disconnect();
  finishFetch(new Response(JSON.stringify(makePagePayload({
    orders: [{ hubOrderId: 'LATE', platform: 'NAVER', productName: '늦은 자료', stage: 'PAID', quantity: 1, amount: 1, orderedAt: null }],
    total: 1,
  })), { status: 200 }));
  const late = await pending;

  assert.equal(disconnected.status, 'DISCONNECTED');
  assert.equal(late.status, 'DISCONNECTED');
  assert.deepEqual(late.orders, []);
  assert.equal(remoteSession.clearStorageDataCalls, 1);
  assert.equal(remoteSession.clearCacheCalls, 1);
  assert.equal(remoteSession.clearAuthCacheCalls, 1);
});

test('disconnect gates new reads until session clearing finishes', async () => {
  let releaseClear;
  let fetchCount = 0;
  const remoteSession = makeRemoteSession(async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(makePagePayload()), { status: 200 });
  });
  remoteSession.clearStorageData = () => new Promise((resolve) => { releaseClear = resolve; });
  const { connection } = makeConnection(remoteSession);
  await connection.refresh();
  fetchCount = 0;

  const disconnecting = connection.disconnect();
  const blockedRead = await connection.refresh();
  assert.equal(blockedRead.status, 'UNAVAILABLE');
  assert.equal(fetchCount, 0);
  await new Promise(resolve => setImmediate(resolve));
  releaseClear();
  assert.equal((await disconnecting).status, 'DISCONNECTED');
});

test('failed session clearing blocks cookie reuse', async () => {
  let fetchCount = 0;
  const remoteSession = makeRemoteSession(async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(makePagePayload()), { status: 200 });
  });
  remoteSession.clearStorageData = () => { throw new Error('sensitive clear failure detail'); };
  const { connection } = makeConnection(remoteSession);
  await connection.refresh();
  fetchCount = 0;

  const failedDisconnect = await connection.disconnect();
  const blockedRead = await connection.refresh();

  assert.equal(failedDisconnect.status, 'UNAVAILABLE');
  assert.equal(blockedRead.status, 'UNAVAILABLE');
  assert.equal(fetchCount, 0);
  assert.equal(JSON.stringify(failedDisconnect).includes('sensitive clear failure detail'), false);
});

test('disconnecting an open login invalidates its late cancellation result', async () => {
  const remoteSession = makeRemoteSession(async () => new Response('', { status: 401 }));
  const { connection } = makeConnection(remoteSession);

  const pendingLogin = connection.connect();
  const disconnected = await connection.disconnect();
  const lateLogin = await pendingLogin;

  assert.equal(disconnected.status, 'DISCONNECTED');
  assert.equal(lateLogin.status, 'DISCONNECTED');
  assert.deepEqual(lateLogin.orders, []);
});

test('login cancellation and main-frame load failure return distinct safe results', async () => {
  const cancelledFixture = makeConnection(makeRemoteSession(async () => new Response('', { status: 401 })));
  const cancelledLogin = cancelledFixture.connection.connect();
  cancelledFixture.browserWindows[0].close();
  const cancelled = await cancelledLogin;

  const failedFixture = makeConnection(makeRemoteSession(async () => new Response('', { status: 401 })));
  const failedLogin = failedFixture.connection.connect();
  const failedWindow = failedFixture.browserWindows[0];
  failedWindow.blockClose = true;
  failedWindow.webContents.emit('did-fail-load', {}, -105, 'network unavailable', LOGIN_URL, true);
  const failed = await Promise.race([
    failedLogin,
    new Promise((resolve) => setTimeout(() => resolve({ status: 'TIMED_OUT' }), 20)),
  ]);

  assert.equal(cancelled.status, 'LOGIN_REQUIRED');
  assert.equal(cancelled.message, '하린식품 로그인이 취소되었습니다.');
  assert.equal(failedWindow.isDestroyed(), true);
  assert.equal(failed.status, 'UNAVAILABLE');
  assert.equal(failed.message, '하린식품 로그인 화면을 열지 못했습니다.');
});

test('rejected login load destroys a close-blocked child and settles the pending connect', async () => {
  const fixture = makeConnection(makeRemoteSession(async () => new Response('', { status: 401 })), {
    loadURL: async (window) => {
      window.blockClose = true;
      throw new Error('private load error');
    },
  });

  const result = await Promise.race([
    fixture.connection.connect(),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'TIMED_OUT' }), 20)),
  ]);

  assert.equal(fixture.browserWindows[0].isDestroyed(), true);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('private load error'), false);
});

test('native login form navigation allows only the exact submission endpoint', async () => {
  const fixture = makeConnection(makeRemoteSession(async () => new Response('', { status: 401 })));
  const pending = fixture.connection.connect();
  const window = fixture.browserWindows[0];
  try {
    for (const [target, expectedBlocked] of [
      [`${HARIN_ORIGIN}/api/dashboard/login`, false],
      [`${HARIN_ORIGIN}/api/dashboard/login?next=/`, true],
      [`${HARIN_ORIGIN}/api/dashboard/login#x`, true],
      [`${HARIN_ORIGIN}/api/dashboard/login/`, true],
      ['https://example.invalid/api/dashboard/login', true],
      [`${HARIN_ORIGIN}/orders`, true],
    ]) {
      let blocked = false;
      window.webContents.emit('will-navigate', { preventDefault() { blocked = true; } }, target);
      assert.equal(blocked, expectedBlocked, target);
    }
  } finally {
    window.close();
    await pending;
  }
});

test('superseded initial login load does not close an allowed form navigation', async () => {
  let rejectLoad;
  const fixture = makeConnection(makeRemoteSession(async () => new Response('', {status:401})), {
    loadURL: () => new Promise((_, reject) => { rejectLoad = reject; }),
  });
  const pending = fixture.connection.connect();
  const child = fixture.browserWindows[0];
  child.webContents.emit('will-navigate', {preventDefault(){throw new Error('form blocked');}}, `${HARIN_ORIGIN}/api/dashboard/login`);
  rejectLoad(Object.assign(new Error('aborted initial navigation'), {code:'ERR_ABORTED',errno:-3}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(child.isDestroyed(),false,'initial load cancellation must not destroy submitted login');
  child.close();
  assert.equal((await pending).status,'LOGIN_REQUIRED');
});

test('initial abort without form navigation and real load errors still fail closed', async () => {
  for(const [submit,code,errno] of [[false,'ERR_ABORTED',-3],[true,'ERR_NAME_NOT_RESOLVED',-105]]) {
    let rejectLoad;
    const fixture = makeConnection(makeRemoteSession(async()=>new Response('',{status:401})), {loadURL:()=>new Promise((_,reject)=>{rejectLoad=reject;})});
    const pending = fixture.connection.connect();
    const child=fixture.browserWindows[0];
    if(submit) child.webContents.emit('will-navigate',{preventDefault(){}},`${HARIN_ORIGIN}/api/dashboard/login`);
    rejectLoad(Object.assign(new Error('private error'),{code,errno}));
    assert.equal((await pending).status,'UNAVAILABLE');
    assert.equal(child.isDestroyed(),true);
  }
});

test('an intercepted root redirect closes login and verifies authorization with a fresh order GET', async () => {
  let fetchCount = 0;
  const remoteSession = makeRemoteSession(async () => {
    fetchCount += 1;
    return new Response(JSON.stringify(makePagePayload({
      orders: [{ hubOrderId: 'SYNTHETIC-1', platform: 'CAFE24', productName: '검증용 상품', stage: 'PAID', quantity: 2, amount: null, orderedAt: null }],
      total: 21,
      nextOffset: 20,
      partial: true,
    })), { status: 200 });
  });
  const { connection, browserWindows } = makeConnection(remoteSession);
  const pendingLogin = connection.connect();
  const loginWindow = browserWindows[0];
  loginWindow.blockClose = true;
  let prevented = false;

  loginWindow.webContents.emit('will-redirect', { preventDefault: () => { prevented = true; } }, `${HARIN_ORIGIN}/`);
  const result = await Promise.race([
    pendingLogin,
    new Promise((resolve) => setTimeout(() => resolve({ status: 'TIMED_OUT' }), 20)),
  ]);

  assert.equal(prevented, true);
  assert.equal(loginWindow.isDestroyed(), true);
  assert.equal(fetchCount, 1);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.orders[0].productName, '검증용 상품');
});

test('IPC registration rejects arguments and untrusted senders before dispatching fixed methods', async () => {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const mainFrame = { url: 'moaon://app/index.html' };
  const webContents = { mainFrame, getURL: () => mainFrame.url };
  const mainWindow = { isDestroyed: () => false, webContents };
  const calls = [];
  const connection = {
    listBusinesses: async()=>({status:'READY',businesses:[]}),
    connect: async () => calls.push('connect') && { status: 'LOGIN_OPEN' },
    refresh: async () => calls.push('refresh') && { status: 'READY' },
    recheckPage: async () => calls.push('recheckPage') && { status: 'READY' },
    nextPage: async () => calls.push('nextPage') && { status: 'READY' },
    previousPage: async () => calls.push('previousPage') && { status: 'READY' },
    viewActive: async () => calls.push('viewActive') && { status: 'READY' },
    viewRegistered: async () => calls.push('viewRegistered') && { status: 'READY' },
    viewInTransit: async () => calls.push('viewInTransit') && { status: 'READY' },
    viewCompleted: async () => calls.push('viewCompleted') && { status: 'READY' },
    disconnect: async () => calls.push('disconnect') && { status: 'DISCONNECTED' },
  };
  registerConnectionIpc({ ipcMain, getMainWindow: () => mainWindow, connection });
  const trusted = { sender: webContents, senderFrame: mainFrame };
  for(const channel of ['moaon-hub:collect-orders','moaon-hub:check-order-collection']){
    await assert.rejects(handlers.get(channel)({sender:{},senderFrame:null}),/Untrusted renderer/);
    for(const argument of ['https://evil.invalid','12345678-1234-4123-8123-123456789abc',{},null])await assert.rejects(handlers.get(channel)(trusted,argument),/Arguments are not allowed/);
  }

  for(const channel of ['moaon-hub:read-tracking','moaon-hub:refresh-tracking']){
    assert.equal(typeof handlers.get(channel),'function');
    await assert.rejects(handlers.get(channel)({sender:{},senderFrame:null},'HR-C24-1234ABCD'),/Untrusted renderer/);
    for(const args of [[],[''],[[]],['HR-C24-1234ABCD',{invoice:'1234567890123'}]])await assert.rejects(handlers.get(channel)(trusted,...args),/Invalid tracking/);
  }

  assert.deepEqual([...handlers.keys()], ['moaon-hub:read-tracking','moaon-hub:refresh-tracking','moaon-hub:read-delivery','moaon-hub:preview-worklist','moaon-hub:preview-labels','moaon-hub:export-selected-csv','moaon-hub:issue-and-register','moaon-hub:view-channel','moaon-hub:register-invoices','moaon-hub:find-order','moaon-hub:preview-label','moaon-hub:issue-shipment','moaon-hub:check-shipment','moaon-hub:confirm-shipment-review','moaon-hub:collect-orders','moaon-hub:check-order-collection','moaon-hub:server-shipping-history','moaon-hub:restore-shipping-history','moaon-hub:read-overview','moaon-hub:list-businesses','moaon-hub:connect', 'moaon-hub:refresh', 'moaon-hub:recheck-page', 'moaon-hub:next-page', 'moaon-hub:previous-page', 'moaon-hub:view-active', 'moaon-hub:view-registered', 'moaon-hub:view-in-transit', 'moaon-hub:view-completed', 'moaon-hub:disconnect']);
  for(const channel of ['moaon-hub:preview-labels','moaon-hub:export-selected-csv']){
    await assert.rejects(handlers.get(channel)({sender:{},senderFrame:null},['HR-C24-1234ABCD']),/Untrusted renderer/);
    for(const args of [[],[[]],[['bad']],[['HR-C24-1234ABCD','HR-C24-1234ABCD']],[['HR-C24-1234ABCD'],'evil.csv']])await assert.rejects(handlers.get(channel)(trusted,...args),/Invalid document/);
  }
  await assert.rejects(handlers.get('moaon-hub:restore-shipping-history')({sender:{},senderFrame:null}),/Untrusted renderer/);
  await assert.rejects(handlers.get('moaon-hub:restore-shipping-history')(trusted,'other-business'),/Arguments are not allowed/);
  const deliveryHandler=handlers.get('moaon-hub:read-delivery');
  await assert.rejects(deliveryHandler({sender:{},senderFrame:null},'HR-C24-1234ABCD'),/Untrusted renderer/);
  for(const args of [[],['https://other.invalid'],['HR-C24-1234ABCD','other-tenant']])await assert.rejects(deliveryHandler(trusted,...args),/Invalid delivery/);
  const businessHandler=handlers.get('moaon-hub:list-businesses');
  await assert.rejects(handlers.get('moaon-hub:read-overview')({sender:{},senderFrame:null}),/Untrusted renderer/);
  assert.deepEqual(await businessHandler(trusted),{status:'READY',businesses:[]});
  await assert.rejects(businessHandler(trusted,'tenant-id'),/Arguments are not allowed/);
  await assert.rejects(businessHandler({sender:{},senderFrame:null}),/Untrusted renderer/);
  const confirmHandler=handlers.get('moaon-hub:confirm-shipment-review');
  await assert.rejects(confirmHandler({sender:{},senderFrame:null},'HR-C24-1234ABCD'),/Untrusted renderer/);
  for(const args of [[],['HR-NV-1234ABCD'],[['HR-C24-1234ABCD']],['HR-C24-1234ABCD',true]])await assert.rejects(confirmHandler(trusted,...args),/Invalid review arguments/);
  await assert.rejects(handlers.get('moaon-hub:recheck-page')(trusted, 'order-id'), /Arguments are not allowed/);
  await assert.rejects(handlers.get('moaon-hub:recheck-page')({sender:{},senderFrame:null}), /Untrusted renderer/);
  assert.equal((await handlers.get('moaon-hub:refresh')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:next-page')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:previous-page')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:view-active')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:view-registered')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:view-in-transit')(trusted)).status, 'READY');
  assert.equal((await handlers.get('moaon-hub:view-completed')(trusted)).status, 'READY');
  await assert.rejects(handlers.get('moaon-hub:connect')(trusted, 'https://evil.invalid'), /Arguments are not allowed/);
  await assert.rejects(handlers.get('moaon-hub:disconnect')({ sender: {}, senderFrame: null }), /Untrusted renderer/);
  assert.deepEqual(calls, ['refresh', 'nextPage', 'previousPage', 'viewActive', 'viewRegistered', 'viewInTransit', 'viewCompleted']);
});

test('preload exposes only a frozen moaonHub bridge with fixed no-argument channels', async () => {
  const exposed = new Map();
  const invocations = [];
  const originalLoad = Module._load;
  const preloadPath = path.resolve(__dirname, '..', 'preload.cjs');
  delete require.cache[preloadPath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        contextBridge: { exposeInMainWorld: (name, value) => exposed.set(name, value) },
        ipcRenderer: { invoke: (...args) => invocations.push(args) && Promise.resolve(args[0]) },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }

  assert.deepEqual([...exposed.keys()], ['moaonHub']);
  const bridge = exposed.get('moaonHub');
  assert.equal(Object.isFrozen(bridge), true);
  assert.deepEqual(Object.keys(bridge), ['collectOrders','checkOrderCollection','readTracking','refreshTracking','readServerShippingHistory','findOrder','restoreShippingHistory','readDelivery','readOverview','listBusinesses','appInfo','inspectPrinters','previewLabel','previewLabels','previewWorklist','exportSelectedCsv','issueShipment','issueAndRegister','checkShipment','confirmShipmentReview', 'connect', 'refresh', 'recheckPage', 'nextPage', 'previousPage', 'viewActive', 'viewChannel', 'registerInvoices', 'viewRegistered', 'viewInTransit', 'viewCompleted', 'disconnect']);
  await bridge.listBusinesses('ignored');
  await bridge.connect('ignored');
  await bridge.refresh({ ignored: true });
  await bridge.recheckPage({ ignored: true });
  await bridge.nextPage({ ignored: true });
  await bridge.previousPage({ ignored: true });
  await bridge.viewActive('ignored');
  await bridge.viewRegistered('ignored');
  await bridge.viewInTransit('ignored');
  await bridge.viewCompleted('ignored');
  await bridge.disconnect('ignored');
  assert.deepEqual(invocations, [
    ['moaon-hub:list-businesses'],
    ['moaon-hub:connect'],
    ['moaon-hub:refresh'],
    ['moaon-hub:recheck-page'],
    ['moaon-hub:next-page'],
    ['moaon-hub:previous-page'],
    ['moaon-hub:view-active'],
    ['moaon-hub:view-registered'],
    ['moaon-hub:view-in-transit'],
    ['moaon-hub:view-completed'],
    ['moaon-hub:disconnect'],
  ]);
});

function makeRemoteSession(fetchImpl) {
  const remoteSession = {
    fetch: fetchImpl,
    webRequest: { onBeforeRequest: (filter, handler) => {
      remoteSession.beforeRequestFilter = filter;
      remoteSession.beforeRequestHandler = handler;
    } },
    on() {},
    setPermissionCheckHandler() {},
    setPermissionRequestHandler() {},
    async clearStorageData() { this.clearStorageDataCalls = (this.clearStorageDataCalls || 0) + 1; },
    async clearCache() { this.clearCacheCalls = (this.clearCacheCalls || 0) + 1; },
    async clearAuthCache() { this.clearAuthCacheCalls = (this.clearAuthCacheCalls || 0) + 1; },
  };
  return remoteSession;
}

function makePagePayload({
  orders = [],
  total = orders.length,
  offset = 0,
  nextOffset = offset + 20 < total ? offset + 20 : null,
  snapshot = TEST_SNAPSHOT,
  partial = false,
} = {}) {
  return { ok: true, orders, total, offset, nextOffset, snapshot, partial };
}

test('pending cleanup blocks restart reads until successful cleanup even without an initialized session', async () => {
  let marked = 0;
  let finished = 0;
  const remote = makeRemoteSession(async () => new Response('',{status:401}));
  const {connection} = makeConnection(remote, {initialCleanupPending:true, markCleanupPending:()=>{marked++;},finishCleanup:()=>{finished++;}});
  assert.equal((await connection.refresh()).status,'UNAVAILABLE');
  assert.equal((await connection.disconnect()).status,'DISCONNECTED');
  assert.equal(remote.clearStorageDataCalls,1);
  assert.equal(marked,1);
  assert.equal(finished,1);
  assert.equal((await connection.refresh()).status,'LOGIN_REQUIRED');
});

test('recheck rereads the current page and rejects a changed snapshot', async () => {
  let changed = false;
  const urls = [];
  const remote = makeRemoteSession(async url => {
    urls.push(url);
    if (changed) return new Response('',{status:409});
    const offset = Number(new URL(url).searchParams.get('offset') || 0);
    return new Response(JSON.stringify(makePagePayload({orders:Array.from({length:20},(_,i)=>({hubOrderId:`H-${offset+i}`})),total:40,offset,nextOffset:offset===0?20:null})),{status:200});
  });
  const {connection} = makeConnection(remote);
  assert.equal(typeof connection.recheckPage,'function');
  assert.equal((await connection.recheckPage()).status,'UNAVAILABLE');
  assert.equal(urls.length,0);
  await connection.refresh();
  await connection.nextPage();
  assert.equal((await connection.recheckPage()).offset,20);
  assert.ok(urls.at(-1).includes('offset=20&snapshot='));
  changed=true;
  assert.equal((await connection.recheckPage()).status,'SNAPSHOT_CHANGED');
  const count=urls.length;
  assert.equal((await connection.recheckPage()).status,'UNAVAILABLE');
  assert.equal(urls.length,count);
});

function makeConnection(remoteSession, overrides = {}) {
  const browserWindows = [];
  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), {
        id: 41,
        session: remoteSession,
        getURL: () => LOGIN_URL,
        setWindowOpenHandler() {},
      });
      browserWindows.push(this);
    }

    isDestroyed() { return this.destroyed; }
    show() {}
    async loadURL(url) {
      if (typeof overrides.loadURL === 'function') return overrides.loadURL(this, url);
    }
    close() {
      if (this.blockClose) return;
      this.destroyed = true;
      this.emit('closed');
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const sessionModule = {
    calls: [],
    fromPartition(partition, options) {
      this.calls.push({ partition, options });
      return remoteSession;
    },
  };
  const mainWindow = { isDestroyed: () => false, webContents: { id: 7 } };
  const connection = createHubConnection({
    BrowserWindow: FakeBrowserWindow,
    session: sessionModule,
    getMainWindow: () => mainWindow,
    now: () => new Date('2026-09-08T12:00:00.000Z'),
    timeoutMs: overrides.timeoutMs,
    initialCleanupPending: overrides.initialCleanupPending,
    markCleanupPending: overrides.markCleanupPending,
    finishCleanup: overrides.finishCleanup,
    showShipmentReview: overrides.showShipmentReview,
    shipmentDirectory: overrides.shipmentDirectory,
    labelPreview: overrides.labelPreview,
  });
  return { connection, sessionModule, browserWindows };
}
