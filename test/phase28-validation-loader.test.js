'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28ValidationSnapshot}=require('../lib/validation/phase28-validation-snapshot.js');

function query(result,calls){
  const chain={
    select(value){calls.push({method:'select',value});return chain;},
    order(value,options){calls.push({method:'order',value,options});return chain;},
    gte(value,target){calls.push({method:'gte',value,target});return chain;},
    limit(value){calls.push({method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('실행검증 경량 로더는 7·14일 판단과 90일 재구매에 필요한 6개 자료군만 명시 필드로 읽는다',async()=>{
  const calls=[];
  const dataByTable={actions:[{id:'a'}],action_evaluations:[{id:'e'}],reports:[{id:'r'}],ab_tests:[{id:'x'}],cafe24_orders:[{order_id:'o'}],cafe24_order_items:[{order_id:'o'}]};
  const db={from(table){calls.push({method:'from',value:table});return query({data:dataByTable[table]||[],error:null},calls);}};
  const result=await loadPhase28ValidationSnapshot({db,now:new Date('2026-08-29T01:42:00Z')});
  assert.equal(result.actions.length,1);
  assert.equal(result.orders.length,1);
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['actions','action_evaluations','reports','ab_tests','cafe24_orders','cafe24_order_items']);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[100,240,50,80,1200,4000]);
  assert.equal(calls.filter(call=>call.method==='select').some(call=>call.value.includes('*')),false);
  assert.equal(calls.filter(call=>call.method==='gte').length,1);
});

test('핵심 실행 조회 실패는 실패로 올리고 고객·보고서·실험 실패는 부분 상태로 보존한다',async()=>{
  const failedDb={from(table){return query({data:[],error:table==='actions'?{message:'actions failed'}:null},[]);}};
  await assert.rejects(()=>loadPhase28ValidationSnapshot({db:failedDb}),/actions failed/);

  const partialDb={from(table){const secondary=['reports','ab_tests','cafe24_orders','cafe24_order_items'].includes(table);return query({data:[],error:secondary?{message:`${table} failed`}:null},[]);}};
  const partial=await loadPhase28ValidationSnapshot({db:partialDb});
  assert.match(partial.reportsError,/reports failed/);
  assert.match(partial.experimentsError,/ab_tests failed/);
  assert.match(partial.customerError,/cafe24_orders failed/);
  assert.deepEqual(partial.orders,[]);
});
