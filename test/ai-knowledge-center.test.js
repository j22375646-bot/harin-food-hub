'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const knowledge=require('../lib/ai/knowledge-center.js');

test('12-5B validates allowlisted categories and page scopes',()=>{
  const value=knowledge.validateCreate({title:'상품별 광고 기준서',category:'MARKETING',version_label:'v2.1',scope_pages:['keyword','product','orders','keyword']});
  assert.equal(value.status,'DRAFT');
  assert.equal(value.privacy_status,'REVIEW_REQUIRED');
  assert.deepEqual(value.scope_pages,['keyword','product']);
  assert.equal(value.vector_status,'NOT_CONNECTED');
});

test('active knowledge requires owner privacy review first',()=>{
  assert.throws(()=>knowledge.validateUpdate({action:'ACTIVATE'},{privacy_status:'REVIEW_REQUIRED'}),/개인정보 제외 검수/);
  assert.equal(knowledge.validateUpdate({action:'ACTIVATE'},{privacy_status:'APPROVED'}).status,'ACTIVE');
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
