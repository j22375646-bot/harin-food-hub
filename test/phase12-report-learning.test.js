'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const learning=require('../lib/reports/learning-history.js');
const scheduler=require('../lib/automation/report-scheduler.js');

const root=path.join(__dirname,'..');
const client=fs.readFileSync(path.join(root,'app','dashboard-client.js'),'utf8');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));

test('12-8 learning snapshot is deterministic, aggregate-only and write-safe',()=>{
  const summary={
    score:81,
    cafe24:{revenue:120000},naver:{ad_spend:10000,roas:640},coupang:{gross_sales:70000},
    profitability:{contribution_profit:54000},
    data_coverage:{orders:{status:'READY'},ads:{status:'OK'}},
    comparison_guard:{safe:true},
    insights:[{level:'good',title:'매출 증가',body:'지난 기간보다 매출이 늘었습니다.'}],
    recommendations:[{priority:'HIGH',title:'성과 상품 유지',reason:'근거가 충분합니다.'}]
  };
  const input={summary,reportType:'WEEKLY',mode:'SCHEDULED',bidEvaluations:[
    {outcome:'IMPROVED',decision:'KEEP'},{outcome:'DECLINED',decision:'ROLLBACK_REVIEW'}
  ]};
  const first=learning.buildLearningSnapshot(input);
  const second=learning.buildLearningSnapshot(input);
  assert.equal(first.openai_called,false);
  assert.equal(first.learning_mode,'SERVER_AGGREGATE');
  assert.deepEqual(first.safety,{pii_included:false,platform_writes_allowed:false,owner_approval_required:true});
  assert.equal(first.data_status,'READY');
  assert.equal(first.bid_validation.total,2);
  assert.equal(first.bid_validation.rollback_review,1);
  assert.equal(first.source_fingerprint,second.source_fingerprint);
});

test('12-8 history compares versioned reports and supports legacy report summaries',()=>{
  const reports=[
    {id:'new',platform:'ALL',report_type:'WEEKLY',title:'이번 주',period_start:'2026-08-08',period_end:'2026-08-14',created_at:'2026-08-15T00:00:00Z',version:2,is_latest:true,summary_json:{score:78,insights:[{title:'관찰',body:'개선'}]}},
    {id:'old',platform:'ALL',report_type:'WEEKLY',title:'지난 주',period_start:'2026-08-01',period_end:'2026-08-07',created_at:'2026-08-08T00:00:00Z',version:1,is_latest:true,summary_json:{score:70}}
  ];
  const result=learning.buildLearningHistory({reports,automationRuns:[{id:'run',job_name:'WEEKLY_REPORT',status:'SUCCESS',started_at:'2026-08-15T00:00:00Z'}]});
  assert.equal(result.phase,'12-8');
  assert.equal(result.summary.learned,2);
  assert.equal(result.summary.improved,1);
  assert.equal(result.summary.openai_calls,0);
  assert.equal(result.items[0].score_delta,8);
  assert.equal(result.items[0].outcome,'IMPROVED');
  assert.equal(result.items[0].learning_mode,'SERVER_AGGREGATE');
  assert.equal(result.recent_runs.length,1);
});

test('monthly reports use KST day 1 provisional and day 5 final gates',()=>{
  assert.equal(scheduler.monthlyStage(new Date('2026-08-31T23:00:00Z')),'PROVISIONAL');
  assert.equal(scheduler.monthlyStage(new Date('2026-09-04T23:00:00Z')),'FINAL');
  assert.equal(scheduler.monthlyStage(new Date('2026-09-02T23:00:00Z')),null);
  assert.deepEqual(scheduler.previousMonth(new Date('2026-08-31T23:00:00Z')),{start:'2026-08-01',end:'2026-08-31'});
});

test('Vercel schedules match the approved KST report timetable',()=>{
  const schedules=Object.fromEntries(vercel.crons.map(item=>[item.path,item.schedule]));
  assert.equal(schedules['/api/cron/platform-reports'],'10 22 * * *');
  assert.equal(schedules['/api/cron/weekly-report'],'30 22 * * 0');
  assert.equal(schedules['/api/cron/monthly-reports'],'0 23 * * *');
});

test('report page shows schedules and learning history without adding AI chat',()=>{
  assert.match(client,/12-8 · REPORT & LEARN/);
  assert.match(client,/매일 오전 7:10/);
  assert.match(client,/매주 월요일 오전 7:30/);
  assert.match(client,/매월 1일 오전 8:00/);
  assert.match(client,/매월 5일 오전 8:00/);
  assert.match(client,/OpenAI 사용 전 · 자동 호출 0회 · 비용 0원/);
  assert.match(client,/보고서가 쌓일수록 비교 기준도 쌓여요/);
  assert.doesNotMatch(client,/하린 AI 채팅/);
});
