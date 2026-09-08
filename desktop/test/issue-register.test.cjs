'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHubConnection,registerConnectionIpc}=require('../hub-connection.cjs');
const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
const id='HR-C24-1234ABCD',requestId='a2345678-1234-4234-8234-123456789012';
const base=()=>({hubOrderId:id,externalOrderId:'WEB-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'차',quantity:1,shippingEligible:true,selectionEligible:true,shippingHistoryStatus:'READY',cancelled:false,cancellationRequested:false,invoiceNumber:'',issuedInvoiceNumber:'',receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}});
function host(directory,{dialog=async()=>({response:1}),initial=base(),automaticTimeoutMs=60000}={}){
 let current=initial;const calls=[];
 const remote={setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){},webRequest:{onBeforeRequest(_filter,fn){remote.guard=fn;}},async clearStorageData(){},async clearCache(){},async clearAuthCache(){},async fetch(url,options){
  calls.push({url,options});
  if(options.method==='POST'){
   const body=JSON.parse(options.body);
   if(url.endsWith('/api/shipping/actions')){
    if(body.action==='PREPARE'&&current.platform!=='CAFE24')current={...current,stage:'PREPARING'};
    else if(body.action==='UPLOAD_INVOICE')current={...current,invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}};
    return Response.json({ok:true,results:[{hubOrderId:current.hubOrderId,platform:current.platform,ok:true,status:'SUCCESS'}]});
   }
   return Response.json({ok:true,results:[{hubOrderId:current.hubOrderId,ok:true,request:{id:requestId,status:'PENDING'}}]},{status:202});
  }
  if(url.includes('/api/epost/issue?')){current={...current,issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}};return Response.json({ok:true,request:{id:requestId,hubOrderId:current.hubOrderId,status:'SUCCESS'},result:{trackingNo:'1234567890123'}});}
  const scope=new URL(url).searchParams.get('stage');
  const orders=(scope==='REGISTER')===(current.invoice?.status==='REGISTERED')?[current]:[];
  return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 }};
 const connection=createHubConnection({BrowserWindow:class{},session:{fromPartition:()=>remote},getMainWindow:()=>({isDestroyed:()=>false}),showShipmentReview:dialog,shipmentDirectory:directory,automaticPollDelayMs:0,automaticTimeoutMs});
 return {connection,calls,remote,setOrder:value=>{current=value;},getOrder:()=>current};
}
test('one native approval prepares, journals issue, rereads invoice and registers it',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  let confirmations=0;const env=host(directory,{dialog:async(_parent,options)=>{confirmations++;assert.match(options.message,/발급.*등록/);assert.equal(options.defaultId,0);return {response:1};}});
  await env.connection.refresh();assert.equal(typeof env.connection.issueAndRegister,'function');
  const result=await env.connection.issueAndRegister([id]);
  assert.deepEqual(result,{status:'COMPLETED',results:[{hubOrderId:id,phase:'REGISTER',status:'REGISTERED',trackingStatus:'CHECK_REQUIRED'}]});
  assert.equal(confirmations,1);
  const posts=env.calls.filter(call=>call.options.method==='POST');
  assert.ok(posts.every(call=>call.options.headers.Origin==='https://harin-cafe24-sync.vercel.app'));
  assert.deepEqual(posts.map(call=>JSON.parse(call.options.body).action||JSON.parse(call.options.body).mode||'ISSUE'),['PREPARE','ISSUE','UPLOAD_INVOICE','automatic']);
  assert.deepEqual(JSON.parse(posts[3].options.body),{orderIds:[id],mode:'automatic'});
  assert.equal(JSON.parse(posts[2].options.body).orders[0].invoiceNumber,'1234567890123');
  await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('tracking enqueue is exact, bounded and cannot erase verified registration',async()=>{
 for(const mode of ['success','failure','timeout','logout']){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
  try{
   // This deadline covers prepare, durable journal I/O, registration and the
   // final tracking enqueue. Keep the timeout case bounded without making a
   // successful full workflow depend on sub-150 ms host scheduling.
   const env=host(directory,{automaticTimeoutMs:1000}),original=env.remote.fetch;let trackingCalls=0;
   env.remote.fetch=async(url,options)=>{
    if(!url.endsWith('/api/shipping/tracking'))return original(url,options);
    trackingCalls++;assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{orderIds:[id],mode:'automatic'});
    let decision;env.remote.guard({url,method:'POST',webContentsId:0},value=>{decision=value;});assert.equal(decision.cancel,false);
    if(mode==='failure')throw Error('Tracking failed');
    if(mode==='timeout')return new Promise(()=>{});
    if(mode==='logout'){await env.connection.disconnect();return new Promise(()=>{});}
    return Response.json({ok:true,queued:[{trackingNo:'1234567890123',hubOrderIds:[id],status:'PENDING'}]},{status:202});
   };
   await env.connection.refresh();const result=await env.connection.issueAndRegister([id]);
   assert.equal(trackingCalls,1);
   if(mode==='logout')assert.equal(result.status,'DISCONNECTED');
   else assert.deepEqual(result.results,[{hubOrderId:id,phase:'REGISTER',status:'REGISTERED',trackingStatus:mode==='success'?'PENDING':'CHECK_REQUIRED'}]);
   let decision;env.remote.guard({url:'https://harin-cafe24-sync.vercel.app/api/shipping/tracking',method:'POST',webContentsId:0},value=>{decision=value;});assert.equal(decision.cancel,true);
   await env.connection.disconnect();
  }finally{await fs.rm(directory,{recursive:true,force:true});}
 }
});

