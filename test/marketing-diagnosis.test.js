const test = require('node:test');
const assert = require('node:assert/strict');
const diagnosis = require('../lib/marketing/diagnosis.js');

test('키워드 검색 의도를 쉬운 다섯 가지로 분류한다', () => {
  assert.equal(diagnosis.classifyKeywordIntent('작두콩차 가격 비교'), 'PURCHASE');
  assert.equal(diagnosis.classifyKeywordIntent('비염에 마시는 차'), 'PROBLEM');
  assert.equal(diagnosis.classifyKeywordIntent('부모님 선물 차'), 'SITUATION');
  assert.equal(diagnosis.classifyKeywordIntent('작두콩차 효능'), 'INFORMATION');
  assert.equal(diagnosis.classifyKeywordIntent('국산 작두콩차'), 'PRODUCT');
});

test('표본이 적으면 중지를 권하지 않고 더 지켜보게 한다', () => {
  assert.equal(diagnosis.decideAction({ clicks:9, conversions:0, cost:5225 }, 250), 'WATCH');
  assert.equal(diagnosis.confidenceFor({ clicks:9, conversions:0 }), 'LOW');
  assert.equal(diagnosis.decideAction({ clicks:50, conversions:0, cost:50000 }, 250), 'STOP_REVIEW');
});

test('검색 노출부터 매출까지 연결하고 건강 표현과 자료 공백을 표시한다', () => {
  const result = diagnosis.buildMarketingDiagnosis({
    keywordStats:[{ ncc_keyword_id:'k1', keyword:'작두콩차효능', impressions:493, clicks:9, cost:5225, conversions:0, conversion_revenue:0 }],
    naverKeywords:[{ ncc_keyword_id:'k1', ncc_adgroup_id:'g1' }],
    masterProducts:[{ id:'p1', name:'하린식품 작두콩차 30g(30TB)', selling_price:11000 }],
    channelProducts:[],
    checklists:[],
    period:{ period_start:'2026-08-06', period_end:'2026-08-12' }
  });
  assert.equal(result.totals.impressions, 493);
  assert.equal(result.totals.visits, 9);
  assert.equal(result.items[0].intent, 'INFORMATION');
  assert.equal(result.items[0].compliance.status, 'WARNING');
  assert.match(result.items[0].checks.review.label, /연결 대기/);
  assert.equal(result.items[0].action_label, '더 지켜보기');
  assert.match(result.items[0].recommendation, /광고·상세페이지 문구/);
});

test('가격, 재고, 상세페이지를 함께 점검한다', () => {
  const result = diagnosis.buildMarketingDiagnosis({
    keywordStats:[{ ncc_keyword_id:'k1', keyword:'작두콩차', impressions:1000, clicks:50, cost:60000, conversions:0, conversion_revenue:0 }],
    naverKeywords:[{ ncc_keyword_id:'k1', ncc_adgroup_id:'g1' }],
    masterProducts:[{ id:'p1', name:'작두콩차 30TB', selling_price:10000 }],
    channelProducts:[
      { platform:'NAVER', external_product_id:'g1', master_product_id:'p1', selling_price:10000 },
      { platform:'COUPANG', external_product_id:'s1', master_product_id:'p1', selling_price:15000 }
    ],
    productItems:[{ seller_product_id:'s1', vendor_item_id:'v1' }],
    itemInventory:[{ vendor_item_id:'v1', quantity:0, status:'OUT_OF_STOCK' }],
    checklists:[{ master_product_id:'p1', items:{ hero_value:true, customer_problem:true } }]
  });
  const item = result.items[0];
  assert.equal(item.action, 'STOP_REVIEW');
  assert.equal(item.checks.price.status, 'WARNING');
  assert.equal(item.checks.inventory.status, 'WARNING');
  assert.equal(item.checks.detail.status, 'WARNING');
});
