'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

test('상품분석 저장 성공은 보고서를 반환하고 현재 경로 캐시를 새로고침한다',async()=>{
  let saveProductAnalysisReport=null;
  try{
    ({saveProductAnalysisReport}=require('../lib/analytics/product-analysis-save-flow.js'));
  }catch{}
  assert.equal(typeof saveProductAnalysisReport,'function','상품분석 저장 흐름이 아직 경로 캐시 갱신을 제공하지 않습니다.');

  const calls=[];
  const router={refresh(){calls.push('refresh');}};
  const report={id:'report-6',summary_json:{kind:'PRODUCT_ANALYSIS'}};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>({ok:true,report})};
  };

  const result=await saveProductAnalysisReport({
    fetchImpl,
    router,
    productId:'product-1',
    periodDays:30
  });

  assert.equal(result,report);
  assert.equal(calls[0].url,'/api/product-analysis');
  assert.deepEqual(JSON.parse(calls[0].options.body),{product_id:'product-1',period_days:30});
  assert.deepEqual(calls.slice(1),['refresh']);
});

test('상품분석 저장 실패는 경로 캐시를 새로고침하지 않는다',async()=>{
  const {saveProductAnalysisReport}=require('../lib/analytics/product-analysis-save-flow.js');
  let refreshCount=0;
  const fetchImpl=async()=>({ok:false,json:async()=>({ok:false,error:'저장 실패'})});

  await assert.rejects(
    ()=>saveProductAnalysisReport({fetchImpl,router:{refresh(){refreshCount+=1;}},productId:'product-1',periodDays:30}),
    /저장 실패/
  );
  assert.equal(refreshCount,0);
});

test('저장 분석 삭제 성공은 보고서 식별자와 생성 시각을 보내고 현재 경로를 새로고침한다',async()=>{
  const {deleteProductAnalysisReport}=require('../lib/analytics/product-analysis-save-flow.js');
  assert.equal(typeof deleteProductAnalysisReport,'function','브라우저 저장 분석 삭제 흐름이 없습니다.');
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>({ok:true,deleted:true,deleted_id:'11111111-1111-4111-8111-111111111111'})};
  };
  const result=await deleteProductAnalysisReport({
    fetchImpl,
    router:{refresh(){calls.push('refresh');}},
    reportId:'11111111-1111-4111-8111-111111111111',
    expectedCreatedAt:'2026-08-30T21:52:39.335969Z'
  });
  assert.equal(calls[0].url,'/api/product-analysis');
  assert.equal(calls[0].options.method,'DELETE');
  assert.deepEqual(JSON.parse(calls[0].options.body),{
    report_id:'11111111-1111-4111-8111-111111111111',
    expected_created_at:'2026-08-30T21:52:39.335969Z'
  });
  assert.deepEqual(calls.slice(1),['refresh']);
  assert.deepEqual(result,{ok:true,deleted:true,deleted_id:'11111111-1111-4111-8111-111111111111'});
});
