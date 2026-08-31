'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28KnowledgeModel}=require('../lib/ui/phase28-adapters/index.js');

test('Phase 28 AI 기준자료는 원본·개인정보·적용 범위·검색 준비를 실제 상태로 분리한다',()=>{
  const model=buildPhase28KnowledgeModel({
    generatedAt:'2026-08-30T03:00:00Z',
    categories:{COMPLIANCE:'표현·법규'},pageLabels:{product:'상품',cs:'CS'},
    guard:{execution_enabled:false,file_search_configured:false,source_uploads_enabled:true,openai_uploads_enabled:false},
    items:[{
      id:'doc-1',title:'상품 표시·표현 기준',category:'COMPLIANCE',version_label:'v3.2',status:'ACTIVE',scope_pages:['product','cs'],
      source_status:'STORED',source_file_name:'product-claims-v3.2.pdf',source_mime_type:'application/pdf',source_size_bytes:1800000,
      source_sha256:'7f2a9c84b1d0'.padEnd(64,'a'),source_uploaded_at:'2026-08-28T01:00:00Z',
      privacy_status:'APPROVED',vector_status:'READY',approved_at:'2026-08-28T02:00:00Z',created_at:'2026-08-01T00:00:00Z',updated_at:'2026-08-28T02:00:00Z'
    }]
  });

  assert.deepEqual(model.summary,{total:1,active:1,reviewRequired:0,sourceStored:1,searchReady:1,operatingRules:0});
  assert.equal(model.items[0].categoryLabel,'표현·법규');
  assert.deepEqual(model.items[0].scopeLabels,['상품','CS']);
  assert.equal(model.items[0].sourceLabel,'원본 보관 완료');
  assert.equal(model.items[0].privacyLabel,'개인정보 제외 확인');
  assert.equal(model.items[0].vectorLabel,'검색 준비 완료');
  assert.match(model.items[0].sourceHashLabel,/7f2a9c84b1d0/);
  assert.equal(JSON.stringify(model).includes('source_storage_path'),false);
  assert.equal(model.policy.privateSourceOnly,true);
  assert.equal(model.policy.openAiUploadsEnabled,false);
});

test('AI 기준자료 저장소 오류는 자료 0개나 적용 가능 상태로 숨기지 않는다',()=>{
  const model=buildPhase28KnowledgeModel({generatedAt:null,error:'knowledge storage unavailable'});
  assert.equal(model.dataStatus,'ERROR');
  assert.equal(model.summary.total,null);
  assert.deepEqual(model.items,[]);
  assert.equal(model.policy.openAiUploadsEnabled,false);
});

test('AI 기준자료 화면은 인사이트·자동진단의 최신 운영 규칙과 버전을 함께 표시한다',()=>{
  const model=buildPhase28KnowledgeModel({
    generatedAt:'2026-08-31T00:00:00Z',categories:{},pageLabels:{},items:[],
    operatingRules:{
      current:{
        insight:{ruleKey:'insight',title:'인사이트 판정식',version:3,config:{target_roas_percent:310,conversion_rate_warning_percent:2.5,change_warning_percent:12,minimum_cost_coverage_percent:95,freshness_hours:30,enabled:true},createdAt:'2026-08-31T00:00:00Z'},
        auto_diagnosis:{ruleKey:'auto_diagnosis',title:'자동진단 판정식',version:4,config:{target_roas_percent:320,conversion_rate_warning_percent:2.2,change_warning_percent:10,minimum_cost_coverage_percent:96,freshness_hours:26,enabled:true},createdAt:'2026-08-31T00:00:00Z'}
      },
      history:{insight:[],auto_diagnosis:[]}
    }
  });
  assert.equal(model.operatingRules.length,2);
  assert.equal(model.operatingRules[0].versionLabel,'v3');
  assert.equal(model.operatingRules[1].metrics.targetRoasPercent,320);
  assert.equal(model.summary.operatingRules,2);
});
