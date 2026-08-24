'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const view=require('../lib/naver/bid-capability-view.js');

const root=path.resolve(__dirname,'..');

function verifiedResult(overrides={}){
  return {
    provider:'NAVER_SEARCH_ADS',mode:'READ_ONLY',status:'READY',coreReady:true,
    checkedAt:'2026-08-25T00:00:00.000Z',writeProbePerformed:false,
    checks:[{key:'bid_write',status:'CONFIGURED_NOT_TESTED'}],
    ...overrides
  };
}

test('25-9 fresh read-only Naver evidence becomes an operational handoff without executing a bid write',()=>{
  const result=view.capabilityAcceptanceView(verifiedResult(),{now:new Date('2026-08-25T03:00:00.000Z')});

  assert.equal(result.status,'READY');
  assert.equal(result.label,'운영 사용 가능');
  assert.equal(result.rollbackTag,'v1.38.67');
  assert.deepEqual(result.steps.map(item=>[item.key,item.status]),[
    ['LIVE_READ','READY'],['PLATFORM_ISOLATION','READY'],['WRITE_GUARD','READY'],['RECOVERY','READY']
  ]);
  assert.match(result.steps.find(item=>item.key==='WRITE_GUARD').note,/실제 입찰 변경 없이/);
});

test('25-9 stale or incomplete provider evidence stays verify-required instead of pretending ready',()=>{
  const stale=view.capabilityAcceptanceView(verifiedResult(),{now:new Date('2026-08-27T03:00:00.000Z')});
  const incomplete=view.capabilityAcceptanceView(verifiedResult({coreReady:false,status:'PARTIAL'}),{now:new Date('2026-08-25T03:00:00.000Z')});

  assert.equal(stale.status,'VERIFY_REQUIRED');
  assert.equal(stale.steps.find(item=>item.key==='LIVE_READ').status,'STALE');
  assert.equal(incomplete.status,'VERIFY_REQUIRED');
  assert.equal(incomplete.steps.find(item=>item.key==='LIVE_READ').status,'CHECK');
});

test('25-9 acceptance UI and rollback record stay Naver-only and keep the production alias',()=>{
  const panel=fs.readFileSync(path.join(root,'app','_analysis','keyword-bid-capability-panel.js'),'utf8');
  const rollback=fs.readFileSync(path.join(root,'docs','PHASE25_ROLLBACK.md'),'utf8');

  assert.match(panel,/capabilityAcceptanceView/);
  assert.match(panel,/실연결 · 운영 인수/);
  assert.match(panel,/실제 입찰가는 바꾸지 않았어요/);
  assert.doesNotMatch(panel,/api\/coupang/i);
  assert.match(rollback,/v1\.38\.67/);
  assert.match(rollback,/harin-cafe24-sync\.vercel\.app/);
  assert.match(rollback,/데이터베이스 되돌리기 불필요/);
});
