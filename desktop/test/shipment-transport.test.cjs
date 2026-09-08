'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createShipmentTransport}=require('../shipment-transport.cjs');
const {createShipmentJob}=require('../shipment-job.cjs');
const order='HR-C24-1234ABCD', id='12345678-1234-4123-8123-123456789abc';
const endpoint='https://harin-cafe24-sync.vercel.app/api/epost/issue';
const signal=()=>({signal:new AbortController().signal});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('transport fixes destination and submits only the host-bound order',async()=>{
  const calls=[];
  const transport=createShipmentTransport({hubOrderId:order,fetch:async(url,options)=>{calls.push({url,options});return json({ok:true},202);}});
  await transport.submit({confirm:true,orderIds:[order],secret:'must not send'},signal());
  assert.equal(calls[0].url,endpoint);
  assert.equal(calls[0].options.body,JSON.stringify({confirm:true,orderIds:[order]}));
  assert.equal(calls[0].options.credentials,'include');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.method,'POST');
  for(const body of [{confirm:false,orderIds:[order]},{confirm:true,orderIds:['HR-CP-1234ABCD']},{confirm:true,orderIds:[order,order]}])await assert.rejects(()=>transport.submit(body,signal()));
  assert.equal(calls.length,1);
});
test('poll accepts only canonical request id and never POSTs',async()=>{
  const calls=[];const transport=createShipmentTransport({hubOrderId:order,fetch:async(url,options)=>{calls.push({url,options});return json({ok:true},202);}});
  for(const value of [null,[id],`${id}&other=1`,'https://other.test'])await assert.rejects(()=>transport.poll(value,signal()));
  await transport.poll(id,signal());assert.equal(calls.length,1);assert.equal(calls[0].url,`${endpoint}?requestId=${id}`);assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
});
test('expired authorization discards response content and does not retry',async()=>{
  let calls=0;const transport=createShipmentTransport({hubOrderId:order,fetch:async()=>{calls++;return new Response('PRIVATE',{status:401});}});
  assert.deepEqual(await transport.poll(id,signal()),{status:401,body:null});assert.equal(calls,1);
});
test('oversized, malformed and non-JSON responses reject with safe errors',async()=>{
  for(const response of [new Response('PRIVATE',{headers:{'content-type':'text/html'}}),new Response('PRIVATE',{headers:{'content-type':'application/json'}}),new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'65537'}})]){
    const transport=createShipmentTransport({hubOrderId:order,fetch:async()=>response});
    await assert.rejects(()=>transport.poll(id,signal()),{message:'Shipment transport unavailable'});
  }
});
test('already aborted request does not dispatch and hung fetch settles on abort',async()=>{
  let calls=0;const controller=new AbortController();controller.abort();
  const transport=createShipmentTransport({hubOrderId:order,fetch:async()=>{calls++;return new Promise(()=>{});}});
  await assert.rejects(()=>transport.poll(id,{signal:controller.signal}));assert.equal(calls,0);
  const active=new AbortController();const pending=transport.poll(id,{signal:active.signal});active.abort();
  await assert.rejects(()=>pending,{message:'Shipment transport unavailable'});
});
test('abort while reading an unfinished response cancels the body',async()=>{
  let cancel=false,started;const entered=new Promise(resolve=>{started=resolve;});
  const response=new Response(new ReadableStream({pull(){started();},cancel(){cancel=true;}}),{headers:{'content-type':'application/json'}});
  const transport=createShipmentTransport({hubOrderId:order,fetch:async()=>response});const controller=new AbortController();
  const pending=transport.poll(id,{signal:controller.signal});await entered;controller.abort();
  await assert.rejects(()=>pending);assert.equal(cancel,true);
});
test('transport deadline terminates a fetch even if the fetch ignores its signal',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let sentSignal;
  const transport=createShipmentTransport({hubOrderId:order,fetch:async(_url,options)=>{sentSignal=options.signal;return new Promise(()=>{});}});
  const pending=transport.poll(id,signal());
  t.mock.timers.tick(15000);
  await assert.rejects(()=>pending,{message:'Shipment transport unavailable'});
  assert.equal(sentSignal.aborted,true);
});
test('exact response limit is allowed and cumulative overflow cancels the stream',async()=>{
  const body={x:'a'.repeat(65528)};
  assert.equal(Buffer.byteLength(JSON.stringify(body)),65536);
  const allowed=createShipmentTransport({hubOrderId:order,fetch:async()=>json(body)});
  assert.deepEqual((await allowed.poll(id,signal())).body,body);
  let cancelled=false,chunk=0;
  const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(chunk++===0?40000:30000));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
  const blocked=createShipmentTransport({hubOrderId:order,fetch:async()=>response});
  await assert.rejects(()=>blocked.poll(id,signal()));assert.equal(cancelled,true);
});
test('real transport and lifecycle compose into accepted job and confirmed result',async()=>{
  let saved=null;const calls=[];
  const transport=createShipmentTransport({hubOrderId:order,fetch:async(url,options)=>{
    calls.push(options.method);
    return options.method==='POST'?json({ok:true,results:[{ok:true,hubOrderId:order,request:{id,status:'PENDING'}}]},202):json({ok:true,request:{id,hubOrderId:order,status:'SUCCESS'},result:{trackingNo:'1234567890123'}});
  }});
  const job=await createShipmentJob({businessId:'harin',store:{read:async()=>saved,write:async row=>{saved=row;}},transport});
  assert.equal((await job.submit({confirm:true,hubOrderId:order})).status,'PENDING');
  assert.equal((await job.poll()).status,'SUCCEEDED');assert.deepEqual(calls,['POST','GET']);
  assert.equal(JSON.stringify(saved).includes('1234567890123'),false);
});
