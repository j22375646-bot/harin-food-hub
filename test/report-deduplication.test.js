'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {cleanupDuplicateDiagnosisReports}=require('../lib/reports/deduplicate.js');

const root=path.resolve(__dirname,'..');

test('automatic diagnosis cleanup uses the restricted database RPC and returns its audited result',async()=>{
  const calls=[];
  const db={async rpc(name,args){calls.push([name,args]);return {data:[{deleted_count:3,kept_count:3,audited_count:3}],error:null};}};
  const result=await cleanupDuplicateDiagnosisReports(db);
  assert.deepEqual(calls,[['cleanup_duplicate_diagnosis_reports',{}]]);
  assert.deepEqual(result,{deletedCount:3,keptCount:3,auditedCount:3});
});

test('automatic diagnosis cleanup surfaces database failures instead of hiding them',async()=>{
  const db={async rpc(){return {data:null,error:{message:'cleanup failed'}};}};
  await assert.rejects(()=>cleanupDuplicateDiagnosisReports(db),/cleanup failed/);
});

test('duplicate cleanup migration preserves approved and distinct-evidence reports and audits every deletion',()=>{
  const migrationDir=path.join(root,'supabase','migrations');
  const migration=fs.readdirSync(migrationDir).find(name=>name.endsWith('_deduplicate_automatic_diagnosis_reports.sql'));
  assert.ok(migration,'자동진단 중복 정리 마이그레이션이 필요합니다.');
  const sql=fs.readFileSync(path.join(migrationDir,migration),'utf8');
  assert.match(sql,/cleanup_duplicate_diagnosis_reports/);
  assert.match(sql,/report_type\s+in\s*\(\s*'ADHOC'\s*,\s*'WEEKLY'\s*,\s*'MONTHLY'\s*\)/i);
  assert.match(sql,/approved_at\s+is\s+not\s+null/i);
  assert.match(sql,/report\.summary_json[\s\S]*-\s*'generated_at'\s*-\s*'generation_mode'\s*-\s*'learning'/i);
  assert.match(sql,/report_deletion_audits/i);
  assert.match(sql,/notification_deliveries/i);
  assert.match(sql,/alerts/i);
  assert.match(sql,/revoke\s+execute[\s\S]*from\s+public/i);
  assert.match(sql,/grant\s+execute[\s\S]*to\s+service_role/i);
  assert.doesNotMatch(sql,/PRODUCT_ANALYSIS/);
});
