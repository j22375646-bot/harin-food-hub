'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const analysis=require('../lib/naver/bid-performance-analysis.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('24-14 calculates target hit rate from ranked days instead of an average-rank ratio',()=>{
  const result=analysis.buildBidPerformanceAnalysis({
    keyword:{ncc_keyword_id:'kw-1',keyword:'작두콩차',bid_amount:320},
    rule:{target_rank:3},
    dailyPayload:[{data:[
      {period:'2026-08-21',impCnt:100,avgRnk:4},
      {period:'2026-08-22',impCnt:100,avgRnk:3},
      {period:'2026-08-23',impCnt:100,avgRnk:2}
    ]}],
    now:new Date('2026-08-23T03:00:00.000Z')
  });

  assert.equal(result.rank.ranked_days,3);
  assert.equal(result.rank.hit_days,2);
  assert.equal(result.rank.hit_rate_percent,66.7);
  assert.equal(result.rank.hit_rate_status,'READY');
  assert.equal(result.rank.competition.level,'MEDIUM');
  assert.match(result.rank.competition.notice,/경쟁사 실제 입찰가/);
});

test('24-14 labels strong rank fluctuation without pretending it is competitor bid data',()=>{
  const signal=analysis.competitionStrength([
    {average_rank:1},{average_rank:5},{average_rank:1},{average_rank:5}
  ]);

  assert.equal(signal.level,'HIGH');
  assert.equal(signal.label,'높음');
  assert.equal(signal.ranked_days,4);
  assert.ok(signal.volatility>=2);
  assert.match(signal.action,/입찰 상한|시간대/);
});

test('24-14 keeps missing target and insufficient rank evidence as setup or unknown',()=>{
  const missingTarget=analysis.targetHitRate([{average_rank:2}],null);
  assert.equal(missingTarget.status,'TARGET_REQUIRED');
  assert.equal(missingTarget.percent,null);
  assert.equal(missingTarget.hit_days,null);

  const insufficient=analysis.competitionStrength([{average_rank:2},{average_rank:null},{average_rank:0}]);
  assert.equal(insufficient.level,'UNKNOWN');
  assert.equal(insufficient.label,'확인 필요');
  assert.equal(insufficient.volatility,null);
});

test('24-14 exposes the same truthful signal in the Naver workbench and lazy detail trend only',()=>{
  const workbench=read('app/_analysis/keyword-performance-workbench.js');
  const inline=read('app/_analysis/keyword-bid-inline-trend.js');
  const table=read('app/_analysis/keyword-operations-table.js');

  assert.match(workbench,/목표 적중률/);
  assert.match(workbench,/경쟁 강도/);
  assert.doesNotMatch(workbench,/analysis\.rank\.attainment_percent/);
  assert.match(inline,/목표 적중률/);
  assert.match(inline,/경쟁 강도/);
  assert.match(inline,/실제 순위 자료 확인 필요/);
  assert.match(table,/detail\.platform==='NAVER'/);
  assert.doesNotMatch(inline,/COUPANG|쿠팡/);
});
