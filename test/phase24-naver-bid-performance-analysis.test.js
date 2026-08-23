'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('24-6 네이버 평균순위와 목표순위 예상값을 서로 다른 근거로 표시한다',()=>{
  const analysis=require('../lib/naver/bid-performance-analysis.js');
  const result=analysis.buildBidPerformanceAnalysis({
    keyword:{ncc_keyword_id:'kw-1',keyword:'작두콩차',bid_amount:320},
    rule:{enabled:true,target_rank:3},
    dailyPayload:[{id:'kw-1',data:[
      {period:'2026-08-21',impCnt:100,clkCnt:5,salesAmt:1500,ccnt:1,convAmt:12000,avgRnk:4.2},
      {period:'2026-08-22',impCnt:120,clkCnt:7,salesAmt:2100,ccnt:2,convAmt:26000,avgRnk:3.4},
      {period:'2026-08-23',impCnt:140,clkCnt:9,salesAmt:2700,ccnt:2,convAmt:28000,avgRnk:2.8}
    ]}],
    estimates:{pc_bid:410,mobile_bid:460,target_rank:3},
    now:new Date('2026-08-23T03:00:00.000Z')
  });

  assert.equal(result.sources.actual.kind,'ACTUAL_AVERAGE');
  assert.equal(result.sources.estimate.kind,'ESTIMATE_REFERENCE');
  assert.equal(result.rank.target,3);
  assert.equal(result.estimate.pc_bid,410);
  assert.match(result.estimate.notice,/보장하지/);
  assert.notEqual(result.rank.average,null);
});

test('24-6 1일·3일·7일 집계와 순위 변동성을 계산하되 없는 값은 0으로 만들지 않는다',()=>{
  const analysis=require('../lib/naver/bid-performance-analysis.js');
  const result=analysis.buildBidPerformanceAnalysis({
    keyword:{ncc_keyword_id:'kw-1',keyword:'작두콩차',bid_amount:320},
    rule:{target_rank:3},
    dailyPayload:[{id:'kw-1',data:[
      {period:'2026-08-21',impCnt:100,clkCnt:5,salesAmt:1500,ccnt:1,convAmt:12000,avgRnk:4},
      {period:'2026-08-22',impCnt:120,clkCnt:7,salesAmt:2100,ccnt:2,convAmt:26000,avgRnk:3},
      {period:'2026-08-23',impCnt:140,clkCnt:9,salesAmt:2700,ccnt:2,convAmt:28000,avgRnk:2}
    ]}],
    now:new Date('2026-08-23T03:00:00.000Z')
  });

  assert.equal(result.windows['1'].cost,2700);
  assert.equal(result.windows['3'].cost,6300);
  assert.equal(result.windows['7'].available_days,3);
  assert.equal(result.windows['7'].actual_profit,null);
  assert.equal(result.windows['7'].profit_status,'BLOCKED');
  assert.ok(result.rank.volatility>0);
  assert.equal(result.status,'READY');

  const missing=analysis.buildBidPerformanceAnalysis({keyword:{ncc_keyword_id:'kw-2',keyword:'여주차',bid_amount:210},dailyPayload:[]});
  assert.equal(missing.status,'NO_DATA');
  assert.equal(missing.windows['1'].cost,null);
  assert.equal(missing.rank.average,null);
  assert.equal(missing.rank.volatility,null);

  const noExposure=analysis.buildBidPerformanceAnalysis({
    keyword:{ncc_keyword_id:'kw-3',keyword:'레드비트차',bid_amount:180},
    dailyPayload:[{data:[{period:'2026-08-23',impCnt:0,clkCnt:0,salesAmt:0,ccnt:0,convAmt:0,avgRnk:0}]}],
    now:new Date('2026-08-23T03:00:00.000Z')
  });
  assert.equal(noExposure.rank.average,null,'0위는 실제 순위가 아니라 무노출·미집계 상태다');
  assert.equal(noExposure.rank.volatility,null);
});

test('24-6 PC·모바일과 요일·시간 자료를 분리하며 비어 있는 칸은 null로 둔다',()=>{
  const analysis=require('../lib/naver/bid-performance-analysis.js');
  const result=analysis.buildBidPerformanceAnalysis({
    keyword:{ncc_keyword_id:'kw-1',keyword:'작두콩차',bid_amount:320},
    devicePayload:[{id:'kw-1',data:[
      {pcMblTp:'PC',impCnt:100,clkCnt:4,salesAmt:1200,avgRnk:2.7},
      {pcMblTp:'MOBILE',impCnt:220,clkCnt:10,salesAmt:3100,avgRnk:3.6}
    ]}],
    weekdayPayload:[{id:'kw-1',data:[{dayw:'MON',impCnt:80,clkCnt:5,salesAmt:1500,avgRnk:3.1}]}],
    hourPayload:[{id:'kw-1',data:[{hh24:'09',impCnt:35,clkCnt:3,salesAmt:700,avgRnk:2.9}]}]
  });

  assert.deepEqual(result.devices.map(item=>item.key),['PC','MOBILE']);
  assert.equal(result.weekdays.find(item=>item.key==='MON').cost,1500);
  assert.equal(result.weekdays.find(item=>item.key==='TUE').cost,null);
  assert.equal(result.hours.find(item=>item.hour===9).cost,700);
  assert.equal(result.hours.find(item=>item.hour===10).cost,null);
});

test('24-6 성과 조회 API는 오너 세션이 없으면 공급자를 호출하지 않는다',async()=>{
  const routeUrl=pathToFileURL(path.join(root,'app','api','naver','bid-performance-analysis','route.js')).href;
  const route=await import(`${routeUrl}?test=${Date.now()}`);
  const response=await route.GET(new Request('https://hub.example/api/naver/bid-performance-analysis?keywordId=kw-1'));
  assert.equal(response.status,401);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
});

test('24-6 순위·성과 작업대는 네이버에만 추가되고 쿠팡 전환 시 등록 화면으로 돌아간다',()=>{
  const operations=require('../lib/marketing/keyword-operations.js');
  const naver=operations.keywordOwnerWorkspace({platform:'naver',workspace:'performance'});
  const coupang=operations.keywordOwnerWorkspace({platform:'coupang',workspace:'performance'});
  const routes=require('../lib/navigation/hub-routes.js');

  assert.equal(naver.currentWorkspace,'performance');
  assert.ok(naver.workspaces.some(item=>item.id==='performance'&&item.href==='/keywords/performance?platform=naver'));
  assert.equal(naver.platforms.find(item=>item.id==='coupang').href,'/keywords/registered?platform=coupang');
  assert.equal(coupang.currentWorkspace,'registered');
  assert.ok(!coupang.workspaces.some(item=>item.id==='performance'));
  assert.ok(routes.HUB_WORKSPACES.keyword.some(item=>item.id==='performance'));

  const workbench=read('app/_analysis/harin-analysis-workbench.js');
  const component=read('app/_analysis/keyword-performance-workbench.js');
  assert.match(workbench,/workspace==='performance'&&platform==='naver'/);
  assert.match(component,/1일/);
  assert.match(component,/3일/);
  assert.match(component,/7일/);
  assert.match(component,/PC·모바일/);
  assert.match(component,/요일·시간/);
  assert.match(component,/실제 평균순위/);
  assert.match(component,/목표순위 예상/);
});
