'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28DiagnosesModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

const reports=[
  {id:'ready',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-18',period_end:'2026-08-24',title:'네이버 주간 성과 진단',status:'FINAL',version:2,is_latest:true,created_at:'2026-08-25T01:36:00Z',summary_json:{score:82,data_coverage:{orders:{status:'READY'},ads:{status:'READY'}},insights:[{title:'브랜드 검색 증가',body:'광고비가 줄고 브랜드 주문이 늘었습니다.'}],recommendations:[{title:'검색어 연결 검토',reason:'자동 변경 없이 후보만 정리합니다.'}],learning:{data_status:'READY',learning_mode:'SERVER_AGGREGATE',openai_called:false,observations:[{title:'브랜드 검색 증가',body:'광고비가 줄고 브랜드 주문이 늘었습니다.'}],next_actions:[{title:'검색어 연결 검토',reason:'자동 변경 없이 후보만 정리합니다.'}],bid_validation:{total:1,improved:1,declined:0,inconclusive:0,rollback_review:0}}}},
  {id:'blocked',platform:'ALL',report_type:'ADHOC',period_start:'2026-08-01',period_end:'2026-08-24',title:'우엉차 수익성 진단',status:'FINAL',version:1,is_latest:true,created_at:'2026-08-24T02:00:00Z',summary_json:{score:null,comparison_guard:{safe:false},data_coverage:{costs:{status:'MISSING'}},insights:[{title:'포장 원가 확인 필요',body:'누락 원가를 0원으로 계산하지 않습니다.'}],recommendations:[]}}
];
const versionHeaders=[
  ...reports.map(({summary_json,...row})=>row),
  {id:'ready-v1',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-18',period_end:'2026-08-24',title:'네이버 주간 성과 진단',status:'FINAL',version:1,is_latest:false,created_at:'2026-08-25T00:30:00Z'}
];

test('Phase 28 진단 어댑터는 실제 보고서의 준비·보류 상태와 버전을 분리한다',()=>{
  const model=buildPhase28DiagnosesModel({generatedAt:'2026-08-29T01:42:00Z',latestReports:reports,versionHeaders});
  assert.deepEqual(model.summary,{stored:2,ready:1,blocked:1,versions:3});
  assert.equal(model.items[0].title,'네이버 주간 성과 진단');
  assert.equal(model.items[0].state,'READY');
  assert.equal(model.items[0].score,82);
  assert.equal(model.items[0].versions.length,2);
  assert.equal(model.items[1].state,'BLOCKED');
  assert.equal(model.items[1].score,null);
  assert.match(model.items[1].evidenceLabel,/원가|확인|근거/);
  assert.equal(model.policy.automaticWrites,false);
  assert.equal(model.policy.missingAsZero,false);
});

test('진단 조회 오류는 저장 진단 0건으로 바뀌지 않는다',()=>{
  const model=buildPhase28DiagnosesModel({generatedAt:null,latestReports:[],versionHeaders:[],error:'reports unavailable'});
  assert.equal(model.dataStatus,'ERROR');
  assert.equal(model.summary.stored,null);
  assert.equal(model.summary.ready,null);
  assert.equal(model.error,'reports unavailable');
});

test('diagnoses joins the implemented V106 adapter set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes']);
});
