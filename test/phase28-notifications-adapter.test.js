'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  buildPhase28NotificationsModel,
  PHASE28_AVAILABLE_ADAPTERS
}=require('../lib/ui/phase28-adapters/index.js');

const now='2026-08-29T06:00:00.000Z';
const alerts=[
  {id:'open-error',source_type:'WORKER_HEARTBEAT',platform:'COUPANG',severity:'ERROR',title:'쿠팡 작업 서버 확인 필요',message:'마지막 생존 신호가 늦습니다.',status:'OPEN',created_at:'2026-08-29T05:56:00.000Z',snoozed_until:null},
  {id:'snoozed',source_type:'DATA_QUALITY',platform:'CAFE24',severity:'WARNING',title:'문의 수집 공백',message:'마지막 성공 시각을 유지합니다.',status:'OPEN',created_at:'2026-08-29T05:50:00.000Z',snoozed_until:'2026-08-29T06:30:00.000Z'},
  {id:'ack',source_type:'ANOMALY',platform:'NAVER',severity:'INFO',title:'광고 원가 확인',message:'최신 원가 근거를 확인했습니다.',status:'ACKNOWLEDGED',created_at:'2026-08-29T05:40:00.000Z',acknowledged_at:'2026-08-29T05:45:00.000Z'},
  {id:'done',source_type:'SETTLEMENT',platform:'CAFE24',severity:'INFO',title:'정산 차이 해결',message:'원본과 계산값이 일치합니다.',status:'RESOLVED',created_at:'2026-08-28T08:00:00.000Z',resolved_at:'2026-08-28T09:00:00.000Z'}
];

test('Phase 28 알림 어댑터는 열림·숨김·확인·해결을 섞지 않고 집계한다',()=>{
  const model=buildPhase28NotificationsModel({generatedAt:now,alerts});
  assert.deepEqual(model.summary,{current:3,open:1,snoozed:1,acknowledged:1,resolved:1,total:4});
  assert.deepEqual(model.alerts.map(item=>item.state),['OPEN','SNOOZED','ACKNOWLEDGED','RESOLVED']);
  assert.equal(model.alerts[0].channel,'쿠팡');
  assert.equal(model.alerts[1].channel,'Cafe24');
  assert.equal(model.alerts[2].channel,'네이버');
  assert.match(model.lastSignalLabel,/4분 전/);
  assert.equal(model.policy.externalDeliveryOnLoad,false);
  assert.equal(model.policy.detailLoading,'ON_DEMAND');
  assert.equal(model.policy.missingAsZero,false);
});

test('알림 조회 오류는 빈 정상 상태나 0건으로 바뀌지 않는다',()=>{
  const model=buildPhase28NotificationsModel({generatedAt:null,alerts:[],error:'alerts query failed'});
  assert.equal(model.dataStatus,'ERROR');
  assert.equal(model.summary.current,null);
  assert.equal(model.summary.open,null);
  assert.equal(model.error,'alerts query failed');
});

test('notifications joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','calendar','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});
