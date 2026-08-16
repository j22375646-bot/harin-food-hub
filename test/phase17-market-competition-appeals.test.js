'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const competition=require('../lib/market-intelligence/competition.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const id=value=>`${String(value).padStart(8,'0')}-aaaa-4aaa-8aaa-${String(value).padStart(12,'0')}`;

test('17-5 competitor and appeal validators remain reusable across products',()=>{
  const competitor=competition.validateCompetitor({platform:'NAVER',competitor_name:'비교 브랜드',product_name:'비교 상품',price_won:12000,evidence_ids:[]});
  assert.equal(competitor.platform,'NAVER');
  assert.equal(competitor.price_won,12000);
  assert.throws(()=>competition.validateCompetitor({platform:'UNKNOWN',competitor_name:'오류',product_name:'오류'}),/플랫폼/);
  assert.doesNotMatch(read('app/market-intelligence/[projectId]/competition/competition-client.js'),/작수차/);
});

test('17-5 saves privacy-safe competitor review aggregates rather than raw customer data',()=>{
  const review=competition.validateReview({competitor_id:id(1),review_set_name:'최근 90일',sample_size:24,pain_points:['구성이 헷갈림'],evidence_ids:[]});
  assert.equal(review.sample_size,24);
  assert.deepEqual(review.pain_points,['구성이 헷갈림']);
  const sql=read('supabase/migrations/20260816200111_add_market_competitors_appeals.sql');
  const reviewTable=sql.slice(sql.indexOf('create table if not exists public.market_competitor_review_insights'),sql.indexOf('create index if not exists market_competitor_reviews_project_status_idx'));
  assert.doesNotMatch(reviewTable,/review_text|customer_name|order_id|phone|contact/i);
  assert.match(sql,/Raw review text and customer identifiers are intentionally not stored/);
});

test('17-5 classifies safe, health-review and prohibited appeal language',()=>{
  assert.equal(competition.validateAppeal({title:'구성',customer_problem:'선택이 어려움',own_resolution:'구성을 분명히 표시',claim_text:'구성을 한눈에 확인하세요'}).claim_status,'ALLOWED');
  assert.equal(competition.validateAppeal({title:'표현',customer_problem:'정보 부족',own_resolution:'자료 표시',claim_text:'건강에 도움'}).claim_status,'VERIFY');
  assert.equal(competition.validateAppeal({title:'위험',customer_problem:'정보 부족',own_resolution:'자료 표시',claim_text:'질환을 치료'}).claim_status,'BLOCKED');
});

test('17-5 readiness requires a verified competitor, review sample and verified appeal',()=>{
  const blocked=competition.responseSummary({competitors:[],reviews:[],appeals:[],evidence:[]});
  assert.equal(blocked.readiness,'BLOCKED');
  assert.match(blocked.readiness_message,/경쟁상품/);
  const ready=competition.responseSummary({competitors:[{status:'VERIFIED'}],reviews:[{status:'VERIFIED',sample_size:10,pain_points:['불편']}],appeals:[{status:'VERIFIED'}],evidence:[{id:id(1)}]});
  assert.equal(ready.readiness,'READY');
  assert.equal(ready.pain_signals_verified,1);
});

test('17-5 database gates both evidence sides and browser access',()=>{
  const sql=read('supabase/migrations/20260816200111_add_market_competitors_appeals.sql');
  for(const table of ['market_competitors','market_competitor_review_insights','market_appeal_points']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/security invoker/gi);
  assert.match(sql,/competitor_pain_evidence_ids/);
  assert.match(sql,/own_resolution_evidence_ids/);
  assert.match(sql,/market_verified_evidence_match/);
  assert.match(sql,/revoke all on table public\.market_competitors, public\.market_competitor_review_insights, public\.market_appeal_points\s+from public, anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete[\s\S]+to service_role/);
});

test('17-5 exposes authenticated workbench actions and keeps page AI separate',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/competition/route.js');
  const ui=read('app/market-intelligence/[projectId]/competition/competition-client.js');
  const page=read('app/market-intelligence/[projectId]/workspace-page.js');
  for(const action of ['SAVE_COMPETITOR','SAVE_COMPETITOR_REVIEW','SAVE_APPEAL'])assert.match(route,new RegExp(action));
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/MarketProfileError/);
  assert.match(ui,/리뷰 원문과 고객정보 대신 표본과 반복 신호만 저장/);
  assert.match(ui,/경쟁 불편과 우리 해결 근거를 한 쌍으로/);
  assert.match(ui,/HarinProgressiveDetails/);
  assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE|OPENAI_API_KEY/);
  assert.match(page,/CompetitionWorkbench/);
  assert.match(page,/이 페이지의 AI/);
});

test('17-5 V8 layout has readable controls and mobile evidence stacking',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(css,/Phase 17-5/);
  assert.match(css,/\.marketCompetitionKpis\{[^}]*grid-template-columns:repeat\(4/);
  assert.match(css,/\.marketCompetitionWorkbench input[^}]*min-height:48px/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[\s\S]*\.marketDualEvidence/);
});
