const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pageResults = require('../lib/ai/page-results.js');

function sample(overrides = {}) {
  return pageResults.buildPagePreview({
    page:'main',
    period:'2026-08-01 ~ 2026-08-15',
    generatedAt:'2026-08-15T06:10:00.000Z',
    dataStatus:'READY',
    metrics:{primary_value:3,primary_label:'확인할 운영 항목'},
    panel:{
      metric_label:'확인할 운영 항목',
      metric_value:'3개',
      readiness_label:'자료 준비됨',
      sources:['매출 목표','채널 상태']
    },
    ...overrides
  });
}

test('12-5D server preview is deterministic and never represents an OpenAI call',()=>{
  const first=sample();
  const second=sample();
  assert.equal(first.input_fingerprint,second.input_fingerprint);
  assert.equal(first.snapshot.safety.openai_called,false);
  assert.equal(first.snapshot.safety.platform_writes_allowed,false);
  assert.equal(first.result.decision_status,'PREVIEW');
  assert.equal(first.result.confidence,'MEDIUM');
});

test('stale or missing page data is stored as a blocked decision preview',()=>{
  const preview=sample({dataStatus:'STALE'});
  assert.equal(preview.result.decision_status,'BLOCKED');
  assert.equal(preview.result.confidence,'LOW');
});

test('page preview rejects private fields before signing or saving',()=>{
  assert.throws(()=>sample({metrics:{customer_name:'홍길동'}}),error=>error?.code==='PII_BLOCKED');
});

test('page result API stays server-only and declares zero OpenAI cost',()=>{
  const route=fs.readFileSync(path.join(__dirname,'../app/api/ai/page-results/route.js'),'utf8');
  assert.doesNotMatch(route,/from ['"]openai['"]/);
  assert.match(route,/openai_called:false,cost_krw:0/);
  assert.match(route,/verifyAiSnapshot/);
  assert.match(route,/roleAtLeast\(session,'OWNER'\)/);
});

test('page result migration keeps the table private and supports the initial six pages',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260815160000_add_ai_page_result_previews.sql'),'utf8');
  for(const page of ['main','insight','keyword','product','inventory','settlement'])assert.match(sql,new RegExp(`'${page}'`));
  assert.match(sql,/result_mode in \('SERVER_PREVIEW','OPENAI'\)/);
  assert.match(sql,/revoke all on public\.ai_analysis_results from anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete on public\.ai_analysis_results to service_role/);
});

test('13-9 keeps all page AI contracts and result types independent',()=>{
  const expected={
    main:'PAGE_MAIN',
    insight:'PAGE_INSIGHT',
    keyword:'PAGE_KEYWORD',
    product:'PAGE_PRODUCT',
    orders:'PAGE_ORDERS',
    cs:'PAGE_CS',
    inventory:'PAGE_INVENTORY',
    settlement:'PAGE_SETTLEMENT',
    collection:'PAGE_COLLECTION',
    notifications:'PAGE_NOTIFICATIONS',
    reports:'PAGE_REPORTS',
    changes:'PAGE_CHANGES',
    validation:'PAGE_VALIDATION',
    experiments:'PAGE_EXPERIMENTS'
  };
  assert.deepEqual(pageResults.ANALYSIS_TYPES,expected);
  assert.equal(new Set(Object.values(expected)).size,Object.keys(expected).length);
  for(const [page,analysisType] of Object.entries(expected)){
    const preview=sample({page});
    assert.equal(preview.snapshot.page,page);
    assert.equal(preview.snapshot.analysis_type,analysisType);
  }
});

test('13-9 ignores a result whose analysis type belongs to another page',()=>{
  const rows=[
    {id:'wrong',page_key:'main',analysis_type:'PAGE_PRODUCT',status:'PREVIEW',result_mode:'SERVER_PREVIEW',result:{}},
    {id:'right',page_key:'main',analysis_type:'PAGE_MAIN',status:'PREVIEW',result_mode:'SERVER_PREVIEW',result:{}},
    {id:'product',page_key:'product',analysis_type:'PAGE_PRODUCT',status:'PREVIEW',result_mode:'SERVER_PREVIEW',result:{}}
  ];
  const latest=pageResults.latestByPage(rows);
  assert.equal(latest.main.id,'right');
  assert.equal(latest.main.analysis_type,'PAGE_MAIN');
  assert.equal(latest.product.id,'product');
});

test('13-9 page result API filters by both page and analysis type',()=>{
  const route=fs.readFileSync(path.join(__dirname,'../app/api/ai/page-results/route.js'),'utf8');
  assert.match(route,/\.eq\('page_key',page\)\.eq\('analysis_type',analysisType\)/);
  assert.match(route,/analysis_type,page_key/);
});

test('14-8 database constraint rejects cross-page AI result reuse including collection and notifications',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260816120000_add_collection_notification_ai_page_scopes.sql'),'utf8');
  assert.match(sql,/ai_analysis_results_page_scope_match_check/);
  for(const [page,analysisType] of Object.entries(pageResults.ANALYSIS_TYPES)){
    assert.match(sql,new RegExp(`page_key = '${page}' and analysis_type = '${analysisType}'`));
  }
});
