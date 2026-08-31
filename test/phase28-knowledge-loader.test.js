'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {loadPhase28KnowledgeSnapshot}=require('../lib/ai/phase28-knowledge-snapshot.js');

function query(result,calls){
  const chain={
    select(value){calls.push({method:'select',value});return chain;},
    eq(column,value){calls.push({method:'eq',column,value});return chain;},
    order(value,options){calls.push({method:'order',value,options});return chain;},
    limit(value){calls.push({method:'limit',value});return Promise.resolve(result);}
  };
  return chain;
}

test('AI 기준자료 경량 로더는 공개 메타정보와 최신 운영식만 읽고 저장 경로와 비밀값을 제외한다',async()=>{
  const calls=[];
  const db={from(table){
    calls.push({method:'from',value:table});
    const data=table==='ai_knowledge_documents'?[{id:'doc-1',title:'표현 기준'}]:[];
    return query({data,error:null},calls);
  }};
  const result=await loadPhase28KnowledgeSnapshot({
    db,now:new Date('2026-08-30T03:00:00Z'),
    configuration:()=>({execution_enabled:false,file_search_configured:false,api_key:'secret'}),
    contracts:()=>[{id:'product',purpose:'상품 설명'}]
  });

  assert.equal(result.items.length,1);
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['ai_knowledge_documents','ai_operating_rule_versions','ai_operating_rule_versions']);
  assert.deepEqual(calls.filter(call=>call.method==='eq').map(call=>call.value),['insight','auto_diagnosis']);
  assert.deepEqual(calls.filter(call=>call.method==='limit').map(call=>call.value),[120,20,20]);
  const selected=calls.filter(call=>call.method==='select')[0].value;
  assert.equal(selected.includes('*'),false);
  assert.equal(selected.includes('source_storage_path'),false);
  assert.equal(selected.includes('source_storage_bucket'),false);
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.deepEqual(result.guard,{execution_enabled:false,file_search_configured:false,source_uploads_enabled:true,openai_uploads_enabled:false});
});

test('AI 기준자료 저장소 조회 실패는 상위 페이지가 오류 상태로 처리하도록 실패한다',async()=>{
  const db={from(table){
    const result=table==='ai_knowledge_documents'?{data:[],error:{message:'knowledge failed'}}:{data:[],error:null};
    return query(result,[]);
  }};
  await assert.rejects(()=>loadPhase28KnowledgeSnapshot({db,configuration:()=>({}),contracts:()=>[]}),/knowledge failed/);
});
