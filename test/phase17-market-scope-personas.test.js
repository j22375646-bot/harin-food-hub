'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const profile=require('../lib/market-intelligence/market-profile.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('17-4 fixes reusable L0-L5 and EX scope without product-specific copy',()=>{
  assert.deepEqual(profile.SCOPE_LEVELS,['L0','L1','L2','L3','L4','L5','EX']);
  assert.equal(profile.validateScope({scope_level:'L2',label:'무카페인 차 시장',evidence_ids:[]}).scope_level,'L2');
  assert.throws(()=>profile.validateScope({scope_level:'L6',label:'잘못된 단계'}),/단계/);
  assert.doesNotMatch(read('app/market-intelligence/[projectId]/market/market-profile-client.js'),/작수차/);
});

test('17-4 stores review aggregates only and enforces honest sample safeguards',()=>{
  const review=profile.validateReview({platform:'NAVER',review_set_name:'최근 90일',sample_size:12,positive_count:8,neutral_count:2,negative_count:2,pain_points:['구성이 헷갈림'],evidence_ids:[]});
  assert.equal(review.sample_size,12);
  assert.deepEqual(review.pain_points,['구성이 헷갈림']);
  assert.throws(()=>profile.validateReview({platform:'NAVER',review_set_name:'오류',sample_size:10,positive_count:11}),/전체 표본/);
  const sql=read('supabase/migrations/20260816194243_add_market_scope_reviews_personas.sql');
  const reviewTable=sql.slice(sql.indexOf('create table if not exists public.market_review_insights'),sql.indexOf('create index if not exists market_review_insights'));
  assert.doesNotMatch(reviewTable,/review_text|customer_name|order_id|phone|contact/i);
  assert.match(sql,/Raw review text, names, order IDs and contact details are intentionally not stored/);
});

test('17-4 blocks personas until verified reviews reach ten samples',()=>{
  assert.throws(()=>profile.buildPersonaDraft([{id:'r1',status:'VERIFIED',sample_size:9}]),error=>error.code==='PERSONA_EVIDENCE_NOT_READY');
  const draft=profile.buildPersonaDraft([{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'VERIFIED',sample_size:12,desired_outcomes:['간편한 차'],purchase_contexts:['사무실'],objections:['맛 걱정'],pain_points:['구성 혼란'],evidence_ids:['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']}]);
  assert.equal(draft.persona_name,'간편한 차 중심 고객');
  assert.equal(draft.sample_size,12);
  assert.deepEqual(draft.source_review_ids,['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  assert.equal(draft.status,'REVIEW_REQUIRED');
});

test('17-4 migration isolates products and verified evidence behind service role RLS',()=>{
  const sql=read('supabase/migrations/20260816194243_add_market_scope_reviews_personas.sql');
  for(const table of ['market_scope_entries','market_review_insights','market_personas']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/security invoker/gi);
  assert.match(sql,/market_verified_evidence_match/);
  assert.match(sql,/revoke all on table public\.market_scope_entries, public\.market_review_insights, public\.market_personas\s+from public, anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete[\s\S]+to service_role/);
  assert.match(sql,/MARKET_SCOPE_L0_SEEDED/);
  assert.match(sql,/record_market_project_version/);
});

test('17-4 exposes authenticated actions and keeps page AI separate',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/market-profile/route.js');
  const ui=read('app/market-intelligence/[projectId]/market/market-profile-client.js');
  const page=read('app/market-intelligence/[projectId]/workspace-page.js');
  for(const action of ['SAVE_SCOPE','SAVE_REVIEW','DRAFT_PERSONA','SAVE_PERSONA'])assert.match(route,new RegExp(action));
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(ui,/리뷰 원문·이름·주문번호·연락처는 저장하지 않고/);
  assert.match(ui,/판단 보류/);
  assert.match(ui,/HarinProgressiveDetails/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE|OPENAI_API_KEY/);
  assert.match(page,/MarketProfileWorkbench/);
  assert.match(page,/이 페이지의 AI/);
});

test('17-4 V8 layout preserves readable touch controls and mobile stacking',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(css,/Phase 17-4/);
  assert.match(css,/\.marketScopeLevels>button\{[^}]*min-height:174px/);
  assert.match(css,/\.marketProfileFields input[^}]*min-height:48px/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[\s\S]*\.marketProfileKpis/);
});
