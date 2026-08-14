'use strict';

const crypto = require('node:crypto');

const FORMULA_VERSION='12-8-report-learning-v1';
const REPORT_SCHEDULE=Object.freeze({
  daily:{label:'일간 보고서',when:'매일 오전 7:10',hour:7,minute:10},
  weekly:{label:'주간 보고서',when:'매주 월요일 오전 7:30',hour:7,minute:30},
  monthly_provisional:{label:'월간 잠정본',when:'매월 1일 오전 8:00',day:1,hour:8,minute:0},
  monthly_final:{label:'월간 확정본',when:'매월 5일 오전 8:00',day:5,hour:8,minute:0}
});

const number=value=>Number.isFinite(Number(value))?Number(value):null;
const text=(value,max=180)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}

function fingerprint(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function coverageStatuses(summary={}){
  return Object.values(summary.data_coverage||{}).map(item=>String(item?.status||'').toUpperCase()).filter(Boolean);
}

function dataStatus(summary={}){
  if(summary.comparison_guard?.safe===false)return 'BLOCKED';
  const statuses=coverageStatuses(summary);
  if(statuses.some(status=>['BLOCKED','FAILED','ERROR','STALE','NO_DATA','MISSING'].includes(status)))return 'PARTIAL';
  return statuses.length&&statuses.every(status=>['OK','READY','SUCCESS'].includes(status))?'READY':'PARTIAL';
}

function compactInsight(item={}){
  return {level:text(item.level,20)||'info',title:text(item.title,100),body:text(item.body,220)};
}

function compactRecommendation(item={}){
  return {priority:text(item.priority,20)||'MEDIUM',title:text(item.title,100),reason:text(item.reason,180),expected:text(item.expected,120)};
}

function validationSummary(rows=[]){
  const safe=Array.isArray(rows)?rows:[];
  return {
    total:safe.length,
    improved:safe.filter(row=>row.outcome==='IMPROVED').length,
    declined:safe.filter(row=>row.outcome==='DECLINED').length,
    inconclusive:safe.filter(row=>row.outcome==='INCONCLUSIVE').length,
    rollback_review:safe.filter(row=>row.decision==='ROLLBACK_REVIEW').length
  };
}

function buildLearningSnapshot({summary={},reportType='ADHOC',mode='SCHEDULED',bidEvaluations=[]}={}){
  const aggregate={
    score:number(summary.score),
    cafe24_revenue:number(summary.cafe24?.revenue),
    naver_spend:number(summary.naver?.ad_spend),
    naver_roas:number(summary.naver?.roas),
    coupang_sales:number(summary.coupang?.gross_sales),
    contribution_profit:number(summary.profitability?.contribution_profit),
    insight_count:Array.isArray(summary.insights)?summary.insights.length:0,
    recommendation_count:Array.isArray(summary.recommendations)?summary.recommendations.length:0
  };
  return {
    formula_version:FORMULA_VERSION,
    report_type:String(reportType||'ADHOC').toUpperCase(),
    generation_mode:text(mode,60),
    learning_mode:'SERVER_AGGREGATE',
    openai_called:false,
    data_status:dataStatus(summary),
    source_fingerprint:fingerprint(aggregate),
    aggregate,
    observations:(summary.insights||[]).slice(0,3).map(compactInsight),
    next_actions:(summary.recommendations||[]).slice(0,3).map(compactRecommendation),
    bid_validation:validationSummary(bidEvaluations),
    safety:{pii_included:false,platform_writes_allowed:false,owner_approval_required:true}
  };
}

function reportDate(report={}){return new Date(report.created_at||`${report.period_end||'1970-01-01'}T00:00:00Z`).getTime();}

function buildLearningHistory({reports=[],automationRuns=[]}={}){
  const latest=(reports||[]).filter(report=>report.is_latest!==false).sort((a,b)=>reportDate(b)-reportDate(a));
  const items=latest.slice(0,24).map(report=>{
    const previous=latest.find(candidate=>candidate.id!==report.id&&candidate.platform===report.platform&&candidate.report_type===report.report_type&&String(candidate.period_end||'')<String(report.period_start||report.period_end||''));
    const learning=report.summary_json?.learning||buildLearningSnapshot({summary:report.summary_json||{},reportType:report.report_type,mode:report.summary_json?.generation_mode||'LEGACY'});
    const score=number(report.summary_json?.score),before=number(previous?.summary_json?.score);
    const scoreDelta=score==null||before==null?null:score-before;
    const outcome=learning.data_status==='BLOCKED'?'BLOCKED':scoreDelta==null?'BASELINE':scoreDelta>2?'IMPROVED':scoreDelta<-2?'DECLINED':'STABLE';
    return {
      id:report.id,platform:report.platform,report_type:report.report_type,title:report.title,
      period_start:report.period_start,period_end:report.period_end,created_at:report.created_at,
      version:report.version||1,approved_at:report.approved_at||null,score,score_delta:scoreDelta,
      outcome,data_status:learning.data_status,learning_mode:learning.learning_mode,
      openai_called:Boolean(learning.openai_called),observations:learning.observations||[],
      next_actions:learning.next_actions||[],bid_validation:learning.bid_validation||validationSummary([]),
      source_fingerprint:learning.source_fingerprint||null
    };
  });
  const reportJobs=(automationRuns||[]).filter(run=>String(run.job_name||'').includes('REPORT'));
  return {
    phase:'12-8',formula_version:FORMULA_VERSION,schedule:REPORT_SCHEDULE,
    summary:{
      learned:items.length,improved:items.filter(item=>item.outcome==='IMPROVED').length,
      declined:items.filter(item=>item.outcome==='DECLINED').length,
      blocked:items.filter(item=>item.data_status==='BLOCKED').length,
      openai_calls:items.filter(item=>item.openai_called).length
    },
    items,
    recent_runs:reportJobs.slice(0,12).map(run=>({id:run.id,job_name:run.job_name,status:run.status,finished_at:run.finished_at||run.started_at,error_message:run.error_message||null}))
  };
}

module.exports={FORMULA_VERSION,REPORT_SCHEDULE,buildLearningSnapshot,buildLearningHistory,dataStatus,validationSummary,fingerprint};
