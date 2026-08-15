'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const knowledge=require('../lib/ai/knowledge-center.js');
const source=require('../lib/ai/knowledge-source.js');
const contracts=require('../lib/ai/analysis-contracts.js');

test('12-5B validates allowlisted categories and page scopes',()=>{
  const value=knowledge.validateCreate({title:'상품별 광고 기준서',category:'MARKETING',version_label:'v2.1',scope_pages:['keyword','product','orders','keyword']});
  assert.equal(value.status,'DRAFT');
  assert.equal(value.privacy_status,'REVIEW_REQUIRED');
  assert.deepEqual(value.scope_pages,['keyword','product','orders']);
  assert.equal(value.vector_status,'NOT_CONNECTED');
});

test('active knowledge requires owner privacy review first',()=>{
  assert.throws(()=>knowledge.validateUpdate({action:'ACTIVATE'},{privacy_status:'REVIEW_REQUIRED',source_status:'STORED'}),/개인정보 제외 검수/);
  assert.throws(()=>knowledge.validateUpdate({action:'ACTIVATE'},{privacy_status:'APPROVED',source_status:'NOT_UPLOADED'}),/원본 파일/);
  assert.equal(knowledge.validateUpdate({action:'ACTIVATE'},{privacy_status:'APPROVED',source_status:'STORED'}).status,'ACTIVE');
});

test('12-5C accepts only private knowledge source formats and stable hashes',()=>{
  const metadata=source.validateSourceMetadata({file_name:'광고 기준서 v3.docx',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size_bytes:1024});
  assert.equal(metadata.extension,'.docx');
  assert.throws(()=>source.validateSourceMetadata({file_name:'orders.xlsx',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size_bytes:10}),/PDF, DOCX, TXT, MD/);
  const id='11111111-1111-4111-8111-111111111111';
  const pathValue=source.storagePath(id,'광고 기준서 v3.docx',1000);
  const completed=source.validateCompletion({...metadata,storage_path:pathValue,sha256:'a'.repeat(64)},id);
  assert.equal(completed.sha256.length,64);
  assert.throws(()=>source.validateCompletion({...metadata,storage_path:'other/file.docx',sha256:'a'.repeat(64)},id),/저장 경로/);
});

test('server-owned page analysis contracts cover the operating workflow and reject PII',()=>{
  const list=contracts.listContracts();
  assert.deepEqual(list.map(item=>item.id),['main','insight','keyword','product','orders','cs','inventory','settlement','collection','notifications','reports','changes','validation','experiments']);
  assert.ok(list.every(item=>item.calculation_owner==='SERVER'&&item.ai_role==='EXPLAIN_ONLY'&&item.writes_allowed===false));
  assert.throws(()=>contracts.validateAnalysisEnvelope({page:'insight',period:'7일',formula_version:'v1',metrics:{customer_name:'홍길동'}}),/개인정보/);
  assert.equal(contracts.validateAnalysisEnvelope({page:'insight',period:'7일',formula_version:'v1',data_status:'STALE',metrics:{roas:500}}).can_run,false);
});

test('knowledge summary never claims File Search readiness without a ready vector file',()=>{
  const summary=knowledge.summarize([{status:'ACTIVE',privacy_status:'APPROVED',vector_status:'NOT_CONNECTED'}],{execution_enabled:false,file_search_configured:false});
  assert.deepEqual({active:summary.active,file_search_ready:summary.file_search_ready,execution_enabled:summary.execution_enabled},{active:1,file_search_ready:0,execution_enabled:false});
});

test('knowledge registry migration is server-only and RLS protected',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260815123000_add_ai_knowledge_documents.sql'),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public\.ai_knowledge_documents from anon, authenticated/);
  assert.match(sql,/grant select, insert, update, delete on public\.ai_knowledge_documents to service_role/);
  assert.match(sql,/customer PII are not stored here/);
});

test('12-5C source metadata migration keeps object pointers server-only',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260815143000_add_ai_knowledge_sources.sql'),'utf8');
  assert.match(sql,/source_storage_bucket/);
  assert.match(sql,/source_sha256/);
  assert.match(sql,/Private Supabase Storage bucket/);
  assert.doesNotMatch(sql,/insert into storage\.buckets/i);
});

test('14-4 keeps order and CS knowledge scopes independent',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260815211000_add_order_cs_ai_knowledge_scopes.sql'),'utf8');
  assert.match(sql,/'orders'/);
  assert.match(sql,/'cs'/);
  assert.match(sql,/ai_knowledge_documents_scope_pages_check/);
});
