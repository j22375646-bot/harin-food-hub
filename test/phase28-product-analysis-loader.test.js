'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28ProductAnalysisSnapshot}=require('../lib/analytics/phase28-product-analysis-snapshot.js');

function query(table,result,calls){
  const chain={
    select(value){calls.push({table,method:'select',value});return chain;},
    eq(field,value){calls.push({table,method:'eq',field,value});return chain;},
    like(field,value){calls.push({table,method:'like',field,value});return chain;},
    order(value,options){calls.push({table,method:'order',value,options});return chain;},
    limit(value){calls.push({table,method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('상품분석 경량 로더 계약을 제공한다',()=>{
  assert.equal(typeof loadPhase28ProductAnalysisSnapshot,'function');
});

test('상품분석 첫 화면은 선택 상품과 채널 연결, 최근 저장 분석만 읽는다',async()=>{
  assert.equal(typeof loadPhase28ProductAnalysisSnapshot,'function');
  const calls=[];
  const responses={
    master_products:{data:[{id:'p-1',name:'보리차 50티백',selling_price:8900,is_active:true}],error:null},
    channel_products:{data:[{master_product_id:'p-1',platform:'NAVER',is_active:true}],error:null},
    reports:{data:[{id:'r-1',report_type:'PRODUCT_ANALYSIS_p-1',summary_json:{kind:'PRODUCT_ANALYSIS'}}],error:null}
  };
  const db={from(table){calls.push({table,method:'from'});return query(table,responses[table],calls);}};

  const result=await loadPhase28ProductAnalysisSnapshot({db,now:new Date('2026-08-29T01:42:00Z')});

  assert.equal(result.masterProducts.length,1);
  assert.equal(result.channelProducts.length,1);
  assert.equal(result.reports.length,1);
  assert.equal(result.generatedAt,'2026-08-29T01:42:00.000Z');
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.table),['master_products','channel_products','reports']);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[200,1000,24]);
  assert.deepEqual(calls.filter(call=>call.method==='eq').map(call=>[call.table,call.field,call.value]),[
    ['master_products','is_active',true],
    ['channel_products','is_active',true]
  ]);
  assert.deepEqual(calls.filter(call=>call.method==='like').map(call=>[call.table,call.field,call.value]),[
    ['reports','report_type','PRODUCT_ANALYSIS_%']
  ]);
  const forbidden=['cafe24_orders','cafe24_order_items','naver_keyword_stats','product_costs','coupang_orders','coupang_ad_keyword_daily','ai_analysis_results'];
  assert.equal(calls.some(call=>call.method==='from'&&forbidden.includes(call.table)),false);
});

test('저장 분석 조회 실패를 분석 0건으로 숨기지 않는다',async()=>{
  assert.equal(typeof loadPhase28ProductAnalysisSnapshot,'function');
  const calls=[];
  const db={from(table){
    const result=table==='reports'?{data:null,error:{message:'saved reports failed'}}:{data:[],error:null};
    return query(table,result,calls);
  }};
  await assert.rejects(()=>loadPhase28ProductAnalysisSnapshot({db}),/saved reports failed/);
});
