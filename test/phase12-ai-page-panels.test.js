const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAiPagePanels } = require('../lib/ai/page-panels.js');

test('12-5A는 여섯 운영 화면의 AI 분석 위치를 만들고 기본 실행은 잠근다',()=>{
  const panels=buildAiPagePanels({
    dataHealth:{channels:[
      {platform:'CAFE24',calculationStatus:'READY'},
      {platform:'NAVER',calculationStatus:'READY'},
      {platform:'COUPANG',calculationStatus:'READY'}
    ]},
    priorityCenter:{items:[{},{}]},
    productOperations:{summary:{sellable:7}},
    unifiedInventory:{summary:{action_required:3}},
    unifiedSettlement:{summary:{check_required_channels:0}},
    searchTermCenter:{items:[{},{}]},
    aiConfiguration:{execution_enabled:false}
  });
  assert.deepEqual(Object.keys(panels),['main','insight','keyword','product','inventory','settlement']);
  assert.equal(panels.main.execution_enabled,false);
  assert.equal(panels.product.metric_value,'7개');
  assert.match(panels.keyword.summary,/검색어/);
});

test('자료가 부족한 분석은 0원 결론 대신 확인 필요 상태가 된다',()=>{
  const panels=buildAiPagePanels({dataHealth:{channels:[]}});
  assert.equal(panels.keyword.readiness,'CHECK_REQUIRED');
  assert.equal(panels.product.readiness,'CHECK_REQUIRED');
});
