'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

let deleteService=null;
let deleteState=null;
try{deleteService=require('../lib/analytics/product-analysis-delete.js');}catch{}
try{deleteState=require('../lib/analytics/product-analysis-delete-state.js');}catch{}

test('저장 분석 삭제 서비스는 정확한 보고서와 생성 시각만 DB 트랜잭션에 전달한다',async()=>{
  assert.equal(typeof deleteService?.deleteSavedProductAnalysisReport,'function','저장 분석 DB 삭제 서비스가 없습니다.');
  const calls=[];
  const db={async rpc(name,args){calls.push({name,args});return {data:[{report_id:args.p_report_id,deleted:true,promoted_report_id:'22222222-2222-4222-8222-222222222222'}],error:null};}};
  const result=await deleteService.deleteSavedProductAnalysisReport({
    db,
    reportId:'11111111-1111-4111-8111-111111111111',
    expectedCreatedAt:'2026-08-30T21:52:39.335969Z',
    actor:'owner:abc'
  });
  assert.deepEqual(calls,[{
    name:'delete_product_analysis_report',
    args:{
      p_report_id:'11111111-1111-4111-8111-111111111111',
      p_expected_created_at:'2026-08-30T21:52:39.335969Z',
      p_deleted_by:'owner:abc'
    }
  }]);
  assert.deepEqual(result,{id:'11111111-1111-4111-8111-111111111111',deleted:true,promotedReportId:'22222222-2222-4222-8222-222222222222'});
});

test('저장 분석 삭제 서비스는 잘못된 ID를 DB에 보내지 않는다',async()=>{
  assert.equal(typeof deleteService?.deleteSavedProductAnalysisReport,'function','저장 분석 DB 삭제 서비스가 없습니다.');
  let called=false;
  await assert.rejects(
    ()=>deleteService.deleteSavedProductAnalysisReport({db:{rpc(){called=true;}},reportId:'not-an-id',expectedCreatedAt:'2026-08-30T21:52:39.335969Z',actor:'owner'}),
    /삭제할 분석을 다시 선택/
  );
  assert.equal(called,false);
});

test('저장 분석 삭제 서비스는 목록 이후 바뀐 보고서를 충돌로 돌려준다',async()=>{
  assert.equal(typeof deleteService?.deleteSavedProductAnalysisReport,'function','저장 분석 DB 삭제 서비스가 없습니다.');
  const db={async rpc(){return {data:null,error:{code:'40001',message:'REPORT_CHANGED'}};}};
  await assert.rejects(
    ()=>deleteService.deleteSavedProductAnalysisReport({db,reportId:'11111111-1111-4111-8111-111111111111',expectedCreatedAt:'2026-08-30T21:52:39.335969Z',actor:'owner'}),
    error=>error?.status===409&&/새로고침/.test(error.message)
  );
});

test('열어본 분석을 삭제하면 다음 저장 분석을 열고 삭제한 항목은 즉시 제외한다',()=>{
  assert.equal(typeof deleteState?.removeDeletedAnalysis,'function','저장 분석 삭제 후 화면 상태 정리 함수가 없습니다.');
  const first={id:'r-1',title:'첫 분석'},second={id:'r-2',title:'둘째 분석'},third={id:'r-3',title:'셋째 분석'};
  const result=deleteState.removeDeletedAnalysis({history:[first,second,third],active:first,deletedId:'r-1'});
  assert.deepEqual(result.history,[second,third]);
  assert.equal(result.active,second);
});

test('열지 않은 분석을 삭제하면 현재 보고서를 그대로 유지한다',()=>{
  assert.equal(typeof deleteState?.removeDeletedAnalysis,'function','저장 분석 삭제 후 화면 상태 정리 함수가 없습니다.');
  const first={id:'r-1'},second={id:'r-2'};
  const result=deleteState.removeDeletedAnalysis({history:[first,second],active:first,deletedId:'r-2'});
  assert.deepEqual(result.history,[first]);
  assert.equal(result.active,first);
});
