'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rules=require('../lib/ai/operating-rules.js');

test('운영 규칙은 인사이트와 자동진단 기준을 안전한 숫자로 검증한다',()=>{
  const saved=rules.validateRuleUpdate({
    rule_key:'auto_diagnosis',
    target_roas_percent:320,
    conversion_rate_warning_percent:2.4,
    change_warning_percent:12,
    minimum_cost_coverage_percent:96,
    freshness_hours:28,
    enabled:true
  });
  assert.deepEqual(saved.config,{
    target_roas_percent:320,
    conversion_rate_warning_percent:2.4,
    change_warning_percent:12,
    minimum_cost_coverage_percent:96,
    freshness_hours:28,
    enabled:true
  });
  assert.throws(()=>rules.validateRuleUpdate({rule_key:'auto_diagnosis',target_roas_percent:0}),/ROAS/);
  assert.throws(()=>rules.validateRuleUpdate({rule_key:'insight',freshness_hours:999}),/최신성/);
});

test('최신 버전만 자동진단에 적용하고 이전 버전은 기록으로 남긴다',()=>{
  const set=rules.buildOperatingRuleSet([
    {rule_key:'auto_diagnosis',version:1,config_json:{target_roas_percent:250}},
    {rule_key:'auto_diagnosis',version:2,config_json:{target_roas_percent:330}},
    {rule_key:'insight',version:1,config_json:{change_warning_percent:10}}
  ]);
  assert.equal(set.current.auto_diagnosis.version,2);
  assert.equal(set.current.auto_diagnosis.config.target_roas_percent,330);
  assert.equal(set.history.auto_diagnosis.length,2);
  assert.equal(rules.effectiveReportThresholds(set).target_roas_percent,330);
});

test('저장소가 비어도 코드 기본값을 사용하고 누락값을 0으로 만들지 않는다',()=>{
  const thresholds=rules.effectiveReportThresholds(rules.buildOperatingRuleSet([]));
  assert.equal(thresholds.target_roas_percent,250);
  assert.equal(thresholds.conversion_rate_warning_percent,2);
  assert.equal(thresholds.minimum_cost_coverage_percent,95);
});

test('한 규칙의 버전이 많이 쌓여도 두 규칙의 최신값을 각각 조회한다',async()=>{
  const keys=[];
  const rows={
    insight:[{rule_key:'insight',version:42,config_json:{change_warning_percent:17}}],
    auto_diagnosis:[{rule_key:'auto_diagnosis',version:3,config_json:{target_roas_percent:330}}]
  };
  const db={from(){
    let key='';
    const chain={select(){return chain;},eq(column,value){assert.equal(column,'rule_key');key=value;keys.push(value);return chain;},order(){return chain;},limit(){return Promise.resolve({data:rows[key],error:null});}};
    return chain;
  }};
  const set=await rules.loadOperatingRuleSet(db,{historyLimit:4});
  assert.deepEqual(keys,['insight','auto_diagnosis']);
  assert.equal(set.current.insight.version,42);
  assert.equal(set.current.auto_diagnosis.version,3);
  assert.equal(set.current.auto_diagnosis.config.target_roas_percent,330);
});

test('운영 규칙 마이그레이션은 버전 누적과 service role 전용 접근을 보장한다',()=>{
  const migrations=fs.readdirSync(path.join(__dirname,'..','supabase','migrations'));
  const filename=migrations.find(name=>name.endsWith('_add_ai_operating_rule_versions.sql'));
  assert.ok(filename);
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',filename),'utf8');
  assert.match(sql,/unique\s*\(rule_key,\s*version\)/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.ai_operating_rule_versions from anon, authenticated/i);
  assert.match(sql,/grant select, insert on public\.ai_operating_rule_versions to service_role/i);
});

test('주간 인사이트와 자동진단은 저장된 최신 운영식을 계산과 보고서 근거에 사용한다',()=>{
  const weekly=fs.readFileSync(path.join(__dirname,'..','lib','reports','weekly.js'),'utf8');
  assert.match(weekly,/loadOperatingRuleSet/);
  assert.match(weekly,/effectiveReportThresholds/);
  assert.match(weekly,/operating_rule/);
  assert.doesNotMatch(weekly,/naver\.roas\s*<\s*250/);
  assert.doesNotMatch(weekly,/conversion_rate\s*<\s*2/);
});
