'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28ExperimentsSnapshot}=require('../lib/experiments/phase28-experiments-snapshot.js');

function query(result,calls){
  const chain={
    select(value){calls.push({method:'select',value});return chain;},
    eq(value,target){calls.push({method:'eq',value,target});return chain;},
    order(value,options){calls.push({method:'order',value,options});return chain;},
    limit(value){calls.push({method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('A/B 테스트 경량 로더는 실험·기준값·판매상품만 명시 필드와 제한 수로 읽는다',async()=>{
  const calls=[];
  const dataByTable={
    ab_tests:[{id:'test-1',ab_test_variants:[]}],
    performance_benchmarks:[{id:'benchmark-1',platform:'NAVER',metric:'ROAS',target_value:500}],
    master_products:[{id:'product-1',name:'작두콩차'}]
  };
  const db={from(table){calls.push({method:'from',value:table});return query({data:dataByTable[table],error:null},calls);}};
  const result=await loadPhase28ExperimentsSnapshot({
    db,masterProductId:'product-1',now:new Date('2026-08-30T02:10:00Z'),
    getCurrentMetric:async()=>({value:420,sample:140,basis:'NAVER_API',period_start:'2026-08-24',period_end:'2026-08-30'})
  });

  assert.equal(result.tests.length,1);
  assert.equal(result.comparisons[0].status,'WATCH');
  assert.equal(result.selectedProduct.name,'작두콩차');
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['ab_tests','performance_benchmarks','master_products']);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[60,24,200]);
  assert.equal(calls.filter(call=>call.method==='select').some(call=>call.value.includes('*')),false);
  assert.ok(calls.some(call=>call.method==='eq'&&call.value==='master_product_id'&&call.target==='product-1'));
});

test('실험 목록 실패는 실패로 올리고 기준값·상품 조회 실패는 부분 상태로 남긴다',async()=>{
  const failedDb={from(table){return query({data:[],error:table==='ab_tests'?{message:'tests failed'}:null},[]);}};
  await assert.rejects(()=>loadPhase28ExperimentsSnapshot({db:failedDb,getCurrentMetric:async()=>({})}),/tests failed/);

  const partialDb={from(table){return query({data:[],error:table!=='ab_tests'?{message:`${table} failed`}:null},[]);}};
  const partial=await loadPhase28ExperimentsSnapshot({db:partialDb,getCurrentMetric:async()=>({})});
  assert.match(partial.benchmarksError,/performance_benchmarks failed/);
  assert.match(partial.productsError,/master_products failed/);
  assert.deepEqual(partial.benchmarks,[]);
});
