'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fetchSearchTrend}=require('../lib/naver-api-hub/client');
const {createPublicMarketLoader}=require('../lib/ai/public-market-loader');
const config={clientId:'fixture',clientSecret:'fixture'};
function loadWith(fetchImpl){return createPublicMarketLoader({hub:{fetchSearchTrend:input=>fetchSearchTrend({...input,config,fetchImpl})},now:()=>Date.parse('2026-09-14T01:00:00Z')});}
test('public source rejects declared oversized response before reading and cancels body',async()=>{
 let canceled=false,reads=0;
 const response={ok:true,status:200,headers:new Headers({'content-length':'65537'}),body:{cancel:async()=>{canceled=true;},getReader(){reads++;throw Error('must not read');}}};
 await assert.rejects(loadWith(async()=>response)({query:'차',days:30}),{code:'UNAVAILABLE'});
 assert.equal(reads,0);assert.equal(canceled,true);
});
test('public source caps actual streamed bytes despite missing or understated length',async()=>{
 for(const headers of [{},{'content-length':'1'}]){
  let canceled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40000));controller.enqueue(new Uint8Array(30000));},cancel(){canceled=true;}});
  await assert.rejects(loadWith(async()=>new Response(stream,{headers}))({query:'차',days:30}),{code:'UNAVAILABLE'});
  assert.equal(canceled,true);
 }
});
test('public stream accepts bounded JSON and legacy caller still accepts larger existing payloads',async()=>{
 const data={results:[{data:[{period:'2026-08-15',ratio:0},{period:'2026-09-13',ratio:50}]}]};
 const snapshot=await loadWith(async()=>Response.json(data))({query:'차',days:30});
 assert.equal(snapshot.metrics.firstIndex.value,0);assert.equal(snapshot.metrics.lastIndex.value,50);
 const large={padding:'x'.repeat(70000)};
 const result=await fetchSearchTrend({config,fetchImpl:async()=>Response.json(large)});
 assert.deepEqual(result.data,large);
});
