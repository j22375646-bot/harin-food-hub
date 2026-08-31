'use strict';

const RULE_KEYS=Object.freeze(['insight','auto_diagnosis']);
const RULE_LABELS=Object.freeze({
  insight:'인사이트 판정식',
  auto_diagnosis:'자동진단 판정식'
});
const DEFAULT_CONFIG=Object.freeze({
  insight:Object.freeze({
    target_roas_percent:250,
    conversion_rate_warning_percent:2,
    change_warning_percent:10,
    minimum_cost_coverage_percent:95,
    freshness_hours:26,
    enabled:true
  }),
  auto_diagnosis:Object.freeze({
    target_roas_percent:250,
    conversion_rate_warning_percent:2,
    change_warning_percent:10,
    minimum_cost_coverage_percent:95,
    freshness_hours:26,
    enabled:true
  })
});
const SELECT_FIELDS='id,rule_key,version,title,config_json,change_note,created_by,created_at';

function numeric(value,label,{min,max,decimals=1}){
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error(`${label} 기준을 확인해주세요.`);
  return Number(parsed.toFixed(decimals));
}

function normalizeRuleKey(value){
  const key=String(value||'').trim().toLowerCase();
  if(!RULE_KEYS.includes(key))throw new Error('수정할 운영 규칙을 확인해주세요.');
  return key;
}

function normalizeConfig(ruleKey,input={}){
  const base=DEFAULT_CONFIG[ruleKey];
  return {
    target_roas_percent:numeric(input.target_roas_percent??base.target_roas_percent,'목표 ROAS',{min:50,max:3000}),
    conversion_rate_warning_percent:numeric(input.conversion_rate_warning_percent??base.conversion_rate_warning_percent,'구매 전환율',{min:0.1,max:100}),
    change_warning_percent:numeric(input.change_warning_percent??base.change_warning_percent,'변화 감지율',{min:0.1,max:1000}),
    minimum_cost_coverage_percent:numeric(input.minimum_cost_coverage_percent??base.minimum_cost_coverage_percent,'원가 반영률',{min:1,max:100}),
    freshness_hours:numeric(input.freshness_hours??base.freshness_hours,'자료 최신성',{min:1,max:336,decimals:0}),
    enabled:input.enabled==null?base.enabled:input.enabled===true
  };
}

function validateRuleUpdate(input={}){
  const rule_key=normalizeRuleKey(input.rule_key);
  const source=input.config&&typeof input.config==='object'?input.config:input;
  return {
    rule_key,
    title:RULE_LABELS[rule_key],
    config:normalizeConfig(rule_key,source),
    change_note:String(input.change_note||'운영 기준 수정').trim().slice(0,240)||'운영 기준 수정'
  };
}

function rowModel(row,ruleKey){
  const version=Math.max(1,Number(row?.version)||1);
  return Object.freeze({
    id:row?.id||null,
    ruleKey,
    title:String(row?.title||RULE_LABELS[ruleKey]),
    version,
    config:Object.freeze(normalizeConfig(ruleKey,row?.config_json||{})),
    changeNote:row?.change_note||null,
    createdBy:row?.created_by||null,
    createdAt:row?.created_at||null,
    source:row?.id?'SAVED':'DEFAULT'
  });
}

function buildOperatingRuleSet(rows=[]){
  const history={insight:[],auto_diagnosis:[]};
  for(const row of Array.isArray(rows)?rows:[]){
    const key=String(row?.rule_key||'').toLowerCase();
    if(!RULE_KEYS.includes(key))continue;
    history[key].push(rowModel(row,key));
  }
  for(const key of RULE_KEYS)history[key].sort((a,b)=>b.version-a.version);
  const current={};
  for(const key of RULE_KEYS)current[key]=history[key][0]||rowModel({version:1,config_json:DEFAULT_CONFIG[key]},key);
  return Object.freeze({
    current:Object.freeze(current),
    history:Object.freeze({insight:Object.freeze(history.insight),auto_diagnosis:Object.freeze(history.auto_diagnosis)})
  });
}

function effectiveReportThresholds(ruleSet){
  const set=ruleSet?.current?ruleSet:buildOperatingRuleSet([]);
  const insight=set.current.insight?.config||DEFAULT_CONFIG.insight;
  const diagnosis=set.current.auto_diagnosis?.config||DEFAULT_CONFIG.auto_diagnosis;
  return Object.freeze({
    target_roas_percent:diagnosis.target_roas_percent,
    conversion_rate_warning_percent:diagnosis.conversion_rate_warning_percent,
    change_warning_percent:insight.change_warning_percent,
    minimum_cost_coverage_percent:diagnosis.minimum_cost_coverage_percent,
    freshness_hours:insight.freshness_hours,
    enabled:diagnosis.enabled!==false&&insight.enabled!==false,
    versions:Object.freeze({insight:set.current.insight.version,auto_diagnosis:set.current.auto_diagnosis.version})
  });
}

async function loadOperatingRuleSet(db,{historyLimit=20}={}){
  if(!db||typeof db.from!=='function')throw new Error('운영 규칙 저장소를 확인할 수 없습니다.');
  const perRuleLimit=Math.min(50,Math.max(1,Number(historyLimit)||20));
  const results=await Promise.all(RULE_KEYS.map(ruleKey=>db.from('ai_operating_rule_versions').select(SELECT_FIELDS).eq('rule_key',ruleKey).order('version',{ascending:false}).limit(perRuleLimit)));
  const failed=results.find(result=>result?.error);
  if(failed?.error){
    const message=String(failed.error.message||failed.error);
    if(/ai_operating_rule_versions|relation .* does not exist/i.test(message))return buildOperatingRuleSet([]);
    throw new Error(message);
  }
  return buildOperatingRuleSet(results.flatMap(result=>result?.data||[]));
}

async function saveRuleVersion({db,input,actor='owner',now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('운영 규칙 저장소를 확인할 수 없습니다.');
  const validated=validateRuleUpdate(input);
  const latest=await db.from('ai_operating_rule_versions').select('version').eq('rule_key',validated.rule_key).order('version',{ascending:false}).limit(1).maybeSingle();
  if(latest?.error)throw latest.error;
  const payload={
    rule_key:validated.rule_key,
    version:Math.max(0,Number(latest?.data?.version)||0)+1,
    title:validated.title,
    config_json:validated.config,
    change_note:validated.change_note,
    created_by:String(actor||'owner').slice(0,120),
    created_at:now instanceof Date?now.toISOString():new Date(now).toISOString()
  };
  const saved=await db.from('ai_operating_rule_versions').insert(payload).select(SELECT_FIELDS).single();
  if(saved?.error)throw saved.error;
  return rowModel(saved.data,validated.rule_key);
}

module.exports={RULE_KEYS,RULE_LABELS,DEFAULT_CONFIG,SELECT_FIELDS,validateRuleUpdate,buildOperatingRuleSet,effectiveReportThresholds,loadOperatingRuleSet,saveRuleVersion};
