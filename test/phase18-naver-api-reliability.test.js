'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const reliability=require('../lib/naver-api-hub/reliability.js');

const root=path.join(__dirname,'..');

test('phase 18-6 cache keys isolate query type sort and display count',()=>{
  const base={query:'작두콩차 후기',type:'BLOG',sort:'sim',display:5};
  assert.equal(reliability.cacheKey(base).length,64);
  assert.equal(reliability.cacheKey(base),reliability.cacheKey({...base,query:'  작두콩차 후기  '}));
  assert.notEqual(reliability.cacheKey(base),reliability.cacheKey({...base,type:'CAFE'}));
  assert.notEqual(reliability.cacheKey(base),reliability.cacheKey({...base,display:10}));
});

test('phase 18-6 daily budget is based on KST and ignores cache-only searches',()=>{
  const state=reliability.quotaState({
    rows:[
      {started_at:'2026-08-16T23:00:00Z',metadata:{request_count:4}},
      {started_at:'2026-08-17T00:00:00Z',metadata:{request_count:0,cache_hits:12}},
      {started_at:'2026-08-16T02:00:00Z',metadata:{request_count:9}}
    ],
    env:{NAVER_API_HUB_SEARCH_DAILY_BUDGET:'5'},now:new Date('2026-08-17T01:00:00Z')
  });
  assert.deepEqual(state,{used:4,budget:5,official_limit:25_000,remaining:1,warning:true,blocked:false});
});

test('phase 18-6 server kill switch defaults on and can explicitly stop live search',()=>{
  assert.equal(reliability.searchEnabled({}),true);
  assert.equal(reliability.searchEnabled({NAVER_API_HUB_SEARCH_ENABLED:'false'}),false);
  assert.equal(reliability.searchDailyBudget({NAVER_API_HUB_SEARCH_DAILY_BUDGET:'99999'}),25_000);
  assert.equal(reliability.searchCacheMinutes({NAVER_API_HUB_SEARCH_CACHE_MINUTES:'2'}),5);
});

test('phase 18-6 migration and search flow preserve product isolation and stale fallback',()=>{
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817213000_add_naver_api_hub_search_cache.sql'),'utf8');
  const source=fs.readFileSync(path.join(root,'lib/market-intelligence/naver-evidence.js'),'utf8');
  assert.match(migration,/master_product_id uuid not null/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all .* anon, authenticated/i);
  assert.match(source,/STALE_FALLBACK/);
  assert.match(source,/NAVER_API_HUB_SEARCH_QUOTA_BLOCKED/);
  assert.match(source,/NAVER_API_HUB_CONFIG_REQUIRED/);
  assert.match(source,/request_count:requestCount/);
});
