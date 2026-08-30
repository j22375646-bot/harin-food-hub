'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28ChangesModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

const requests=[
  {id:'preview',change_type:'NAVER_BID',platform:'NAVER',target_key:'kw-1',status:'PREVIEWED',idempotency_key:'BID-0828-A1',before_value:{bid_amount:560},proposed_value:{bid_amount:500},rollback_value:{exists:true,values:{bid_amount:560}},impact_preview:{changes:[{field:'bid_amount',before:560,after:500}],metadata:{keyword:'작두콩차'}},created_at:'2026-08-28T01:31:00Z'},
  {id:'verify',change_type:'PRODUCT_COST',platform:'ALL',target_key:'product-2',status:'EXECUTED',idempotency_key:'COST-0827-P2',before_value:{unit_cost:4200},proposed_value:{unit_cost:4380},rollback_value:{exists:true,values:{unit_cost:4200}},impact_preview:{changes:[{field:'unit_cost',before:4200,after:4380}],metadata:{product_name:'레드비트차'}},created_at:'2026-08-27T02:12:00Z',executed_at:'2026-08-27T02:13:00Z'},
  {id:'verified',change_type:'CHANNEL_COST',platform:'CAFE24',target_key:'CAFE24',status:'VERIFIED',idempotency_key:'COST-0826-C4',before_value:{commission_rate:.06},proposed_value:{commission_rate:.055},rollback_value:{exists:true,values:{commission_rate:.06}},impact_preview:{changes:[{field:'commission_rate',before:.06,after:.055}]},created_at:'2026-08-26T06:20:00Z',verified_at:'2026-08-26T06:21:00Z'},
  {id:'rolled',change_type:'BUSINESS_TARGET',platform:'ALL',target_key:'2026-08:ALL',status:'ROLLED_BACK',idempotency_key:'TARGET-0824',before_value:{ad_budget:300000},proposed_value:{ad_budget:360000},rollback_value:{exists:true,values:{ad_budget:300000}},impact_preview:{changes:[{field:'ad_budget',before:300000,after:360000}]},created_at:'2026-08-24T00:04:00Z',rolled_back_at:'2026-08-25T00:04:00Z'}
];

const audits=[
  {id:'a1',change_request_id:'preview',event_type:'PREVIEW_CREATED',from_status:null,to_status:'PREVIEWED',created_at:'2026-08-28T01:31:00Z'},
  {id:'a2',change_request_id:'verify',event_type:'EXECUTED',from_status:'EXECUTING',to_status:'EXECUTED',created_at:'2026-08-27T02:13:00Z'},
  {id:'a3',change_request_id:'verified',event_type:'VERIFIED',from_status:'EXECUTED',to_status:'VERIFIED',created_at:'2026-08-26T06:21:00Z'}
];

test('Phase 28 변경 어댑터는 확인·재조회·검증·복구 상태와 실제 전후값을 분리한다',()=>{
  const model=buildPhase28ChangesModel({generatedAt:'2026-08-29T01:42:00Z',requests,audits,naverWriteEnabled:false});
  assert.deepEqual(model.summary,{total:4,waiting:1,recheck:1,verified:1,attention:0,rollback:1});
  assert.equal(model.items[0].targetLabel,'작두콩차');
  assert.equal(model.items[0].state,'WAITING');
  assert.equal(model.items[0].changes[0].beforeLabel,'560원');
  assert.equal(model.items[0].changes[0].afterLabel,'500원');
  assert.equal(model.items[0].writeLocked,true);
  assert.deepEqual(model.items[0].actions,['REJECT']);
  assert.deepEqual(model.items[1].actions,['VERIFY','ROLLBACK']);
  assert.equal(model.items[2].auditCount,1);
  assert.equal(model.items[3].state,'ROLLBACK');
  assert.equal(model.policy.ownerConfirmation,true);
  assert.equal(model.policy.postWriteVerification,true);
  assert.equal(model.policy.missingAsZero,false);
});

test('변경 조회 오류는 확인 대기와 검증 완료를 0건으로 바꾸지 않는다',()=>{
  const model=buildPhase28ChangesModel({generatedAt:null,requests:[],audits:[],error:'changes unavailable'});
  assert.equal(model.dataStatus,'ERROR');
  assert.equal(model.summary.total,null);
  assert.equal(model.summary.waiting,null);
  assert.equal(model.error,'changes unavailable');
});

test('changes joins the implemented V106 adapter set',()=>{
  assert.equal(PHASE28_AVAILABLE_ADAPTERS.at(-4),'changes');
});
