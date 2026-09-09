'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const payload=()=>({ok:true,writePolicy:'READ_ONLY',generatedAt:null,channel:{platform:'NAVER',name:'네이버',reportCount:0,revenue:0,changeRate:null,profit:-1,cause:'원인 판단 보류',causeNote:'자료 확인',action:'검토',actionNote:'자동 적용 없음',currentPeriod:null},reports:[],caveats:['수집 확인 필요']});
const create=options=>require('../insights-transport.cjs').createInsightsTransport(options);
const detailed=()=>{const p=payload();p.channel.reportCount=1;p.reports=[{id:'r1',title:'주간',periodStart:null,periodEnd:null,createdAt:null,detail:{sections:[{title:'판단 근거',items:[{title:'유지',body:'<img src=x> 근거 확인',private:'SECRET'}]}],truncated:false,private:'SECRET'}}];return p;};
test('report detail projects safe text and accepts older overview responses',async()=>{
 const r=await create({fetch:async()=>Response.json(detailed())})();
 assert.deepEqual(r.reports[0].detail,{sections:[{title:'판단 근거',items:[{title:'유지',body:'<img src=x> 근거 확인'}]}],truncated:false});
 assert.doesNotMatch(JSON.stringify(r),/SECRET/);
 const p=detailed();delete p.reports[0].detail;assert.equal((await create({fetch:async()=>Response.json(p)})()).reports[0].detail,null);
});
test('malformed or oversized report details invalidate the entire response',async()=>{
 for(const change of [d=>d.truncated='false',d=>d.sections=Array(7).fill(d.sections[0]),d=>d.sections[0].items=Array(9).fill(d.sections[0].items[0]),d=>d.sections[0].items[0].body={},d=>d.sections[0].title='x'.repeat(501)]){
  const p=detailed();change(p.reports[0].detail);assert.equal((await create({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');
 }
});
test('insights fixed GET preserves zero negative unknown and projects private data away',async()=>{
 const result=await create({fetch:async(url,o)=>{assert.match(url,/\/insights$/);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.credentials,'include');return Response.json({...payload(),private:'SECRET'});}})();
 assert.equal(result.status,'READY');assert.equal(result.channel.revenue,0);assert.equal(result.channel.profit,-1);assert.equal(result.channel.changeRate,null);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});
test('insights rejects invalid channels numbers dates and oversized report lists',async()=>{
 for(const change of [p=>p.channel.platform='COUPANG',p=>p.channel.revenue='0',p=>p.channel.reportCount=21,p=>p.generatedAt='bad',p=>p.caveats=[{}],p=>p.reports=Array(21).fill({})]){
  const p=payload();change(p);assert.equal((await create({fetch:async()=>Response.json(p)})()).status,'UNAVAILABLE');
 }
});
test('insights auth timeout cancel and body limit never return metrics',async()=>{
 for(const [http,status] of [[401,'LOGIN_REQUIRED'],[403,'FORBIDDEN'],[504,'TIMEOUT']])assert.equal((await create({fetch:async()=>new Response('',{status:http})})()).status,status);
 assert.equal((await create({fetch:()=>new Promise(()=>{}),timeoutMs:5})()).status,'TIMEOUT');
 const c=new AbortController(),pending=create({fetch:()=>new Promise(()=>{})})({signal:c.signal});c.abort();assert.equal((await pending).status,'CANCELLED');
 assert.equal((await create({fetch:async()=>new Response('x'.repeat(262145))})()).status,'UNAVAILABLE');
});
