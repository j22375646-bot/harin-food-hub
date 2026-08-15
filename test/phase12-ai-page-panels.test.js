const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAiPagePanels } = require('../lib/ai/page-panels.js');

test('AI 분석 위치는 기존 여섯 운영 화면과 13-7 실행 흐름을 포함하고 기본 실행은 잠근다',()=>{
  const panels=buildAiPagePanels({
    dataHealth:{channels:[
      {platform:'CAFE24',calculationStatus:'READY'},
      {platform:'NAVER',calculationStatus:'READY'},
      {platform:'COUPANG',calculationStatus:'READY'}
    ]},
    priorityCenter:{items:[{},{}]},
    productOperations:{summary:{sellable:7}},
    unifiedOrders:{summary:{actionRequired:4}},
    customerService:{summary:{active:3,overdue:1}},
    unifiedInventory:{summary:{action_required:3}},
    unifiedSettlement:{summary:{check_required_channels:0}},
    searchTermCenter:{items:[{},{}]},
    aiConfiguration:{execution_enabled:false}
  });
  assert.deepEqual(Object.keys(panels),['main','insight','keyword','product','orders','cs','inventory','settlement','collection','notifications','reports','changes','validation','experiments']);
  assert.equal(panels.main.execution_enabled,false);
  assert.equal(panels.product.metric_value,'7개');
  assert.match(panels.keyword.summary,/검색어/);
  assert.equal(panels.orders.metric_value,'4건');
  assert.equal(panels.cs.metric_value,'3건');
  assert.notEqual(panels.orders.id,panels.cs.id);
});

test('자료가 부족한 분석은 0원 결론 대신 확인 필요 상태가 된다',()=>{
  const panels=buildAiPagePanels({dataHealth:{channels:[]}});
  assert.equal(panels.keyword.readiness,'CHECK_REQUIRED');
  assert.equal(panels.product.readiness,'CHECK_REQUIRED');
});

test('상품 요약 필드가 없어도 실제 판매 중 채널을 가진 상품만 센다',()=>{
  const panels=buildAiPagePanels({productOperations:{items:[
    {channels:{CAFE24:{state:'ACTIVE'},NAVER:{state:'MISSING'}}},
    {channels:{CAFE24:{state:'STOPPED'},NAVER:{state:'OUT_OF_STOCK'}}},
    {channels:{COUPANG:{state:'ACTIVE'}}}
  ]}});
  assert.equal(panels.product.metric_value,'2개');
});

test('AI 분석 기간은 UTC가 아니라 한국 영업일을 사용한다',()=>{
  const panels=buildAiPagePanels({generatedAt:'2026-08-14T16:30:00.000Z'});
  assert.equal(panels.main.period,'2026-08-15');
});