test('native cancellation and changed private receiver prevent all automatic writes',async()=>{
 for(const mode of ['cancel','changed','logout']){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
  try{
   let env;env=host(directory,{dialog:async()=>{if(mode==='changed')env.setOrder({...base(),receiver:{...base().receiver,address:'CHANGED'}});if(mode==='logout')await env.connection.disconnect();return {response:mode==='cancel'?0:1};}});
   await env.connection.refresh();const result=await env.connection.issueAndRegister([id]);
   assert.notEqual(result.status,'COMPLETED');assert.equal(env.calls.filter(call=>call.options.method==='POST').length,0);
   await env.connection.disconnect();
  }finally{await fs.rm(directory,{recursive:true,force:true});}
 }
});
test('lost PREPARE, ISSUE or UPLOAD_INVOICE response is never POSTed again after restart',async()=>{
 for(const phase of ['PREPARE','ISSUE','UPLOAD_INVOICE']){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
  try{
   const env=host(directory),original=env.remote.fetch;let attempts=0;
   env.remote.fetch=async(url,options)=>{
    if(options.method==='POST'&&(JSON.parse(options.body).action||'ISSUE')===phase){attempts++;throw Error('Response lost');}
    return original(url,options);
   };
   await env.connection.refresh();const first=await env.connection.issueAndRegister([id]);
   assert.equal(first.results[0].status,'CHECK_REQUIRED');assert.equal(attempts,1);
   const current=env.getOrder();await env.connection.disconnect();
   const resumed=host(directory,{initial:current});await resumed.connection.refresh();
   const result=await resumed.connection.issueAndRegister([id]);assert.equal(result.results[0].status,'CHECK_REQUIRED',phase);
   assert.equal(resumed.calls.filter(call=>call.options.method==='POST').length,0,phase);
   if(phase==='UPLOAD_INVOICE')assert.equal((await resumed.connection.registerInvoices([id])).status,'CHECK_REQUIRED','manual path must not bypass unknown automatic transmission');
   await resumed.connection.disconnect();
  }finally{await fs.rm(directory,{recursive:true,force:true});}
 }
});
test('pending issue resumes its durable request after restart without another issuance POST',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory),original=env.remote.fetch;
  env.remote.fetch=async(url,options)=>url.includes('/api/epost/issue?')?Response.json({ok:true,request:{id:requestId,hubOrderId:id,status:'PENDING'}},{status:202}):original(url,options);
  await env.connection.refresh();const first=await env.connection.issueAndRegister([id]);assert.deepEqual(first.results,[{hubOrderId:id,phase:'ISSUE',status:'PENDING'}]);
  const current=env.getOrder();await env.connection.disconnect();
  const resumed=host(directory,{initial:current});await resumed.connection.refresh();
  const result=await resumed.connection.issueAndRegister([id]);assert.equal(result.status,'COMPLETED');
  assert.deepEqual(resumed.calls.filter(call=>call.options.method==='POST'&&call.url.endsWith('/actions')).map(call=>JSON.parse(call.options.body).action),['UPLOAD_INVOICE']);
  await resumed.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('persisted issuance identity refuses a changed receiver on restart',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory),original=env.remote.fetch;
  env.remote.fetch=async(url,options)=>url.includes('/api/epost/issue?')?Response.json({ok:true,request:{id:requestId,hubOrderId:id,status:'PENDING'}},{status:202}):original(url,options);
  await env.connection.refresh();await env.connection.issueAndRegister([id]);const current=env.getOrder();await env.connection.disconnect();
  const resumed=host(directory,{initial:{...current,receiver:{...current.receiver,address:'changed after restart'}}});await resumed.connection.refresh();
  assert.equal((await resumed.connection.issueAndRegister([id])).status,'CHECK_REQUIRED');assert.equal(resumed.calls.some(call=>call.options.method==='POST'),false);
  await resumed.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('stored invoice must equal authoritative issue result before registration',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory),original=env.remote.fetch;
  env.remote.fetch=async(url,options)=>{const response=await original(url,options);if(url.includes('/api/epost/issue?'))env.setOrder({...env.getOrder(),issuedInvoiceNumber:'9999999999999',invoice:{status:'ISSUED',number:'9999999999999'}});return response;};
  await env.connection.refresh();const result=await env.connection.issueAndRegister([id]);
  assert.deepEqual(result.results,[{hubOrderId:id,phase:'ISSUE',status:'CHECK_REQUIRED'}]);
  assert.equal(env.calls.some(call=>call.options.method==='POST'&&JSON.parse(call.options.body).action==='UPLOAD_INVOICE'),false);
  await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Coupang queued prepare survives restart, polls once resumed, then issues and registers',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 const cpId='HR-CP-1234ABCD',cpRequest='b2345678-1234-4234-8234-123456789012';
 try{
  const initial={...base(),hubOrderId:cpId,platform:'COUPANG',shipmentId:'123'};
  const first=host(directory,{initial}),original=first.remote.fetch;let preparePosts=0;
  first.remote.fetch=async(url,options)=>{
   if(options.method==='POST'&&JSON.parse(options.body).action==='PREPARE'){preparePosts++;return Response.json({ok:true,results:[{hubOrderId:cpId,platform:'COUPANG',ok:true,status:'QUEUED',requestId:cpRequest}]},{status:202});}
   if(url.includes('/api/coupang/operations/'))return Response.json({ok:true,request:{id:cpRequest,status:'PENDING'}},{status:202});
   return original(url,options);
  };
  await first.connection.refresh();assert.deepEqual((await first.connection.issueAndRegister([cpId])).results,[{hubOrderId:cpId,phase:'PREPARE',status:'PENDING'}]);assert.equal(preparePosts,1);await first.connection.disconnect();
  const resumed=host(directory,{initial}),next=resumed.remote.fetch;
  resumed.remote.fetch=async(url,options)=>{
   if(url.includes('/api/coupang/operations/')){
    let blocked;resumed.remote.guard({url,method:'GET',webContentsId:0},value=>{blocked=value.cancel;});assert.equal(blocked,false);
    resumed.remote.guard({url,method:'GET',webContentsId:33},value=>{blocked=value.cancel;});assert.equal(blocked,true);
    resumed.setOrder({...resumed.getOrder(),stage:'PREPARING'});return Response.json({ok:true,request:{id:cpRequest,status:'SUCCESS'}});
   }
   return next(url,options);
  };
  await resumed.connection.refresh();assert.equal((await resumed.connection.issueAndRegister([cpId])).status,'COMPLETED');
  const posts=resumed.calls.filter(call=>call.options.method==='POST'&&!call.url.endsWith('/tracking'));assert.deepEqual(posts.map(call=>JSON.parse(call.options.body).action||'ISSUE'),['ISSUE','UPLOAD_INVOICE']);
  assert.equal(JSON.parse(posts[1].options.body).orders[0].deliveryCompanyCode,'EPOST');await resumed.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('missing prepare row never counts as success or proceeds to issue',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory),original=env.remote.fetch;let posts=0;
  env.remote.fetch=async(url,options)=>{if(options.method==='POST'){posts++;return Response.json({ok:true,results:[]});}return original(url,options);};
  await env.connection.refresh();assert.deepEqual((await env.connection.issueAndRegister([id])).results,[{hubOrderId:id,phase:'PREPARE',status:'CHECK_REQUIRED'}]);assert.equal(posts,1);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('automatic deadline settles an abort-ignoring POST without retry',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory,{automaticTimeoutMs:60}),original=env.remote.fetch;let posts=0;
  env.remote.fetch=async(url,options)=>{if(options.method==='POST'){posts++;return new Promise(()=>{});}return original(url,options);};
  await env.connection.refresh();const result=await env.connection.issueAndRegister([id]);
  assert.equal(result.status,'PARTIAL');assert.equal(result.results[0].status,'CHECK_REQUIRED');assert.equal(posts,1);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('automatic IPC allows only exact trusted selections, and queue polling is Main-only and exact',async()=>{
 const handlers=new Map(),frame={url:'moaon://app/index.html'},sender={mainFrame:null,getURL:()=>frame.url};sender.mainFrame=frame;
 const main={isDestroyed:()=>false,webContents:sender};let calls=0;
 registerConnectionIpc({ipcMain:{handle:(key,value)=>handlers.set(key,value)},getMainWindow:()=>main,connection:{issueAndRegister:async()=>{calls++;return {status:'REVIEW_CANCELLED',results:[]};}}});
 const run=handlers.get('moaon-hub:issue-and-register'),trusted={sender,senderFrame:frame};
 await assert.rejects(()=>run({sender:{},senderFrame:frame},[id]));
 for(const args of [[],[[]],[[id,id]],[new Array(21).fill(id)],[['HR-NV-1234ABCD']],[[id],true]])await assert.rejects(()=>run(trusted,...args));
 await run(trusted,[id]);assert.equal(calls,1);
 const url=`https://harin-cafe24-sync.vercel.app/api/coupang/operations/${requestId}`;
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0},{automaticRequestActive:true}),true);
 for(const item of [{url,method:'GET',webContentsId:1},{url:url+'?other=1',method:'GET',webContentsId:0},{url,method:'POST',webContentsId:0}])assert.equal(isAllowedRemoteRequest(item,{automaticRequestActive:true}),false);
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0},{}),false);
});
test('a missing second preparation outcome cannot hide behind another completed order',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-')),second='HR-C24-5678ABCD';
 try{
  const env=host(directory),rows=new Map([[id,base()],[second,{...base(),hubOrderId:second}]]),issuedIds=[];
  env.remote.fetch=async(url,options)=>{
   if(url.endsWith('/api/shipping/tracking'))return Response.json({ok:false},{status:503});
   if(options.method==='POST'){
    const body=JSON.parse(options.body),target=body.orders?.[0]?.hubOrderId||body.orderIds?.[0];
    if(body.action==='PREPARE'){
     if(target===second)return Response.json({ok:true,results:[]});
     // Cafe24 admin PUT succeeds without updating the locally stored stage.
    }else if(body.action==='UPLOAD_INVOICE')rows.set(target,{...rows.get(target),invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}});
    else{issuedIds.push(target);return Response.json({ok:true,results:[{hubOrderId:target,ok:true,request:{id:requestId,status:'PENDING'}}]},{status:202});}
    return Response.json({ok:true,results:[{hubOrderId:target,ok:true,status:'SUCCESS'}]});
   }
   if(url.includes('/api/epost/issue?')){rows.set(id,{...rows.get(id),issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}});return Response.json({ok:true,request:{id:requestId,hubOrderId:id,status:'SUCCESS'},result:{trackingNo:'1234567890123'}});}
   const registered=new URL(url).searchParams.get('stage')==='REGISTER',orders=[...rows.values()].filter(row=>(row.invoice?.status==='REGISTERED')===registered);
   return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
  };
  await env.connection.refresh();assert.deepEqual(await env.connection.issueAndRegister([id,second]),{status:'PARTIAL',results:[{hubOrderId:id,phase:'REGISTER',status:'REGISTERED',trackingStatus:'CHECK_REQUIRED'},{hubOrderId:second,phase:'PREPARE',status:'CHECK_REQUIRED'}]});
  assert.deepEqual(issuedIds,[id]);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('pending platform registration resumes only GET after restart and never reissues',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-')),cpId='HR-CP-1234ABCD';
 try{
  const initial={...base(),hubOrderId:cpId,platform:'COUPANG',shipmentId:'123',stage:'PREPARING',issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}};
  const env=host(directory,{initial}),original=env.remote.fetch;let posts=0;
  env.remote.fetch=async(url,options)=>{
   if(options.method==='POST'){posts++;assert.equal(JSON.parse(options.body).action,'UPLOAD_INVOICE');return Response.json({ok:true,results:[{hubOrderId:cpId,ok:true,status:'QUEUED',requestId}]},{status:202});}
   if(url.includes('/api/coupang/operations/'))return Response.json({ok:true,request:{id:requestId,status:'PENDING'}},{status:202});
   return original(url,options);
  };
  await env.connection.refresh();assert.deepEqual((await env.connection.issueAndRegister([cpId])).results,[{hubOrderId:cpId,phase:'REGISTER',status:'PENDING'}]);assert.equal(posts,1);await env.connection.disconnect();
  const resumed=host(directory,{initial}),next=resumed.remote.fetch;
  resumed.remote.fetch=async(url,options)=>{
   if(!url.endsWith('/api/shipping/tracking'))assert.notEqual(options.method,'POST');
   if(url.includes('/api/coupang/operations/')){resumed.setOrder({...initial,invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}});return Response.json({ok:true,request:{id:requestId,status:'SUCCESS'}});}
   return next(url,options);
  };
  await resumed.connection.refresh();assert.equal((await resumed.connection.issueAndRegister([cpId])).status,'COMPLETED');await resumed.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('same-connection pending issue resumes after server invoice changes before the next confirmation',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const env=host(directory),original=env.remote.fetch;let pending=true;
  env.remote.fetch=async(url,options)=>pending&&url.includes('/api/epost/issue?')?Response.json({ok:true,request:{id:requestId,hubOrderId:id,status:'PENDING'}},{status:202}):original(url,options);
  await env.connection.refresh();assert.equal((await env.connection.issueAndRegister([id])).results[0].status,'PENDING');
  pending=false;env.setOrder({...env.getOrder(),issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}});
  assert.equal((await env.connection.issueAndRegister([id])).status,'COMPLETED');
  assert.equal(env.calls.filter(call=>call.options.method==='POST'&&call.url.endsWith('/api/epost/issue')).length,1);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('same-connection pending registration verifies a row already moved to REGISTER',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-')),cpId='HR-CP-1234ABCD';
 try{
  const initial={...base(),hubOrderId:cpId,platform:'COUPANG',shipmentId:'123',stage:'PREPARING',issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}};
  const env=host(directory,{initial}),original=env.remote.fetch;let pending=true,posts=0;
  env.remote.fetch=async(url,options)=>{
   if(options.method==='POST'&&url.endsWith('/actions')){posts++;return Response.json({ok:true,results:[{hubOrderId:cpId,ok:true,status:'QUEUED',requestId}]},{status:202});}
   if(url.includes('/api/coupang/operations/'))return Response.json({ok:true,request:{id:requestId,status:pending?'PENDING':'SUCCESS'}},{status:pending?202:200});
   return original(url,options);
  };
  await env.connection.refresh();assert.equal((await env.connection.issueAndRegister([cpId])).results[0].status,'PENDING');
  pending=false;env.setOrder({...initial,stage:'SHIPPING',invoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'}});
  assert.deepEqual(await env.connection.issueAndRegister([cpId]),{status:'COMPLETED',results:[{hubOrderId:cpId,phase:'REGISTER',status:'REGISTERED',trackingStatus:'CHECK_REQUIRED'}]});assert.equal(posts,1);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('manual ambiguous upload cannot be resent automatically in same process or after restart',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-'));
 try{
  const initial={...base(),issuedInvoiceNumber:'1234567890123',invoice:{status:'ISSUED',number:'1234567890123'}};
  const env=host(directory,{initial}),original=env.remote.fetch;let posts=0;
  env.remote.fetch=async(url,options)=>{if(options.method==='POST'){posts++;throw Error('manual response lost');}return original(url,options);};
  await env.connection.refresh();assert.equal((await env.connection.registerInvoices([id])).status,'PARTIAL');
  assert.equal((await env.connection.issueAndRegister([id])).results[0].status,'CHECK_REQUIRED');assert.equal(posts,1);await env.connection.disconnect();
  const resumed=host(directory,{initial});await resumed.connection.refresh();assert.equal((await resumed.connection.issueAndRegister([id])).results[0].status,'CHECK_REQUIRED');assert.equal(resumed.calls.some(call=>call.options.method==='POST'),false);await resumed.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('same-connection queued preparation is polled after worker changes stored PAID to PREPARING',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'moaon-auto-test-')),cpId='HR-CP-1234ABCD';
 try{
  const env=host(directory,{initial:{...base(),hubOrderId:cpId,platform:'COUPANG',shipmentId:'123'}}),original=env.remote.fetch;let pending=true,prepares=0,polls=0;
  env.remote.fetch=async(url,options)=>{
   if(options.method==='POST'&&JSON.parse(options.body).action==='PREPARE'){prepares++;return Response.json({ok:true,results:[{hubOrderId:cpId,ok:true,status:'QUEUED',requestId}]},{status:202});}
   if(url.includes('/api/coupang/operations/')){polls++;return Response.json({ok:true,request:{id:requestId,status:pending?'PENDING':'SUCCESS'}},{status:pending?202:200});}
   return original(url,options);
  };
  await env.connection.refresh();assert.equal((await env.connection.issueAndRegister([cpId])).results[0].status,'PENDING');
  pending=false;env.setOrder({...env.getOrder(),stage:'PREPARING'});const earlierPolls=polls;
  assert.equal((await env.connection.issueAndRegister([cpId])).status,'COMPLETED');assert.equal(prepares,1);assert.equal(polls,earlierPolls+1);await env.connection.disconnect();
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
