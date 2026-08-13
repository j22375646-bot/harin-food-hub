const test=require('node:test');
const assert=require('node:assert/strict');
const cafeSync=require('../lib/cafe24/sync.js');
const evaluator=require('../lib/actions/evaluator.js');
const retention=require('../lib/customers/retention-validation.js');

test('90일 주문 기간을 API 안전 범위인 31일 이하로 나눈다',()=>{
  const ranges=cafeSync.dateRanges(new Date('2026-05-16T00:00:00Z'),new Date('2026-08-13T00:00:00Z'));
  assert.equal(ranges.length,3);
  assert.deepEqual(ranges[0],{start_date:'2026-05-16',end_date:'2026-06-15'});
  assert.deepEqual(ranges.at(-1),{start_date:'2026-07-17',end_date:'2026-08-13'});
  for(const range of ranges){
    const days=(new Date(`${range.end_date}T00:00:00Z`)-new Date(`${range.start_date}T00:00:00Z`))/86400000+1;
    assert.ok(days<=31);
  }
});

test('실행일을 기준으로 정확한 7일·14일 평가창을 만든다',()=>{
  const windows=evaluator.evaluationWindows('2026-08-01T01:00:00Z',new Date('2026-08-16T00:00:00Z'));
  assert.deepEqual(windows,[
    {days:7,baseline_start:'2026-07-25',baseline_end:'2026-07-31',evaluation_start:'2026-08-02',evaluation_end:'2026-08-08'},
    {days:14,baseline_start:'2026-07-18',baseline_end:'2026-07-31',evaluation_start:'2026-08-02',evaluation_end:'2026-08-15'}
  ]);
});

test('아직 도래하지 않은 14일 결과는 생성하지 않는다',()=>{
  const windows=evaluator.evaluationWindows('2026-08-01T01:00:00Z',new Date('2026-08-10T00:00:00Z'));
  assert.deepEqual(windows.map(row=>row.days),[7]);
});

test('일별 광고 자료를 합쳐 ROAS를 서버에서 계산한다',()=>{
  const result=evaluator.aggregateStats([
    {impressions:100,clicks:10,cost:5000,conversions:1,conversion_revenue:15000},
    {impressions:200,clicks:20,cost:5000,conversions:2,conversion_revenue:25000}
  ]);
  assert.deepEqual(result,{impressions:300,clicks:30,cost:10000,conversions:3,conversion_revenue:40000,roas:400});
  assert.equal(evaluator.aggregateStats([]),null);
});

test('자동운영 상태는 다음 오전 5시 30분과 자료 부족을 표시한다',()=>{
  const customer={period:{days:10},acquisition:{status:'VISITS_ONLY'}};
  const status=retention.buildAutomationStatus({customer,automationRuns:[{job_name:'ACTION_EVALUATION',status:'SUCCESS',started_at:'2026-08-13T20:31:00Z'}],asOf:new Date('2026-08-13T21:00:00Z')});
  assert.equal(status.next_run_at,'2026-08-14T20:30:00.000Z');
  assert.equal(status.history.status,'COLLECTING');
  assert.equal(status.history.remaining_days,80);
  assert.equal(status.action_evaluation.status,'SUCCESS');
  assert.equal(status.attribution.status,'CONNECTION_REQUIRED');
});
