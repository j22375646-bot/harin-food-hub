'use strict';

const field=(key,label,unit,hint,min,max,step=1,decimals=1,format='plain')=>Object.freeze({key,label,unit,hint,min,max,step,decimals,format});
const RULE_DEFINITIONS=Object.freeze({
  insight:Object.freeze({title:'인사이트 변화 판정식',kicker:'INSIGHT CHANGE',icon:'analysis',description:'직전 기간 대비 의미 있는 변화와 자료 노후화를 판정합니다.',appliesTo:Object.freeze(['주간·월간 인사이트','기간 비교 설명']),fields:Object.freeze([
    field('change_warning_percent','변화 감지율','%','직전 기간 대비 유의미한 변화 기준',0.1,1000,0.1,1,'signed_percent'),
    field('freshness_hours','자료 최신성','시간','이 시간이 지나면 오래된 근거로 표시',1,336,1,0,'hours')
  ])}),
  auto_diagnosis:Object.freeze({title:'광고·전환 진단식',kicker:'PERFORMANCE DIAGNOSIS',icon:'checklist',description:'광고 효율과 구매 전환의 개선 필요 여부를 판정합니다.',appliesTo:Object.freeze(['네이버 광고 진단','Cafe24 전환 진단','자동 실행안']),fields:Object.freeze([
    field('target_roas_percent','목표 ROAS','%','광고 효율 양호·개선 필요 판단선',50,3000,1,1,'percent'),
    field('conversion_rate_warning_percent','구매 전환율 경고','%','이 값보다 낮을 때 전환 개선 표시',0.1,100,0.1,1,'less_percent')
  ])}),
  anomaly_detection:Object.freeze({title:'이상징후 감지식',kicker:'ANOMALY DETECTION',icon:'warning',description:'매출·주문·CPC·CVR·CPA의 급격한 등락을 경고와 위험으로 나눕니다.',appliesTo:Object.freeze(['플랫폼별 이상징후','주간 보고서 경고','운영 알림']),fields:Object.freeze([
    field('decrease_warning_percent','하락 경고','%','매출·주문·효율 하락 경고선',0.1,100,0.1,1,'down_percent'),
    field('decrease_critical_percent','하락 위험','%','즉시 확인이 필요한 하락 위험선',0.1,100,0.1,1,'down_percent'),
    field('increase_warning_percent','상승 경고','%','비용·CPC·CPA 상승 경고선',0.1,1000,0.1,1,'up_percent'),
    field('increase_critical_percent','상승 위험','%','즉시 확인이 필요한 비용 상승 위험선',0.1,1000,0.1,1,'up_percent')
  ])}),
  financial_trust:Object.freeze({title:'재무 신뢰 판정식',kicker:'FINANCIAL TRUST',icon:'shield',description:'원가 근거가 충분할 때만 이익·손익분기 지표를 확정합니다.',appliesTo:Object.freeze(['공헌이익 확정','손익분기 ROAS','원가 보완 경고']),fields:Object.freeze([
    field('minimum_cost_coverage_percent','최소 원가 반영률','%','이익 판단을 확정할 최소 원가 근거',1,100,0.1,1,'minimum_percent')
  ])}),
  data_coverage:Object.freeze({title:'데이터 충족 판정식',kicker:'DATA RELIABILITY',icon:'database',description:'선택 기간의 트래픽·광고 자료가 충분히 수집됐는지 판정합니다.',appliesTo:Object.freeze(['기간 데이터 충족률','비교 안전성','이상징후 알림 허용']),fields:Object.freeze([
    field('minimum_data_coverage_percent','최소 기간 충족률','%','기간 중 이 비율 이상 수집돼야 정상으로 판정',1,100,0.1,1,'minimum_percent')
  ])})
});

