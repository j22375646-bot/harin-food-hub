'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const baseline=require('../lib/market-intelligence/baseline.js');
const foundation=require('../lib/market-intelligence/foundation.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('17-3 expands Cafe24 bundle options into reusable pack and total quantities',()=>{
  const rows=baseline.normalizeChannelOptions([{platform:'CAFE24',external_product_id:'49',external_product_name:'작수차',selling_price:12000,is_active:true,raw_data:{variants:[
    {variant_code:'A',options:[{value:'30TB 1개'}],additional_amount:0,display:'T',selling:'T'},
    {variant_code:'B',options:[{value:'30TB 3개'}],additional_amount:24000,display:'T',selling:'T'},
    {variant_code:'C',options:[{value:'30TB 5개'}],additional_amount:48000,display:'T',selling:'T'}
  ]}}]);
  assert.deepEqual(rows.map(row=>row.pack_count),[1,3,5]);
  assert.deepEqual(rows.map(row=>row.total_units),[30,90,150]);
  assert.deepEqual(rows.map(row=>row.sale_price),[12000,36000,60000]);
  assert.ok(rows.every(row=>row.source==='CHANNEL_SNAPSHOT'));
});

test('17-3 records zero legacy sources honestly while keeping linked options',()=>{
  const snapshot={migration_report:{profile_source_rows:0,checklist_source_rows:0,offer_source_rows:0,channel_product_rows:1},source_updated_at:{channel_products:'2026-08-17T00:00:00Z'}};
  const state=baseline.compatibility({baseline:{migration_report:{source_preserved:true},source_updated_at:snapshot.source_updated_at},snapshot});
  assert.equal(state.state,'NO_LEGACY_SOURCE');
  assert.match(state.label,/가져올 기존 자료 없음/);
  assert.match(state.message,/연결 상품 1개/);
});

test('17-3 reviews sales claims and never verifies risky copy automatically',()=>{
  assert.deepEqual(baseline.claimReviews({product_summary:'구수하게 즐기는 차'}).map(item=>item.status),['ALLOWED']);
  const saved=baseline.validateInput({product_role:'STANDARD',core_message:'혈당 관리에 도움',owner_confirmed:true,checklist_items:{}});
  assert.equal(saved.claim_reviews[0].status,'VERIFY');
  assert.equal(saved.baseline_status,'REVIEW_REQUIRED');
});

test('17-3 migration is owner-only, source-preserving and versioned',()=>{
  const sql=read('supabase/migrations/20260816192309_add_market_product_baselines.sql');
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on table public\.market_product_baselines from public, anon, authenticated/i);
  assert.match(sql,/READ_ONLY_COMPATIBILITY/);
  assert.match(sql,/'source_preserved', true/);
  assert.match(sql,/record_market_project_version/);
  assert.match(sql,/'channel_products', channel_products_updated_at/);
  assert.doesNotMatch(sql,/delete from public\.product_growth_/i);
  assert.deepEqual(foundation.DIRECT_MIGRATIONS.map(item=>item.destination),['market_product_baselines','market_product_baselines.checklist_items']);
});

test('17-3 exposes authenticated baseline actions and a separate progressive UI',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/baseline/route.js');
  const ui=read('app/market-intelligence/[projectId]/data/product-baseline-client.js');
  const page=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(route,/isAuthorized/);
  assert.match(route,/PREPARE/);
  assert.match(route,/REFRESH_LEGACY/);
  assert.match(route,/SAVE/);
  assert.match(ui,/가져올 기존 자료 없음|compatibility\.label/);
  assert.match(ui,/플랫폼 역전송 없음/);
  assert.match(ui,/HarinProgressiveDetails/);
  assert.match(page,/MarketProductBaseline/);
  assert.match(page,/이 페이지의 AI/);
});
