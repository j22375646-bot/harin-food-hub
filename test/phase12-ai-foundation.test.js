const test = require('node:test');
const assert = require('node:assert/strict');
const privacy = require('../lib/ai/privacy.js');
const client = require('../lib/ai/openai-client.js');
const foundation = require('../lib/ai/foundation.js');

function board(overrides={}) {
  return {
    formula_version:'n3-v1',period_start:'2026-08-07',period_end:'2026-08-13',target_roas:250,
    data_trust:{status:'READY',notes:['광고 자료 정상']},
    metrics:[{key:'AD_ROAS',label:'광고 ROAS',value:220,unit:'%',status:'READY',evidence:'전환매출 ÷ 광고비'}],
    current:{impressions:1000,clicks:50,spend:100000,conversions:5,revenue:220000,roas:220},
    previous:{impressions:900,clicks:45,spend:90000,conversions:4,revenue:180000,roas:200},
    bottleneck:{key:'PURCHASE',label:'구매 전환',status:'RISK',reason:'목표보다 낮음'},
    levers:[{key:'CVR',label:'구매전환율',status:'READY',current:10,target:12,unit:'%',change_rate:20,action:'상세페이지 점검'}],
    ...overrides
  };
}

test('AI 스냅샷은 서버 집계값만 포함하고 주문·고객 필드를 만들지 않는다',()=>{
  const snapshot=foundation.buildNaverAiSnapshot(board());
  const raw=JSON.stringify(snapshot);
  assert.equal(snapshot.analysis_type,'NAVER_EXECUTIVE_EXPLANATION');
  assert.equal(raw.includes('order_id'),false);
  assert.equal(raw.includes('customer'),false);
  assert.equal(snapshot.safety.platform_writes_allowed,false);
});

test('연락처·이메일·주소와 금지 필드는 OpenAI 호출 전에 차단한다',()=>{
  assert.throws(()=>privacy.assertNoPii({phone:'010-1234-5678'}),error=>error.code==='PII_BLOCKED');
  assert.throws(()=>privacy.assertNoPii({safe:'owner@example.com'}),error=>error.code==='PII_BLOCKED');
  assert.throws(()=>privacy.assertNoPii({address:'서울시 강남구 테헤란로 12'}),error=>error.code==='PII_BLOCKED');
});

test('Responses API 요청은 Structured Outputs를 강제하고 저장·쓰기 도구를 끈다',()=>{
  const body=client.buildRequestBody(foundation.buildNaverAiSnapshot(board()),{model:'gpt-5.6-luna'});
  assert.equal(body.store,false);
  assert.equal(body.text.format.type,'json_schema');
  assert.equal(body.text.format.strict,true);
  assert.equal(body.tools,undefined);
  assert.match(body.instructions,/직접 변경/);
});

test('벡터 저장소가 있을 때만 File Search를 붙인다',()=>{
  const body=client.buildRequestBody(foundation.buildNaverAiSnapshot(board()),{vectorStoreId:'vs_test'});
  assert.deepEqual(body.tools,[{type:'file_search',vector_store_ids:['vs_test'],max_num_results:4}]);
  assert.deepEqual(body.include,['file_search_call.results']);
});

test('OpenAI 사용 한도가 없으면 사장님이 이해할 수 있는 안내를 반환한다',async()=>{
  const previous=process.env.OPENAI_API_KEY;
  const previousEnabled=process.env.OPENAI_ANALYSIS_ENABLED;
  process.env.OPENAI_API_KEY='sk-test-only';
  process.env.OPENAI_ANALYSIS_ENABLED='true';
  try {
    await assert.rejects(
      client.createStructuredExplanation(foundation.buildNaverAiSnapshot(board()),{
        fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{code:'insufficient_quota'}})})
      }),
      error=>error.code==='insufficient_quota'&&error.status===429&&/사용 한도/.test(error.message)
    );
  } finally {
    if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;
    if(previousEnabled===undefined)delete process.env.OPENAI_ANALYSIS_ENABLED;else process.env.OPENAI_ANALYSIS_ENABLED=previousEnabled;
  }
});

test('크레딧을 쓰기 전에는 AI 실행이 환경 설정으로 잠긴다',async()=>{
  const previous=process.env.OPENAI_ANALYSIS_ENABLED;
  delete process.env.OPENAI_ANALYSIS_ENABLED;
  try {
    assert.equal(client.configuration().execution_enabled,false);
    await assert.rejects(
      client.createStructuredExplanation(foundation.buildNaverAiSnapshot(board())),
      error=>error.code==='AI_EXECUTION_DISABLED'&&error.status===503
    );
  } finally {
    if(previous!==undefined)process.env.OPENAI_ANALYSIS_ENABLED=previous;
  }
});

test('데이터 신뢰도가 막히면 API를 호출하지 않고 판단 보류를 저장한다',async()=>{
  let called=false;
  const inserts=[];
  const db={
    from(){
      return {
        select(){return this;},
        eq(){return this;},
        in(){return this;},
        order(){return this;},
        limit(){return this;},
        maybeSingle:async()=>({data:null,error:null}),
        insert(value){
          inserts.push(value);
          return {select(){return {single:async()=>({data:{id:'row-1',created_at:'2026-08-14T00:00:00Z'},error:null})};}};
        }
      };
    }
  };
  const snapshot=foundation.buildNaverAiSnapshot(board({data_trust:{status:'BLOCKED',notes:['원가 자료 확인 필요']}}));
  const result=await foundation.explainSnapshot({snapshot,db,createExplanation:async()=>{called=true;}});
  assert.equal(called,false);
  assert.equal(result.result.decision_status,'BLOCKED');
  assert.equal(inserts[0].status,'BLOCKED');
});
