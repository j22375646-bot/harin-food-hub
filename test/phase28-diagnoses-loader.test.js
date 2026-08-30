'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28DiagnosisSnapshot}=require('../lib/reports/phase28-diagnosis-snapshot.js');

function query(result,calls){
  const chain={
    select(value){calls.push({method:'select',value});return chain;},
    eq(field,value){calls.push({method:'eq',field,value});return chain;},
    order(value,options){calls.push({method:'order',value,options});return chain;},
    limit(value){calls.push({method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('진단 경량 로더는 최신 요약과 버전 머리글만 읽는다',async()=>{
  const calls=[];
  const db={from(table){calls.push({method:'from',value:table});return query(calls.filter(item=>item.method==='from').length===1?{data:[{id:'latest',summary_json:{score:80}}],error:null}:{data:[{id:'latest'},{id:'old'}],error:null},calls);}};
  const result=await loadPhase28DiagnosisSnapshot({db,now:new Date('2026-08-29T01:42:00Z')});
  assert.equal(result.latestReports.length,1);
  assert.equal(result.versionHeaders.length,2);
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['reports','reports']);
  const selects=calls.filter(call=>call.method==='select').map(call=>call.value);
  assert.equal(selects[0].includes('summary_json'),true);
  assert.equal(selects[1].includes('summary_json'),false);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[24,80]);
  assert.equal(calls.some(call=>['actions','action_evaluations','financial_change_requests'].includes(call.value)),false);
});

test('최신 진단 조회 실패는 빈 성공 목록으로 숨기지 않는다',async()=>{
  let index=0;
  const db={from(){index+=1;return query(index===1?{data:null,error:{message:'latest failed'}}:{data:[],error:null},[]);}};
  await assert.rejects(()=>loadPhase28DiagnosisSnapshot({db}),/latest failed/);
});

test('인사이트 누적 진단은 경량 머리글을 최대 96건까지 요청할 수 있다',async()=>{
  const calls=[];
  const db={from(){return query({data:[],error:null},calls);}};
  await loadPhase28DiagnosisSnapshot({db,latestLimit:96,versionLimit:120});
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[96,120]);
});

test('인사이트 목록은 쓰지 않는 버전 이력을 조회하지 않을 수 있다',async()=>{
  const calls=[];
  const db={from(){return query({data:[],error:null},calls);}};
  await loadPhase28DiagnosisSnapshot({db,latestLimit:96,versionLimit:0});
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[96]);
});
