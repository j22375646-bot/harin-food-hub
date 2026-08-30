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

  assert.deepEqual(model.summary,{total:1,active:1,reviewRequired:0,sourceStored:1,searchReady:1});
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