const RULE_KEYS=Object.freeze(Object.keys(RULE_DEFINITIONS));
const RULE_LABELS=Object.freeze(Object.fromEntries(RULE_KEYS.map(key=>[key,RULE_DEFINITIONS[key].title])));
const DEFAULT_CONFIG=Object.freeze({
  insight:Object.freeze({target_roas_percent:250,conversion_rate_warning_percent:2,change_warning_percent:10,minimum_cost_coverage_percent:95,freshness_hours:26,enabled:true}),
  auto_diagnosis:Object.freeze({target_roas_percent:250,conversion_rate_warning_percent:2,change_warning_percent:10,minimum_cost_coverage_percent:95,freshness_hours:26,enabled:true}),
  anomaly_detection:Object.freeze({decrease_warning_percent:20,decrease_critical_percent:35,increase_warning_percent:25,increase_critical_percent:45,enabled:true}),
  financial_trust:Object.freeze({minimum_cost_coverage_percent:95,enabled:true}),
  data_coverage:Object.freeze({minimum_data_coverage_percent:90,enabled:true})
});
const SELECT_FIELDS='id,rule_key,version,title,config_json,change_note,created_by,created_at';
const LEGACY_FIELDS=Object.freeze({
  target_roas_percent:field('target_roas_percent','목표 ROAS','%',null,50,3000,1,1),
  conversion_rate_warning_percent:field('conversion_rate_warning_percent','구매 전환율','%',null,0.1,100,0.1,1),
  change_warning_percent:field('change_warning_percent','변화 감지율','%',null,0.1,1000,0.1,1),
  minimum_cost_coverage_percent:field('minimum_cost_coverage_percent','원가 반영률','%',null,1,100,0.1,1),
  freshness_hours:field('freshness_hours','자료 최신성','시간',null,1,336,1,0)
});

