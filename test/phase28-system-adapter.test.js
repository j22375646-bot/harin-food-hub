'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  buildPhase28SystemModel,
  buildPhase28SystemProviderDetail,
  PHASE28_AVAILABLE_ADAPTERS
}=require('../lib/ui/phase28-adapters/index.js');

const snapshot={
  generatedAt:'2026-08-29T05:30:00.000Z',
  services:[
    {id:'cafe24',status:'READY',lastSuccessAt:'2026-08-29T05:20:00.000Z',configuration:'CONFIGURED',read:'READ_READY',write:'OWNER_APPROVAL',job:'IDLE'},
    {id:'naver-ads',status:'READY',lastSuccessAt:'2026-08-29T05:18:00.000Z',configuration:'CONFIGURED',read:'READ_READY',write:'LOCKED',job:'IDLE'},
    {id:'naver-commerce',status:'VERIFY_REQUIRED',lastSuccessAt:null,configuration:'CONFIGURED',read:'UNVERIFIED',write:'LOCKED',job:'IDLE'},
    {id:'coupang',status:'RUNNING',lastSuccessAt:'2026-08-29T05:10:00.000Z',configuration:'CONFIGURED',read:'READ_READY',write:'GUARDED',job:'RUNNING'},
    {id:'epost',status:'SETUP_REQUIRED',lastSuccessAt:null,configuration:'SETUP_REQUIRED',read:'UNVERIFIED',write:'LOCKED',job:'IDLE'},
    {id:'supabase',status:'READY',lastSuccessAt:'2026-08-29T05:29:00.000Z',configuration:'CONFIGURED',read:'READ_READY',write:'SERVICE_ROLE_ONLY',job:'WATCHING'}
  ],
  jobs:[
    {id:'vercel-cron',label:'Vercel Cron',status:'READY',schedule:'매시간·매주'},
    {id:'fixed-ip',label:'서울 고정 IP 워커',status:'RUNNING',schedule:'대기열 상시 확인'},
    {id:'systemd',label:'systemd',status:'READY',schedule:'프로세스 자동 복구'},
    {id:'watchdog',label:'Supabase 워치독',status:'READY',schedule:'10분 간격'}
  ],
  recovery:{previousSuccess:2,retryWaiting:1,deadLetters:3,readOnlyChecks:6}
};

test('Phase 28 시스템 어댑터는 핵심 6개 연결만 고정 순서로 노출한다',()=>{
  const model=buildPhase28SystemModel(snapshot);
  assert.deepEqual(model.services.map(item=>item.id),['cafe24','naver-ads','naver-commerce','coupang','epost','supabase']);
  assert.deepEqual(model.workspaces.map(item=>item.label),['핵심 연결','받는 자료','작업·스케줄','오류·복구']);
  assert.deepEqual(model.flow.map(item=>item.label),['외부 API','읽기 검증','수집 작업','Supabase 저장','허브 반영']);
  assert.equal(model.datasets.length,6);
  assert.equal(model.services[2].lastSuccessLabel,'확인 필요');
  assert.equal(model.services[4].lastSuccessLabel,'확인 필요');
  assert.equal(model.services.some(item=>['sometrend','deepl','brave','semrush'].includes(item.id)),false);
  assert.equal(model.policy.detailLoading,'ON_DEMAND');
  assert.equal(model.policy.missingAsZero,false);
  assert.equal(model.policy.rawCredentialsExposed,false);
  assert.equal('detail' in model.services[0],false);
});

test('Phase 28 시스템 상세는 다섯 상태 축과 해당 제공처 자료만 반환한다',()=>{
  const detail=buildPhase28SystemProviderDetail(snapshot,'coupang');
  assert.equal(detail.id,'coupang');
  assert.deepEqual(Object.keys(detail.axes),['configuration','read','freshness','write','job']);
  assert.ok(detail.datasets.includes('로켓그로스 재고'));
  assert.match(detail.action,/읽기 전용|고정 IP/);
  assert.equal(JSON.stringify(detail).includes('SUPABASE_SERVICE_ROLE_KEY'),false);
  assert.equal(JSON.stringify(detail).includes('access_token'),false);
  assert.throws(()=>buildPhase28SystemProviderDetail(snapshot,'sometrend'),/지원하지 않는 핵심 연결/);
});

test('system joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes']);
});
