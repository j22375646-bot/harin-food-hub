'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28ExperimentsModel}=require('../lib/ui/phase28-adapters/index.js');

test('Phase 28 A/B 테스트는 상품·변형·표본·신뢰도·벤치마크를 한 판정 모델로 만든다',()=>{
  const model=buildPhase28ExperimentsModel({
    generatedAt:'2026-08-30T02:10:00Z',
    products:[{id:'product-1',name:'작두콩수세미차 30티백'}],
    selectedProduct:{id:'product-1',name:'작두콩수세미차 30티백'},
    tests:[{
      id:'test-1',name:'상세 상단 정보 순서',platform:'NAVER',metric:'CVR',status:'RUNNING',evaluation_status:'INSUFFICIENT_SAMPLE',
      hypothesis:'음용 장면을 먼저 보여주면 전환율이 높아질 것이다.',start_date:'2026-08-21',end_date:'2026-09-04',
      minimum_sample_size:100,confidence_level:95,minimum_detectable_lift:10,master_product_id:'product-1',
      result_summary:'표본 부족',
      ab_test_variants:[
        {id:'a',name:'원료 근거 먼저',is_control:true,clicks:80,conversions:8,orders:8,revenue:96000,cost:18000},
        {id:'b',name:'음용 장면 먼저',is_control:false,clicks:90,conversions:12,orders:12,revenue:144000,cost:21000}
      ]
    }],
    benchmarks:[{id:'benchmark-1',name:'네이버 목표 ROAS',platform:'NAVER',metric:'ROAS',target_value:500,warning_value:300,source_name:'내부 운영 기준'}],
    comparisons:[{benchmark_id:'benchmark-1',status:'RISK',value:240,sample:72,gap_percent:-52,basis:'NAVER_API'}]
  });

  assert.deepEqual(model.summary,{running:1,winners:0,waiting:1,risks:1});
  assert.equal(model.items[0].productLabel,'작두콩수세미차 30티백');
  assert.equal(model.items[0].variants[0].roleLabel,'A · 대조군');
  assert.equal(model.items[0].variants[1].roleLabel,'B · 실험군');
  assert.equal(model.items[0].samples.minimum,100);
  assert.equal(model.items[0].verdictLabel,'표본 대기');
  assert.equal(model.items[0].winner,null);
  assert.equal(model.benchmarks[0].statusLabel,'기준 미달');
  assert.equal(model.policy.minimumSampleBeforeWinner,true);
  assert.equal(model.policy.missingAsZero,false);
});

test('A/B 테스트 조회 실패는 빈 0건 성공이나 승자로 바꾸지 않는다',()=>{
  const model=buildPhase28ExperimentsModel({generatedAt:null,error:'ab_tests unavailable'});
  assert.equal(model.dataStatus,'ERROR');
  assert.equal(model.summary.running,null);
  assert.equal(model.summary.winners,null);
  assert.deepEqual(model.items,[]);
});
