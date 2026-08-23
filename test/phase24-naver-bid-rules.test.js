'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const rules=require('../lib/naver/bid-rules.js');

function row(id,currentBid=300,overrides={}){
  return {
    id:`NAVER:${id}`,
    platform:'NAVER',
    source:'REGISTERED',
    adgroupId:'grp-1',
    keyword:'작두콩차',
    currentBid,
    minimumBid:260,
    maximumBid:330,
    canDraft:true,
    ...overrides
  };
}

test('24-3 validates and normalizes a Naver-only keyword safety rule',()=>{
  const result=rules.validateNaverBidRule({
    platform:'NAVER',
    ncc_keyword_id:'kw-1',
    ncc_adgroup_id:'grp-1',
    enabled:true,
    target_rank:3,
    minimum_bid:200,
    maximum_bid:500,
    increase_step:20,
    decrease_step:30
  });

  assert.deepEqual(result,{
    ncc_keyword_id:'kw-1',
    ncc_adgroup_id:'grp-1',
    enabled:true,
    target_rank:3,
    minimum_bid:200,
    maximum_bid:500,
    increase_step:20,
    decrease_step:30,
    target_rank_mode:'REFERENCE_ONLY'
  });
});

test('24-3 rejects mixed platforms, unsafe bounds, unsupported ranks, and ambiguous duplicate rows',()=>{
  assert.throws(()=>rules.validateNaverBidRule({platform:'COUPANG',ncc_keyword_id:'kw-1'}),error=>error.code==='NAVER_SCOPE_REQUIRED');
  assert.throws(()=>rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',minimum_bid:500,maximum_bid:400}),error=>error.code==='BID_RANGE_INVALID');
  assert.throws(()=>rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',target_rank:15}),error=>error.code==='TARGET_RANK_UNSUPPORTED');
  assert.throws(()=>rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',increase_step:15}),error=>error.code==='BID_STEP_INVALID');
  assert.throws(()=>rules.validateNaverBidRuleBatch({platform:'NAVER',rules:[{ncc_keyword_id:'kw-1'},{ncc_keyword_id:'kw-1'}]}),error=>error.code==='DUPLICATE_KEYWORD');
});

test('24-3 builds a selection-scoped Naver workspace without admitting Coupang rows',()=>{
  const workspace=rules.buildNaverBidRuleWorkspace([
    row('kw-1'),
    row('kw-2',250,{adgroupId:'grp-2',keyword:'작두콩차 티백'}),
    {...row('kw-3'),id:'COUPANG:kw-3',platform:'COUPANG'}
  ],[
    {ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1',enabled:true,target_rank:2,minimum_bid:200,maximum_bid:450,increase_step:20,decrease_step:20,target_rank_mode:'REFERENCE_ONLY'}
  ],{selectedIds:['NAVER:kw-1','COUPANG:kw-3']});

  assert.equal(workspace.rows.length,1);
  assert.equal(workspace.rows[0].id,'NAVER:kw-1');
  assert.equal(workspace.rows[0].rule.target_rank,2);
  assert.deepEqual(workspace.summary,{selected:1,configured:1,enabled:1});
});

test('24-3 simulation clamps step changes to both saved rules and the existing server safety window',()=>{
  const current=row('kw-1');
  const saved=rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1',enabled:true,target_rank:2,minimum_bid:280,maximum_bid:400,increase_step:50,decrease_step:50});

  const lower=rules.simulateNaverBidRule({row:current,rule:saved,action:'DECREASE'});
  const upper=rules.simulateNaverBidRule({row:current,rule:saved,action:'INCREASE'});

  assert.equal(lower.proposed_bid,280);
  assert.equal(lower.clamped,true);
  assert.equal(upper.proposed_bid,330);
  assert.equal(upper.clamped,true);
  assert.equal(upper.target_rank,2);
  assert.equal(upper.target_rank_supported,false);
  assert.equal(upper.target_rank_mode,'REFERENCE_ONLY');
});

test('24-3 validates a bounded batch and returns only server-safe database fields',()=>{
  const batch=rules.validateNaverBidRuleBatch({platform:'NAVER',rules:[{
    ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1',enabled:false,target_rank:null,
    minimum_bid:70,maximum_bid:100000,increase_step:10,decrease_step:10
  }]});
  assert.equal(batch.length,1);
  assert.deepEqual(Object.keys(batch[0]),[
    'ncc_keyword_id','ncc_adgroup_id','enabled','target_rank','minimum_bid','maximum_bid','increase_step','decrease_step','target_rank_mode'
  ]);
  assert.throws(()=>rules.validateNaverBidRuleBatch({platform:'NAVER',rules:[]}),error=>error.code==='RULES_REQUIRED');
});

test('24-3 verifies every stored rule against the current Naver keyword and adgroup scope',()=>{
  const verified=rules.verifyNaverRuleTargets([
    rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1'})
  ],[
    {ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1'}
  ]);
  assert.equal(verified[0].ncc_adgroup_id,'grp-1');
  assert.throws(()=>rules.verifyNaverRuleTargets([
    rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-missing'})
  ],[]),error=>error.code==='KEYWORD_NOT_FOUND');
  assert.throws(()=>rules.verifyNaverRuleTargets([
    rules.validateNaverBidRule({platform:'NAVER',ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-other'})
  ],[{ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1'}]),error=>error.code==='ADGROUP_SCOPE_MISMATCH');
});

test('24-3 rule reads and writes require the owner dashboard session',async()=>{
  const routeUrl=pathToFileURL(path.join(__dirname,'..','app','api','naver','bid-rules','route.js')).href;
  const route=await import(`${routeUrl}?test=${Date.now()}`);
  const getResponse=await route.GET(new Request('https://hub.example/api/naver/bid-rules'));
  const postResponse=await route.POST(new Request('https://hub.example/api/naver/bid-rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({platform:'NAVER',rules:[]})}));
  assert.equal(getResponse.status,401);
  assert.equal(postResponse.status,401);
  assert.equal(getResponse.headers.get('cache-control'),'private, no-store, max-age=0, must-revalidate');
});

test('24-3 renders the safety-rule workspace only inside the Naver keyword table',()=>{
  const tableSource=fs.readFileSync(path.join(__dirname,'..','app','_analysis','keyword-operations-table.js'),'utf8');
  const panelSource=fs.readFileSync(path.join(__dirname,'..','app','_analysis','keyword-bid-rule-panel.js'),'utf8');

  assert.match(tableSource,/import KeywordBidRulePanel from '.\/keyword-bid-rule-panel\.js'/);
  assert.match(tableSource,/!isCoupang&&groupEnabled\?<KeywordBidRulePanel/);
  assert.match(tableSource,/fetch\('\/api\/naver\/bid-rules'/);
  assert.match(panelSource,/platform:'NAVER'/);
  assert.doesNotMatch(panelSource,/\/api\/coupang\//);
  assert.match(panelSource,/광고 입찰가는 아직 바뀌지 않았습니다/);
  assert.match(panelSource,/목표 순위는 참고값이에요/);
});
