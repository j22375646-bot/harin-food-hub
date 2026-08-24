'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const detailWorkbench=require('../lib/marketing/keyword-detail-workbench.js');

test('25-7 turns one Naver keyword into an honest decision, evidence, history, and AI-preview flow',()=>{
  const view=detailWorkbench.buildKeywordDetailWorkbench({
    platform:'NAVER',source:'REGISTERED',keyword:'작두콩차',decision:'LOWER',
    cost:18200,orders:0,roas:null,currentBid:320,recommendedBid:290,
    canDraft:true,freshness:'2026. 8. 25. 09:00',reasons:['무주문 광고비를 먼저 확인해주세요.']
  });

  assert.equal(view.platform,'NAVER');
  assert.equal(view.status,'ACTION_REQUIRED');
  assert.equal(view.headline,'광고비를 줄일지 먼저 검토해요');
  assert.deepEqual(view.sections,['DECISION','NAVER_EVIDENCE','NAVER_HISTORY','AI_PREVIEW']);
  assert.deepEqual(view.metrics,{
    cost:18200,orders:0,roas:null,current_bid:320,recommended_bid:290
  });
  assert.equal(view.ai_preview.mode,'SERVER_PREVIEW');
  assert.match(view.ai_preview.observation,/18,200원/);
  assert.match(view.ai_preview.observation,/주문 0건/);
  assert.match(view.ai_preview.recommendation,/290원/);
  assert.equal(view.write_mode,'NAVER_API_OWNER_CONFIRM');
});

test('25-7 keeps missing Naver performance unknown instead of presenting zero or a confident action',()=>{
  const view=detailWorkbench.buildKeywordDetailWorkbench({
    platform:'NAVER',source:'REGISTERED',keyword:'자료 없는 키워드',decision:'BLOCKED',
    cost:null,orders:null,roas:null,currentBid:null,recommendedBid:null,
    canDraft:false,reasons:['최신 광고 자료를 확인해주세요.']
  });

  assert.equal(view.status,'BLOCKED');
  assert.equal(view.headline,'입찰 변경 전에 자료를 확인해야 해요');
  assert.deepEqual(view.metrics,{
    cost:null,orders:null,roas:null,current_bid:null,recommended_bid:null
  });
  assert.match(view.ai_preview.observation,/광고비 판단 보류/);
  assert.match(view.ai_preview.observation,/주문 판단 보류/);
  assert.doesNotMatch(view.ai_preview.observation,/0원|0건/);
  assert.equal(view.ai_preview.confidence,'LOW');
});

test('25-7 never exposes Naver bid evidence or write controls in a Coupang keyword detail',()=>{
  const view=detailWorkbench.buildKeywordDetailWorkbench({
    platform:'COUPANG',source:'REGISTERED',keyword:'쿠팡 작두콩차',decision:'LOWER',
    applicationMode:'MANUAL_REQUIRED',cost:9200,orders:0,roas:0,
    currentBid:null,recommendedBid:null,canDraft:false,reasons:[]
  });

  assert.equal(view.platform,'COUPANG');
  assert.deepEqual(view.sections,['DECISION','COUPANG_MANUAL','AI_PREVIEW']);
  assert.equal(view.sections.includes('NAVER_EVIDENCE'),false);
  assert.equal(view.sections.includes('NAVER_HISTORY'),false);
  assert.equal(view.write_mode,'COUPANG_WING_MANUAL');
  assert.match(view.ai_preview.recommendation,/WING/);
});