function numeric(value,label,{min,max,decimals=1}){const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<min||parsed>max)throw new Error(`${label} 기준을 확인해주세요.`);return Number(parsed.toFixed(decimals));}
function normalizeRuleKey(value){const key=String(value||'').trim().toLowerCase();if(!RULE_KEYS.includes(key))throw new Error('수정할 운영 규칙을 확인해주세요.');return key;}
function normalizeConfig(ruleKey,input={}){
  const base=DEFAULT_CONFIG[ruleKey];
  const definitions=new Map(RULE_DEFINITIONS[ruleKey].fields.map(item=>[item.key,item]));
  const output={};
  for(const key of Object.keys(base)){
    if(key==='enabled')continue;
    const descriptor=definitions.get(key)||LEGACY_FIELDS[key];
    output[key]=numeric(input[key]??base[key],descriptor?.label||key,descriptor||{min:-Number.MAX_SAFE_INTEGER,max:Number.MAX_SAFE_INTEGER});
  }
  output.enabled=input.enabled==null?base.enabled:input.enabled===true;
  return output;
}
function validateRuleUpdate(input={}){
  const rule_key=normalizeRuleKey(input.rule_key),source=input.config&&typeof input.config==='object'?input.config:input,config=normalizeConfig(rule_key,source);
  if(rule_key==='anomaly_detection'){
    if(config.decrease_critical_percent<=config.decrease_warning_percent)throw new Error('하락 위험 기준은 하락 경고보다 커야 합니다.');
    if(config.increase_critical_percent<=config.increase_warning_percent)throw new Error('상승 위험 기준은 상승 경고보다 커야 합니다.');
  }
  return {rule_key,title:RULE_LABELS[rule_key],config,change_note:String(input.change_note||'운영 기준 수정').trim().slice(0,240)||'운영 기준 수정'};
}
function rowModel(row,ruleKey){const version=Math.max(1,Number(row?.version)||1);return Object.freeze({id:row?.id||null,ruleKey,title:RULE_LABELS[ruleKey],storedTitle:row?.title||null,version,definition:RULE_DEFINITIONS[ruleKey],config:Object.freeze(normalizeConfig(ruleKey,row?.config_json||{})),changeNote:row?.change_note||null,createdBy:row?.created_by||null,createdAt:row?.created_at||null,source:row?.id?'SAVED':'DEFAULT'});}
function buildOperatingRuleSet(rows=[]){
  const history=Object.fromEntries(RULE_KEYS.map(key=>[key,[]]));
  for(const row of Array.isArray(rows)?rows:[]){const key=String(row?.rule_key||'').toLowerCase();if(RULE_KEYS.includes(key))history[key].push(rowModel(row,key));}
  for(const key of RULE_KEYS)history[key].sort((a,b)=>b.version-a.version);
  const current={};for(const key of RULE_KEYS)current[key]=history[key][0]||rowModel({version:1,config_json:DEFAULT_CONFIG[key]},key);
  return Object.freeze({current:Object.freeze(current),history:Object.freeze(Object.fromEntries(RULE_KEYS.map(key=>[key,Object.freeze(history[key])])))});
}
function effectiveReportThresholds(ruleSet){
  const set=ruleSet?.current?ruleSet:buildOperatingRuleSet([]),insight=set.current.insight?.config||DEFAULT_CONFIG.insight,diagnosis=set.current.auto_diagnosis?.config||DEFAULT_CONFIG.auto_diagnosis,anomaly=set.current.anomaly_detection?.config||DEFAULT_CONFIG.anomaly_detection,financial=set.current.financial_trust?.config||DEFAULT_CONFIG.financial_trust,coverage=set.current.data_coverage?.config||DEFAULT_CONFIG.data_coverage;
  return Object.freeze({target_roas_percent:diagnosis.target_roas_percent,conversion_rate_warning_percent:diagnosis.conversion_rate_warning_percent,change_warning_percent:insight.change_warning_percent,freshness_hours:insight.freshness_hours,minimum_cost_coverage_percent:financial.minimum_cost_coverage_percent,minimum_data_coverage_percent:coverage.minimum_data_coverage_percent,anomaly_decrease_warning_percent:anomaly.decrease_warning_percent,anomaly_decrease_critical_percent:anomaly.decrease_critical_percent,anomaly_increase_warning_percent:anomaly.increase_warning_percent,anomaly_increase_critical_percent:anomaly.increase_critical_percent,enabled:RULE_KEYS.every(key=>set.current[key]?.config?.enabled!==false),versions:Object.freeze(Object.fromEntries(RULE_KEYS.map(key=>[key,set.current[key].version]))) });
}
async function loadOperatingRuleSet(db,{historyLimit=20}={}){
  if(!db||typeof db.from!=='function')throw new Error('운영 규칙 저장소를 확인할 수 없습니다.');
  const perRuleLimit=Math.min(50,Math.max(1,Number(historyLimit)||20));
  const results=await Promise.all(RULE_KEYS.map(ruleKey=>db.from('ai_operating_rule_versions').select(SELECT_FIELDS).eq('rule_key',ruleKey).order('version',{ascending:false}).limit(perRuleLimit)));
  const failed=results.find(result=>result?.error);if(failed?.error){const message=String(failed.error.message||failed.error);if(/ai_operating_rule_versions|relation .* does not exist/i.test(message))return buildOperatingRuleSet([]);throw new Error(message);}
  return buildOperatingRuleSet(results.flatMap(result=>result?.data||[]));
}
async function saveRuleVersion({db,input,actor='owner',now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('운영 규칙 저장소를 확인할 수 없습니다.');
  const validated=validateRuleUpdate(input),latest=await db.from('ai_operating_rule_versions').select('version').eq('rule_key',validated.rule_key).order('version',{ascending:false}).limit(1).maybeSingle();if(latest?.error)throw latest.error;
  const payload={rule_key:validated.rule_key,version:Math.max(0,Number(latest?.data?.version)||0)+1,title:validated.title,config_json:validated.config,change_note:validated.change_note,created_by:String(actor||'owner').slice(0,120),created_at:now instanceof Date?now.toISOString():new Date(now).toISOString()};
  const saved=await db.from('ai_operating_rule_versions').insert(payload).select(SELECT_FIELDS).single();if(saved?.error)throw saved.error;return rowModel(saved.data,validated.rule_key);
}

module.exports={RULE_KEYS,RULE_LABELS,RULE_DEFINITIONS,DEFAULT_CONFIG,SELECT_FIELDS,validateRuleUpdate,buildOperatingRuleSet,effectiveReportThresholds,loadOperatingRuleSet,saveRuleVersion};
