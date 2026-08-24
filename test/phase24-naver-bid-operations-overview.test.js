'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const overview=require('../lib/naver/bid-operations-overview.js');

const latest=(status,overrides={})=>({
  status,planned_count:3,executed_count:1,blocked_count:2,
  started_at:'2026-08-24T00:00:00.000Z',finished_at:'2026-08-24T00:03:00.000Z',
  ...overrides
});

test('24-11 summarizes only Naver schedules and puts action-required groups first',()=>{
  const result=overview.buildNaverBidOperationsOverview({
    automationEnabled:true,
    control:{emergency_paused:false},
    schedules:[
      {ncc_adgroup_id:'grp-active',mode:'ACTIVE',latest_run:latest('COMPLETED')},
      {ncc_adgroup_id:'grp-observe',mode:'OBSERVE',latest_run:latest('FAILED',{error_message:'estimate failed'})},
      {ncc_adgroup_id:'grp-paused',mode:'PAUSED',latest_run:null},
      {platform:'COUPANG',ncc_adgroup_id:'cp-group',mode:'ACTIVE',latest_run:latest('FAILED')}
    ],
    rules:[
      {platform:'NAVER',ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-active',enabled:true},
      {ncc_keyword_id:'kw-2',ncc_adgroup_id:'grp-observe',enabled:true},
      {ncc_keyword_id:'kw-off',ncc_adgroup_id:'grp-active',enabled:false},
      {platform:'COUPANG',ncc_keyword_id:'cp-kw',ncc_adgroup_id:'cp-group',enabled:true}
    ]
  });

  assert.equal(result.platform,'NAVER');
  assert.equal(result.status,'ACTION_REQUIRED');
  assert.deepEqual(result.summary,{
    configured_groups:3,active_groups:1,observing_groups:1,paused_groups:1,
    action_required_groups:1,safe_keywords:2,planned_changes:6,executed_changes:2,blocked_changes:4
  });
  assert.equal(result.groups[0].ncc_adgroup_id,'grp-observe');
  assert.equal(result.groups[0].status,'ACTION_REQUIRED');
  assert.equal(result.groups[0].reason,'estimate failed');
  assert.equal(result.groups.some(item=>item.ncc_adgroup_id==='cp-group'),false);
});

test('24-11 reports emergency pause and server setup locks without pretending automation is active',()=>{
  const schedule={ncc_adgroup_id:'grp-1',mode:'ACTIVE',last_run_at:null,latest_run:null};
  const locked=overview.buildNaverBidOperationsOverview({schedules:[schedule],rules:[],automationEnabled:false});
  assert.equal(locked.status,'SETUP_REQUIRED');
  assert.equal(locked.groups[0].status,'SETUP_REQUIRED');
  assert.match(locked.groups[0].reason,/서버 자동적용 잠금/);

  const paused=overview.buildNaverBidOperationsOverview({
    schedules:[schedule],rules:[],automationEnabled:true,
    control:{emergency_paused:true,paused_reason:'사장님 점검'}
  });
  assert.equal(paused.status,'EMERGENCY_PAUSED');
  assert.equal(paused.groups[0].status,'EMERGENCY_PAUSED');
  assert.equal(paused.groups[0].reason,'사장님 점검');
});

test('24-11 keeps an empty setup honest and exposes no fabricated recent run',()=>{
  const result=overview.buildNaverBidOperationsOverview({schedules:[],rules:[],automationEnabled:true});
  assert.equal(result.status,'SETUP_REQUIRED');
  assert.equal(result.latest_activity_at,null);
  assert.deepEqual(result.groups,[]);
});

test('24-11 exposes the owner-only overview API and mounts it only in the Naver workspace',()=>{
  const root=path.join(__dirname,'..');
  const route=fs.readFileSync(path.join(root,'app','api','naver','bid-schedules','route.js'),'utf8');
  const table=fs.readFileSync(path.join(root,'app','_analysis','keyword-operations-table.js'),'utf8');
  const panel=fs.readFileSync(path.join(root,'app','_analysis','keyword-bid-operations-overview.js'),'utf8');
  assert.match(route,/searchParams\.get\('overview'\)/);
  assert.match(route,/buildNaverBidOperationsOverview/);
  assert.match(route,/listNaverBidRules/);
  assert.match(table,/import KeywordBidOperationsOverview/);
  assert.match(table,/!isCoupang&&groupEnabled/);
  assert.match(panel,/\/api\/naver\/bid-schedules\?overview=1/);
  assert.doesNotMatch(panel,/\/api\/coupang\//);
});
