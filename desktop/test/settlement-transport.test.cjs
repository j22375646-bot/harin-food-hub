'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/settlement';
function payload(){return {ok:true,writePolicy:'READ_ONLY',generatedAt:'2026-09-09T01:02:03.000Z',period:{days:30,start:'2026-08-10T01:02:03.000Z',end:'2026-09-09T01:02:03.000Z'},summary:{actual:{value:0,status:'PARTIAL'},expected:{value:-100,status:'ESTIMATED'},variance:null,comparableChannels:0},channels:['CAFE24','NAVER','COUPANG','COUPANG_RG'].map(platform=>({platform,label:platform,stateCode:'NO_DATA',stateLabel:'확인 필요',gross:0,refunds:null,fees:null,logistics:null,advertising:null,expected:null,actual:null,pending:null,variance:null,basis:null,payoutBasis:null,asOf:null})),schedules:[{platform:'NAVER',date:'2026-09-10',amount:0,status:'정산예정',type:'일별 정산'}]};}
const create=options=>require('../settlement-transport.cjs').createSettlementTransport(options);
test('settlement binds each allowed period to its fixed URL and rejects mismatched periods',async()=>{
 for(const days of [7,30,90]){
  const p=payload();p.period.days=days;
  const read=create({fetch:async url=>{assert.equal(url,URL+(days===30?'':'?days='+days));return Response.json(p);}});
  assert.equal((await read({days})).period.days,days);
  assert.equal((await create({fetch:async()=>Response.json(payload())})({days:7})).status,'UNAVAILABLE');
 }
 for(const days of [0,1,31,'7',null,{}])assert.equal((await create({fetch:()=>{throw Error('no fetch');}})({days})).status,'UNAVAILABLE');
});
test('settlement reads only fixed authenticated GET and preserves partial zero, negative estimate and null',async()=>{
 const source=payload();source.secret='private';source.channels[0].raw_data='private';
 const read=create({fetch:async(url,options)=>{assert.equal(url,URL);assert.deepEqual({method:options.method,credentials:options.credentials,cache:options.cache,redirect:options.redirect},{method:'GET',credentials:'include',cache:'no-store',redirect:'error'});return Response.json(source);}});
 const result=await read();const expected=payload();delete expected.ok;
 assert.deepEqual(result,{status:'READY',...expected});assert.doesNotMatch(JSON.stringify(result),/private|raw_data/);
});
test('settlement rejects malformed financial contracts without exposing any payload',async()=>{
 const mutations=[p=>p.ok=false,p=>p.writePolicy='WRITE',p=>p.period.days=7,p=>p.period.start='2026-02-30T01:00:00Z',p=>p.generatedAt='2026-09-09',p=>p.summary.actual.value='0',p=>p.summary.actual.status='ESTIMATED',p=>p.summary.expected.status='READY',p=>p.summary.actual.status='BLOCKED',p=>p.summary.comparableChannels=5,p=>p.channels.push(p.channels[0]),p=>p.channels.pop(),p=>p.channels[0].platform='UNKNOWN',p=>p.channels[0].stateCode='UNKNOWN',p=>p.channels[0].fees='3',p=>p.channels[0].asOf='today',p=>p.schedules[0].date='2026-02-30',p=>p.schedules[0].platform='UNKNOWN',p=>p.schedules=Array(101).fill(p.schedules[0])];
 for(const mutate of mutations){const p=payload();mutate(p);assert.deepEqual(await create({fetch:async()=>Response.json(p)})(),{status:'UNAVAILABLE',summary:null,channels:[],schedules:[],period:null,generatedAt:null});}
});
test('settlement reports authentication and server timeout without financial values',async()=>{
 for(const [status,expected] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[504,'TIMEOUT'],[500,'UNAVAILABLE']])assert.deepEqual(await create({fetch:async()=>Response.json(payload(),{status})})(),{status:expected,summary:null,channels:[],schedules:[],period:null,generatedAt:null});
});
test('settlement cancellation aborts an active authenticated read',async()=>{
 const controller=new AbortController();let upstream;
 const pending=create({fetch:async(url,options)=>{upstream=options.signal;return Response.json(payload());}})({signal:controller.signal});controller.abort();
 assert.equal((await pending).status,'CANCELLED');assert.equal(upstream.aborted,true);
});
test('settlement enforces default 30 second deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let done=false;
 const pending=create({fetch:()=>new Promise(()=>{})})().then(result=>{done=true;return result;});
 t.mock.timers.tick(29999);await new Promise(setImmediate);assert.equal(done,false);
 t.mock.timers.tick(1);assert.equal((await pending).status,'TIMEOUT');
});
test('settlement rejects redirects and oversized streaming or advertised bodies',async()=>{
 const cases=[()=>{const response=Response.json(payload());Object.defineProperty(response,'redirected',{value:true});return response;},()=>{const response=Response.json(payload());Object.defineProperty(response,'url',{value:'https://other.example'});return response;},()=>Response.json(payload(),{headers:{'content-length':'262145'}}),()=>new Response(JSON.stringify({...payload(),extra:'x'.repeat(262145)}))];
 for(const make of cases)assert.equal((await create({fetch:async()=>make()})()).status,'UNAVAILABLE');
});
test('settlement accepts the existing server projection including explicit unknown timestamps',async()=>{
 const {buildWorkspaceSettlementSummary}=require('../../lib/tenancy/workspace-settlement-summary.js');
 const {buildUnifiedSettlementCenter}=require('../../lib/settlement/unified-center.js');
 const p=buildWorkspaceSettlementSummary({generatedAt:null,unifiedSettlement:buildUnifiedSettlementCenter({now:new Date('2026-09-09T09:00:00Z'),periodDays:30})});
 const result=await create({fetch:async()=>Response.json({ok:true,...p})})();
 assert.equal(result.status,'READY');assert.equal(result.generatedAt,null);assert.deepEqual(result.summary.actual,{value:null,status:'BLOCKED'});assert.equal(result.channels.length,4);
});
test('settlement validates construction and never fetches for a cancelled caller',async()=>{
 for(const timeoutMs of [0,-1,30001,1.5,'30'])assert.throws(()=>create({fetch:async()=>{},timeoutMs}),TypeError);
 assert.throws(()=>create({}),TypeError);
 const controller=new AbortController();controller.abort();
 assert.equal((await create({fetch:()=>{throw Error('must not fetch');}})({signal:controller.signal})).status,'CANCELLED');
 assert.equal((await create({fetch:()=>new Promise(()=>{}),timeoutMs:5})()).status,'TIMEOUT');
});
