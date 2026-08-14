'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const center=require('../lib/naver/search-term-center.js');
const sync=require('../lib/naver/sync.js');

test('search terms are deterministically classified into owner-friendly purposes',()=>{
  assert.equal(center.classifySearchTerm('하린식품 작두콩차').classification,'BRAND');
  assert.equal(center.classifySearchTerm('작두콩차 효능').classification,'INFORMATION');
  assert.equal(center.classifySearchTerm('환절기 목관리 차').classification,'PROBLEM_SITUATION');
  assert.equal(center.classifySearchTerm('작두콩차 티백 30개').classification,'PRODUCT_DETAIL');
  assert.equal(center.classifySearchTerm('작두콩차 추천').classification,'GENERAL_PURCHASE');
  assert.equal(center.classifySearchTerm('무료게임 다운로드').classification,'IRRELEVANT');
});

test('irrelevant and excessive no-conversion spend become negative review candidates',()=>{
  assert.equal(center.recommendAction({classification_auto:'IRRELEVANT'}).action,'NEGATIVE_REVIEW');
  assert.equal(center.recommendAction({classification_auto:'GENERAL_PURCHASE',cost:21000,conversions:0},{targetCpa:10000}).action,'NEGATIVE_REVIEW');
  assert.equal(center.recommendAction({classification_auto:'GENERAL_PURCHASE',cost:11000,clicks:12,conversions:0},{targetCpa:10000}).action,'LANDING_REVIEW');
});

test('brand, information, and unregistered actual terms get distinct review actions',()=>{
  assert.equal(center.recommendAction({classification_auto:'BRAND'}).action,'SEPARATE');
  assert.equal(center.recommendAction({classification_auto:'INFORMATION'}).action,'CONTENT_FAQ');
  assert.equal(center.recommendAction({classification_auto:'GENERAL_PURCHASE',is_registered_exact:false}).action,'NEW_KEYWORD');
});

test('owner override is preferred and center never claims ready without actual rows',()=>{
  const pending=center.buildSearchTermCenter({rows:[],registeredKeywords:['작두콩차']});
  assert.equal(pending.status,'COLLECTION_PENDING');
  const ready=center.buildSearchTermCenter({rows:[{id:'1',search_term:'작두콩차 효능',classification_auto:'INFORMATION',classification_override:'IRRELEVANT',recommended_action:'NEGATIVE_REVIEW',action_reason:'owner',cost:1000}],registeredKeywords:['작두콩차']});
  assert.equal(ready.status,'READY');
  assert.equal(ready.items[0].classification,'IRRELEVANT');
  assert.equal(ready.summary.negative_candidates,1);
  assert.equal(ready.summary.unregistered,1);
});

test('NPLA search keyword responses are flattened without confusing registered keyword stats',()=>{
  const result=sync.searchTermPoints([{id:'grp-1',data:[{schKwd:'작두콩차 추천',impCnt:30,clkCnt:2,salesAmt:600}]}]);
  assert.equal(result.length,1);
  assert.equal(result[0].__entity_id,'grp-1');
  assert.equal(sync.searchTermValue(result[0]),'작두콩차 추천');
});

test('actual search terms stay server-only and are added to the daily collection schedule',()=>{
  const root=path.join(__dirname,'..');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260814131809_add_naver_search_terms.sql'),'utf8');
  const cron=fs.readFileSync(path.join(root,'app/api/cron/daily-sync/route.js'),'utf8');
  assert.match(migration,/alter table public\.naver_search_terms enable row level security/i);
  assert.match(migration,/revoke all on public\.naver_search_terms from anon, authenticated/i);
  assert.match(migration,/grant select, insert, update, delete on public\.naver_search_terms to service_role/i);
  assert.match(cron,/NAVER_SEARCH_TERMS/);
  assert.match(cron,/syncSearchTermsLogged/);
});
