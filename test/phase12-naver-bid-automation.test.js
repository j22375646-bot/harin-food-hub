'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const workbench=require('../lib/marketing/naver-bid-workbench.js');
const performance=require('../lib/naver/bid-performance.js');

const keyword={ncc_keyword_id:'nkw-a001-01-000000000001',ncc_adgroup_id:'grp-a001',keyword:'작두콩차',bid_amount:1000,status:'ELIGIBLE',user_lock:false};
const stats={ncc_keyword_id:keyword.ncc_keyword_id,period_start:'2026-08-07',period_end:'2026-08-13',impressions:1000,clicks:20,cost:12000,conversions:2,conversion_revenue:40000};
const productId='123e4567-e89b-12d3-a456-426614174000';
const link={ncc_keyword_id:keyword.ncc_keyword_id,master_product_id:productId};

test('12-7 automatic decrease drafts stay inside ten percent and still require owner approval',()=>{
  const target={master_product_id:productId,name:'작두콩차',status:'READY',allowable_cpc:100,allowable_cpa:6000,sample_status:'REVIEW',data_age_days:0};
  const result=workbench.buildNaverBidWorkbench({keywords:[keyword],stats:[stats],productTargets:[target],keywordProductLinks:[link],financialTrust:{allowed_cpc:true,financial_actions:true},executionEnabled:true});
  const candidate=result.candidates[0];
  assert.equal(result.phase,'12-7');
  assert.equal(candidate.recommended_bid,850);
  assert.equal(candidate.automation.eligible,true);
  assert.equal(candidate.automation.proposed_bid,900);
  assert.equal(candidate.automation.requires_owner_approval,true);
  assert.equal(result.summary.automation_draft_candidates,1);
});

test('12-7 automatic increase drafts remain blocked without product inventory evidence',()=>{
  const target={master_product_id:productId,name:'작두콩차',status:'READY',allowable_cpc:2000,allowable_cpa:6000,sample_status:'ENOUGH',data_age_days:0};
  const result=workbench.buildNaverBidWorkbench({keywords:[{...keyword,bid_amount:500}],stats:[stats],productTargets:[target],keywordProductLinks:[link],financialTrust:{allowed_cpc:true,financial_actions:true},executionEnabled:true});
  const candidate=result.candidates[0];
  assert.equal(candidate.decision,'RAISE');
  assert.equal(candidate.automation.eligible,false);
  assert.ok(candidate.automation.blockers.includes('INVENTORY_EVIDENCE_REQUIRED'));
});

test('seven and fourteen day windows exclude the partial execution day',()=>{
  const windows=performance.evaluationWindows('2026-08-01T03:00:00.000Z',new Date('2026-08-16T00:00:00.000Z'));
  assert.deepEqual(windows,[
    {checkpoint_days:7,baseline_start:'2026-07-25',baseline_end:'2026-07-31',evaluation_start:'2026-08-02',evaluation_end:'2026-08-08'},
    {checkpoint_days:14,baseline_start:'2026-07-18',baseline_end:'2026-07-31',evaluation_start:'2026-08-02',evaluation_end:'2026-08-15'}
  ]);
});

test('performance evaluator protects low samples and recommends owner rollback review on a clear decline',()=>{
  const request={before_value:{values:{bid_amount:1000}},proposed_value:{values:{bid_amount:900}},impact_preview:{metadata:{product_target:{allowable_cpa:5000}}}};
  const low=performance.evaluateOutcome({before:{cost:10000,conversions:2,conversion_revenue:30000,roas:300},after:{cost:1000,conversions:0,conversion_revenue:0,roas:0},request,checkpointDays:7});
  assert.equal(low.outcome,'INCONCLUSIVE');
  assert.equal(low.decision,'OBSERVE');
  const declined=performance.evaluateOutcome({before:{cost:10000,conversions:3,conversion_revenue:40000,roas:400},after:{cost:11000,conversions:1,conversion_revenue:10000,roas:90.9},request,checkpointDays:14});
  assert.equal(declined.outcome,'DECLINED');
  assert.equal(declined.decision,'ROLLBACK_REVIEW');
});

test('12-7 schema and routes keep evaluation server-only and never auto execute or rollback',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260814182743_add_naver_bid_performance_evaluations.sql','utf8');
  const evaluator=fs.readFileSync('lib/naver/bid-performance.js','utf8');
  const batch=fs.readFileSync('app/api/naver/bid-automation/route.js','utf8');
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on public\.naver_bid_performance_evaluations from anon, authenticated/i);
  assert.match(migration,/on delete restrict/i);
  assert.match(evaluator,/ROLLBACK_REVIEW/);
  assert.doesNotMatch(evaluator,/applyBid\(/);
  assert.match(batch,/slice\(0,3\)/);
  assert.match(batch,/createNaverBidPreview/);
  assert.doesNotMatch(batch,/\.execute\(/);
});
