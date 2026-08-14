'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const bidWorkbench = require('../lib/marketing/naver-bid-workbench.js');
const auth = require('../lib/dashboard-auth.js');

const keyword = { ncc_keyword_id:'nkw-a001-01-000000000001', ncc_adgroup_id:'grp-a001', keyword:'작두콩차', bid_amount:1000, status:'ELIGIBLE', user_lock:false };
const stats = { ncc_keyword_id:keyword.ncc_keyword_id, period_start:'2026-08-07', period_end:'2026-08-13', impressions:1000, clicks:20, cost:12000, conversions:2, conversion_revenue:40000 };
const target = { master_product_id:'123e4567-e89b-12d3-a456-426614174000', name:'작두콩차', status:'READY', allowable_cpc:100, allowable_cpa:6000 };
const link = { ncc_keyword_id:keyword.ncc_keyword_id, master_product_id:target.master_product_id };

test('missing financial trust and product link blocks a bid recommendation', () => {
  const result=bidWorkbench.buildNaverBidWorkbench({keywords:[keyword],stats:[stats],financialTrust:{allowed_cpc:false}});
  assert.equal(result.summary.blocked_candidates,1);
  assert.equal(result.candidates[0].recommended_bid,null);
  assert.deepEqual(result.candidates[0].reasons.map(item=>item.code),['FINANCIAL_TRUST_BLOCKED','PRODUCT_TARGET_LINK_REQUIRED']);
});

test('safe bid reductions are capped at fifteen percent per approval', () => {
  const result=bidWorkbench.buildNaverBidWorkbench({keywords:[keyword],stats:[stats],productTargets:[target],keywordProductLinks:[link],financialTrust:{allowed_cpc:true,financial_actions:true}});
  assert.equal(result.candidates[0].recommended_bid,850);
  assert.equal(result.candidates[0].decision,'LOWER');
  assert.equal(result.candidates[0].can_request_approval,true);
});

test('safe bid increases are capped at ten percent and require financial action readiness', () => {
  const lowBid={...keyword,bid_amount:500};
  const highTarget={...target,allowable_cpc:1000};
  const ready=bidWorkbench.buildNaverBidWorkbench({keywords:[lowBid],stats:[stats],productTargets:[highTarget],keywordProductLinks:[link],financialTrust:{allowed_cpc:true,financial_actions:true}});
  const noIncrease=bidWorkbench.buildNaverBidWorkbench({keywords:[lowBid],stats:[stats],productTargets:[highTarget],keywordProductLinks:[link],financialTrust:{allowed_cpc:true,financial_actions:false}});
  assert.equal(ready.candidates[0].recommended_bid,550);
  assert.equal(noIncrease.candidates[0].recommended_bid,500);
});

test('signed bid snapshot rejects tampering and expiry', () => {
  const previous=process.env.DASHBOARD_SESSION_SECRET;
  process.env.DASHBOARD_SESSION_SECRET='test-secret-for-bid-proposals';
  const snapshot={scope:'naver-bid-proposal',ncc_keyword_id:keyword.ncc_keyword_id,current_bid:1000,recommended_bid:850,external_execution_locked:true};
  const token=auth.signBidProposalSnapshot(snapshot,1000);
  assert.deepEqual(auth.verifyBidProposalSnapshot(token,1100),snapshot);
  assert.equal(auth.verifyBidProposalSnapshot(`${token}x`,1100),null);
  assert.equal(auth.verifyBidProposalSnapshot(token,1000+21*60*1000),null);
  if(previous===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previous;
});

test('12-6B keeps product links server-only and routes execution through the guarded writer', () => {
  const migration=fs.readFileSync('supabase/migrations/20260815170000_add_naver_bid_approval_previews.sql','utf8');
  const changes=fs.readFileSync('lib/changes/financial-change.js','utf8');
  const route=fs.readFileSync('app/api/naver/bid-proposals/route.js','utf8');
  const writer=fs.readFileSync('lib/naver/bid-execution.js','utf8');
  assert.match(migration,/NAVER_BID/);
  assert.match(migration,/naver_keyword_product_links enable row level security/i);
  assert.match(migration,/revoke all on public\.naver_keyword_product_links from anon, authenticated/i);
  assert.match(changes,/naverBidExecution\.applyBid/);
  assert.match(route,/verifyBidProposalSnapshot/);
  assert.match(route,/configuration\(\)\.write_enabled/);
  assert.match(writer,/NAVER_SEARCH_AD_WRITE_ENABLED/);
  assert.match(writer,/SINGLE_CHANGE_WINDOW/);
  assert.match(writer,/NAVER_BID_APPROVAL_EXPIRED/);
  assert.match(writer,/PRODUCT_TARGET_STALE/);
});

test('12-6B product selection is included in the signed approval snapshot', () => {
  const product={id:target.master_product_id,name:'Product',is_active:true};
  const workbench=bidWorkbench.buildNaverBidWorkbench({keywords:[keyword],stats:[stats],productTargets:[target],keywordProductLinks:[link],masterProducts:[product],financialTrust:{allowed_cpc:true,financial_actions:true},executionEnabled:true});
  assert.equal(workbench.phase,'12-6B');
  assert.equal(workbench.execution_enabled,true);
  assert.equal(workbench.products[0].target_ready,true);
  const snapshot=bidWorkbench.proposalSnapshot(workbench.candidates[0]);
  assert.equal(snapshot.product_target.master_product_id,target.master_product_id);
  assert.equal(snapshot.external_execution_locked,false);
  assert.equal(snapshot.execution_phase,'12-6B');
});
