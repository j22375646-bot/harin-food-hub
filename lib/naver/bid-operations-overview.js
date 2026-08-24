'use strict';

const NAVER='NAVER';
const RUN_FAILURES=new Set(['FAILED','PARTIAL','SETUP_REQUIRED']);
const PRIORITY={ACTION_REQUIRED:0,EMERGENCY_PAUSED:1,SETUP_REQUIRED:2,ACTIVE:3,OBSERVE:4,PAUSED:5};

const text=value=>String(value??'').trim();
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const isNaver=item=>!text(item?.platform)||text(item.platform).toUpperCase()===NAVER;
const latestAt=item=>item?.latest_run?.finished_at||item?.latest_run?.started_at||item?.last_run_at||null;

function groupStatus(schedule,{automationEnabled,control}){
  if(control?.emergency_paused===true)return {status:'EMERGENCY_PAUSED',reason:text(control.paused_reason)||'전체 긴급정지'};
  const run=schedule.latest_run||null;
  if(run&&RUN_FAILURES.has(text(run.status).toUpperCase())){
    return {status:'ACTION_REQUIRED',reason:text(run.error_message)||'최근 자동입찰 실행 결과를 확인해주세요.'};
  }
  const mode=text(schedule.mode||'PAUSED').toUpperCase();
  if(mode==='ACTIVE'&&!automationEnabled)return {status:'SETUP_REQUIRED',reason:'서버 자동적용 잠금이 켜져 있어요.'};
  if(mode==='ACTIVE')return {status:'ACTIVE',reason:run?'최근 실행 결과를 다시 읽었어요.':'다음 예약 시각을 기다리고 있어요.'};
  if(mode==='OBSERVE')return {status:'OBSERVE',reason:run?'입찰가를 바꾸지 않고 결과만 기록했어요.':'첫 관찰 실행 전이에요.'};
  return {status:'PAUSED',reason:'광고그룹 자동입찰이 정지되어 있어요.'};
}

function buildNaverBidOperationsOverview({schedules=[],rules=[],control={},automationEnabled=false}={}){
  const scopedSchedules=(Array.isArray(schedules)?schedules:[]).filter(isNaver);
  const scopedRules=(Array.isArray(rules)?rules:[]).filter(isNaver);
  const enabledRules=scopedRules.filter(item=>item?.enabled===true);
  const ruleCount=new Map();
  for(const rule of enabledRules){
    const id=text(rule.ncc_adgroup_id);
    if(id)ruleCount.set(id,(ruleCount.get(id)||0)+1);
  }
  const groups=scopedSchedules.map(schedule=>{
    const mode=text(schedule.mode||'PAUSED').toUpperCase();
    const run=schedule.latest_run||null;
    const state=groupStatus(schedule,{automationEnabled,control});
    return {
      platform:NAVER,ncc_adgroup_id:text(schedule.ncc_adgroup_id),mode,status:state.status,reason:state.reason,
      safe_keyword_count:ruleCount.get(text(schedule.ncc_adgroup_id))||0,
      latest_run_status:run?text(run.status).toUpperCase():null,
      latest_activity_at:latestAt(schedule),
      planned_count:number(run?.planned_count),executed_count:number(run?.executed_count),blocked_count:number(run?.blocked_count)
    };
  }).sort((a,b)=>(PRIORITY[a.status]??99)-(PRIORITY[b.status]??99)||String(b.latest_activity_at||'').localeCompare(String(a.latest_activity_at||'')));
  const summary={
    configured_groups:groups.length,
    active_groups:groups.filter(item=>item.mode==='ACTIVE').length,
    observing_groups:groups.filter(item=>item.mode==='OBSERVE').length,
    paused_groups:groups.filter(item=>item.mode==='PAUSED').length,
    action_required_groups:groups.filter(item=>item.status==='ACTION_REQUIRED'||item.status==='SETUP_REQUIRED'||item.status==='EMERGENCY_PAUSED').length,
    safe_keywords:enabledRules.length,
    planned_changes:groups.reduce((sum,item)=>sum+item.planned_count,0),
    executed_changes:groups.reduce((sum,item)=>sum+item.executed_count,0),
    blocked_changes:groups.reduce((sum,item)=>sum+item.blocked_count,0)
  };
  let status='SETUP_REQUIRED';
  if(control?.emergency_paused===true)status='EMERGENCY_PAUSED';
  else if(groups.some(item=>item.status==='ACTION_REQUIRED'))status='ACTION_REQUIRED';
  else if(groups.some(item=>item.status==='SETUP_REQUIRED'))status='SETUP_REQUIRED';
  else if(summary.active_groups)status='ACTIVE';
  else if(summary.observing_groups)status='OBSERVE';
  else if(summary.configured_groups)status='PAUSED';
  return {
    platform:NAVER,status,automation_enabled:automationEnabled===true,
    control:{emergency_paused:control?.emergency_paused===true,paused_reason:text(control?.paused_reason)||null,updated_at:control?.updated_at||null},
    latest_activity_at:groups.map(item=>item.latest_activity_at).filter(Boolean).sort().at(-1)||null,
    summary,groups
  };
}

module.exports={buildNaverBidOperationsOverview,groupStatus};
