'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28ChangesSnapshot}=require('../lib/changes/phase28-changes-snapshot.js');

function query(result,calls){
  const chain={
    select(value){calls.push({method:'select',value});return chain;},
    order(value,options){calls.push({method:'order',value,options});return chain;},
    limit(value){calls.push({method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('변경 경량 로더는 변경 요청과 감사 머리글만 읽고 무거운 분석 자료를 제외한다',async()=>{
  const calls=[];
  const db={from(table){calls.push({method:'from',value:table});return query(table==='financial_change_requests'?{data:[{id:'change'}],error:null}:{data:[{id:'audit'}],error:null},calls);}};
  const result=await loadPhase28ChangesSnapshot({db,now:new Date('2026-08-29T01:42:00Z'),naverWriteEnabled:false});
  assert.equal(result.requests.length,1);
  assert.equal(result.audits.length,1);
  assert.equal(result.naverWriteEnabled,false);
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['financial_change_requests','financial_change_audit_logs']);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[50,300]);
  assert.equal(calls.some(call=>['reports','actions','action_evaluations','ab_tests','naver_keyword_stats'].includes(call.value)),false);
  assert.equal(calls.filter(call=>call.method==='select')[0].value.includes('*'),false);
});

test('변경 요청 조회 실패는 빈 성공 목록으로 숨기지 않고 감사 조회 실패만 부분 상태로 둔다',async()=>{
  let index=0;
  const db={from(){index+=1;return query(index===1?{data:null,error:{message:'requests failed'}}:{data:[],error:{message:'audits failed'}},[]);}};
  await assert.rejects(()=>loadPhase28ChangesSnapshot({db}),/requests failed/);

  index=0;
  const partialDb={from(){index+=1;return query(index===1?{data:[{id:'change'}],error:null}:{data:null,error:{message:'audits failed'}},[]);}};
  const partial=await loadPhase28ChangesSnapshot({db:partialDb});
  assert.equal(partial.requests.length,1);
  assert.deepEqual(partial.audits,[]);
  assert.equal(partial.auditsError,'audits failed');
});
