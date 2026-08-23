'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const probe=require('../lib/naver/bid-capability-probe.js');
const root=path.resolve(__dirname,'..');

function fixtureApi({failBreakdown='',campaigns=true}={}){
  const calls=[];
  return {
    calls,
    async request(method,uri,query,body){
      calls.push({method,uri,query,body});
      if(uri==='/stats'&&query?.breakdown===failBreakdown){const error=new Error('provider raw failure with secret-token');error.status=400;throw error;}
      if(uri==='/ncc/campaigns')return {status:200,data:campaigns?[{nccCampaignId:'cmp-1',campaignType:'WEB_SITE'}]:[]};
      if(uri==='/ncc/adgroups')return {status:200,data:[{nccAdgroupId:'grp-1',nccCampaignId:'cmp-1'}]};
      if(uri==='/ncc/keywords')return {status:200,data:[{nccKeywordId:'kw-1',nccAdgroupId:'grp-1',keyword:'작두콩차',bidAmt:320,useGroupBidAmt:false}]};
      if(uri==='/stats')return {status:200,data:[{id:'kw-1',data:[{impCnt:120,clkCnt:8,salesAmt:2400,ccnt:1,convAmt:21000,avgRnk:3.2}]}]};
      if(uri==='/estimate/average-position-bid/keyword')return {status:200,data:{estimate:(body?.items||[]).map(item=>({keyword:item.key,position:item.position,bid:item.position*100}))}};
      if(uri==='/estimate/exposure-minimum-bid/keyword')return {status:200,data:{estimate:(body?.items||[]).map(keyword=>({keyword,bid:70}))}};
      throw new Error(`unexpected request ${method} ${uri}`);
    }
  };
}

test('24-0 실계정 진단은 읽기·예상 호출만 사용하고 핵심 입찰 기능표를 만든다',async()=>{
  const api=fixtureApi();
  const result=await probe.probeBidCapabilities({api,env:{NAVER_SEARCH_AD_WRITE_ENABLED:'true'},now:new Date('2026-08-23T03:00:00.000Z')});

  assert.equal(result.mode,'READ_ONLY');
  assert.equal(result.writeProbePerformed,false);
  assert.equal(result.coreReady,true);
  assert.equal(result.status,'READY');
  assert.deepEqual(result.counts,{campaigns:1,adgroups:1,keywords:1});
  assert.equal(result.checks.find(item=>item.key==='current_bid')?.status,'READY');
  assert.equal(result.checks.find(item=>item.key==='average_position_pc')?.status,'READY');
  assert.equal(result.checks.find(item=>item.key==='minimum_exposure_mobile')?.status,'READY');
  assert.equal(result.checks.find(item=>item.key==='exact_live_rank')?.status,'ESTIMATE_ONLY');
  assert.equal(result.checks.find(item=>item.key==='bid_write')?.status,'CONFIGURED_NOT_TESTED');
  assert.ok(api.calls.every(call=>['GET','POST'].includes(call.method)));
  assert.ok(api.calls.every(call=>!['PUT','PATCH','DELETE'].includes(call.method)));
});

test('24-0 선택 기능 하나가 실패해도 핵심 입찰 검증과 다른 기능을 보존한다',async()=>{
  const api=fixtureApi({failBreakdown:'regnNo'});
  const result=await probe.probeBidCapabilities({api,now:new Date('2026-08-23T03:00:00.000Z')});

  assert.equal(result.coreReady,true);
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.checks.find(item=>item.key==='region_breakdown')?.status,'VERIFY_REQUIRED');
  assert.equal(result.checks.find(item=>item.key==='device_breakdown')?.status,'READY');
  assert.doesNotMatch(JSON.stringify(result),/secret-token/);
});

test('24-0 광고 캠페인이 없으면 하위 자료를 0으로 꾸미지 않고 조회를 건너뛴다',async()=>{
  const api=fixtureApi({campaigns:false});
  const result=await probe.probeBidCapabilities({api,now:new Date('2026-08-23T03:00:00.000Z')});

  assert.equal(result.coreReady,false);
  assert.equal(result.status,'NO_DATA');
  assert.deepEqual(result.counts,{campaigns:0,adgroups:null,keywords:null});
  assert.equal(result.checks.find(item=>item.key==='campaigns')?.status,'NO_DATA');
  assert.equal(result.checks.find(item=>item.key==='keywords')?.status,'SKIPPED');
  assert.deepEqual(api.calls.map(call=>call.uri),['/ncc/campaigns']);
});

test('24-0 최근 결과 조회와 실계정 재검증은 모두 오너 세션을 요구한다',async()=>{
  const routeUrl=pathToFileURL(path.join(__dirname,'..','app','api','naver','bid-capabilities','probe','route.js')).href;
  const route=await import(`${routeUrl}?test=${Date.now()}`);
  for(const method of ['GET','POST']){
    const response=await route[method](new Request('https://hub.example/api/naver/bid-capabilities/probe',{method}));
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{ok:false,error:'Unauthorized'});
  }
});

test('24-0 기능표는 핵심·성과·예상·경계 항목을 나누고 추정값을 정상값으로 꾸미지 않는다',()=>{
  const view=require('../lib/naver/bid-capability-view.js');
  const result={status:'PARTIAL',coreReady:true,checkedAt:'2026-08-23T03:00:00.000Z',counts:{campaigns:2,adgroups:4,keywords:18},checks:[
    {key:'campaigns',label:'캠페인 읽기',status:'READY'},
    {key:'device_breakdown',label:'PC·모바일 성과 분리',status:'READY'},
    {key:'average_position_pc',label:'PC 목표 순위 예상 입찰가',status:'READY'},
    {key:'exact_live_rank',label:'순간 실제 노출 순위',status:'ESTIMATE_ONLY'},
    {key:'bid_write',label:'입찰가 변경 준비',status:'CONFIGURED_NOT_TESTED'}
  ]};
  const model=view.capabilityView(result);

  assert.equal(model.statusLabel,'일부 확인 필요');
  assert.equal(model.groups.find(group=>group.key==='core').items[0].displayStatus,'사용 가능');
  assert.equal(model.groups.find(group=>group.key==='boundary').items[0].displayStatus,'예상값만 사용');
  assert.equal(model.groups.find(group=>group.key==='boundary').items[1].displayStatus,'설정됨·변경 안 함');
  assert.deepEqual(model.counts,[['캠페인','2개'],['광고그룹','4개'],['키워드','18개']]);
});

test('24-0 화면은 네이버 등록 키워드에서만 실계정 읽기 검증 패널을 연다',()=>{
  const workbench=fs.readFileSync(path.join(root,'app/_analysis/harin-analysis-workbench.js'),'utf8');
  const panel=fs.readFileSync(path.join(root,'app/_analysis/keyword-bid-capability-panel.js'),'utf8');
  assert.match(workbench,/view==='keyword'&&workspace==='registered'&&platform==='naver'/);
  assert.match(workbench,/<KeywordBidCapabilityPanel\/>/);
  assert.match(panel,/\/api\/naver\/bid-capabilities\/probe/);
  assert.match(panel,/실계정 다시 확인/);
  assert.match(panel,/이번 검사는 입찰가를 변경하지 않아요/);
  assert.doesNotMatch(panel,/api\/coupang/i);
});
