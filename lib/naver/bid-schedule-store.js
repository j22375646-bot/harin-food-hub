'use strict';

const {getSupabase}=require('../cafe24/supabase.js');
const schedules=require('./bid-schedules.js');

const SCHEDULE_TABLE='naver_bid_automation_schedules';
const RUN_TABLE='naver_bid_automation_runs';
const CONTROL_TABLE='naver_bid_automation_controls';
const SCHEDULE_FIELDS='ncc_adgroup_id,mode,weekdays,start_minute,end_minute,interval_minutes,max_changes_per_run,daily_change_limit,time_slots,allow_increase,activation_confirmed_at,last_run_slot,last_run_at,last_run_status,updated_at';

class NaverBidScheduleStoreError extends Error{
  constructor(message,code='BID_SCHEDULE_STORE_FAILED',status=500){
    super(message);this.name='NaverBidScheduleStoreError';this.code=code;this.status=status;
  }
}

function isSetupMissing(error){
  return ['42P01','PGRST204','PGRST205'].includes(String(error?.code||''))||/naver_bid_automation_/i.test(String(error?.message||''))&&/schema cache|does not exist|not find/i.test(String(error?.message||''));
}

function fail(error,message){
  if(isSetupMissing(error))throw new NaverBidScheduleStoreError('네이버 자동입찰 스케줄 저장소를 준비한 뒤 다시 시도해주세요.','SETUP_REQUIRED',503);
  throw new NaverBidScheduleStoreError(message,'BID_SCHEDULE_STORE_FAILED',500);
}

function normalizeStored(item){
  const schedule=schedules.validateNaverBidSchedule({...item,platform:'NAVER'});
  return {...schedule,last_run_at:item.last_run_at||null,last_run_status:item.last_run_status||null,updated_at:item.updated_at||null};
}

async function listNaverBidSchedules({db=getSupabase(),adgroupId=''}={}){
  let query=db.from(SCHEDULE_TABLE).select(SCHEDULE_FIELDS).order('updated_at',{ascending:false});
  if(adgroupId)query=query.eq('ncc_adgroup_id',String(adgroupId));
  const result=await query;
  if(result.error)fail(result.error,'네이버 자동입찰 스케줄을 불러오지 못했습니다.');
  const items=(result.data||[]).map(normalizeStored);
  const ids=items.map(item=>item.ncc_adgroup_id);
  let latestRuns=[];
  if(ids.length){
    const runs=await db.from(RUN_TABLE).select('id,ncc_adgroup_id,run_slot,mode,status,planned_count,executed_count,blocked_count,error_message,started_at,finished_at').in('ncc_adgroup_id',ids).order('started_at',{ascending:false}).limit(Math.min(100,ids.length*5));
    if(runs.error)fail(runs.error,'네이버 자동입찰 최근 실행 기록을 불러오지 못했습니다.');
    const seen=new Set();
    latestRuns=(runs.data||[]).filter(item=>{if(seen.has(item.ncc_adgroup_id))return false;seen.add(item.ncc_adgroup_id);return true;});
  }
  const runMap=new Map(latestRuns.map(item=>[item.ncc_adgroup_id,item]));
  return items.map(item=>({...item,latest_run:runMap.get(item.ncc_adgroup_id)||null}));
}

async function saveNaverBidSchedule({db=getSupabase(),schedule,actor='dashboard-session'}={}){
  const group=await db.from('naver_adgroups').select('ncc_adgroup_id,name,status,user_lock').eq('ncc_adgroup_id',schedule.ncc_adgroup_id).maybeSingle();
  if(group.error)fail(group.error,'현재 네이버 광고그룹을 확인하지 못했습니다.');
  if(!group.data)throw new NaverBidScheduleStoreError('현재 네이버 계정에서 광고그룹을 다시 확인해주세요.','ADGROUP_NOT_FOUND',409);
  const active=schedule.mode==='ACTIVE';
  const row={
    ncc_adgroup_id:schedule.ncc_adgroup_id,mode:schedule.mode,weekdays:schedule.weekdays,
    start_minute:schedule.start_minute,end_minute:schedule.end_minute,interval_minutes:schedule.interval_minutes,
    max_changes_per_run:schedule.max_changes_per_run,daily_change_limit:schedule.daily_change_limit,
    time_slots:schedule.time_slots,
    allow_increase:schedule.allow_increase,
    activation_confirmed_at:active?schedule.activation_confirmed_at:null,
    activation_confirmed_by:active?String(actor||'dashboard-session').slice(0,100):null,
    updated_by:String(actor||'dashboard-session').slice(0,100)
  };
  const saved=await db.from(SCHEDULE_TABLE).upsert(row,{onConflict:'ncc_adgroup_id'}).select(SCHEDULE_FIELDS).single();
  if(saved.error)fail(saved.error,'네이버 자동입찰 스케줄을 저장하지 못했습니다.');
  return {...normalizeStored(saved.data),group:{name:group.data.name||'',status:group.data.status||'',user_lock:group.data.user_lock===true}};
}

async function getNaverBidAutomationControl({db=getSupabase()}={}){
  const result=await db.from(CONTROL_TABLE).select('id,emergency_paused,paused_reason,paused_at,paused_by,updated_at').eq('id','global').maybeSingle();
  if(result.error)fail(result.error,'네이버 자동입찰 긴급정지 상태를 불러오지 못했습니다.');
  return result.data||{id:'global',emergency_paused:false,paused_reason:null,paused_at:null,paused_by:null,updated_at:null};
}

async function setNaverBidAutomationPaused({db=getSupabase(),paused,reason='',actor='dashboard-session'}={}){
  const isPaused=paused===true;
  const row={
    id:'global',emergency_paused:isPaused,
    paused_reason:isPaused?String(reason||'사장님 긴급 정지').trim().slice(0,300):null,
    paused_at:isPaused?new Date().toISOString():null,
    paused_by:isPaused?String(actor||'dashboard-session').slice(0,100):null
  };
  const result=await db.from(CONTROL_TABLE).upsert(row,{onConflict:'id'}).select('id,emergency_paused,paused_reason,paused_at,paused_by,updated_at').single();
  if(result.error)fail(result.error,'네이버 자동입찰 긴급정지 상태를 저장하지 못했습니다.');
  return result.data;
}

async function claimRun({db=getSupabase(),schedule,slot}={}){
  const inserted=await db.from(RUN_TABLE).insert({ncc_adgroup_id:schedule.ncc_adgroup_id,run_slot:slot,mode:schedule.mode,status:'RUNNING'}).select('*').single();
  if(inserted.error?.code==='23505')return {reused:true,run:null};
  if(inserted.error)fail(inserted.error,'네이버 자동입찰 실행 기록을 만들지 못했습니다.');
  return {reused:false,run:inserted.data};
}

async function finishRun({db=getSupabase(),runId,schedule,status,planned=0,executed=0,blocked=0,details={},errorMessage=null,slot}={}){
  const finishedAt=new Date().toISOString();
  const [runResult,scheduleResult]=await Promise.all([
    db.from(RUN_TABLE).update({status,planned_count:planned,executed_count:executed,blocked_count:blocked,details,error_message:errorMessage,finished_at:finishedAt}).eq('id',runId),
    db.from(SCHEDULE_TABLE).update({last_run_slot:slot,last_run_at:finishedAt,last_run_status:status}).eq('ncc_adgroup_id',schedule.ncc_adgroup_id)
  ]);
  if(runResult.error)fail(runResult.error,'네이버 자동입찰 실행 결과를 저장하지 못했습니다.');
  if(scheduleResult.error)fail(scheduleResult.error,'네이버 자동입찰 스케줄 상태를 갱신하지 못했습니다.');
}

async function dailyExecutedCount({db=getSupabase(),adgroupId,now=new Date()}={}){
  const date=schedules.kstParts(now).date;
  const since=new Date(`${date}T00:00:00+09:00`).toISOString();
  const result=await db.from(RUN_TABLE).select('executed_count').eq('ncc_adgroup_id',adgroupId).gte('started_at',since).in('status',['COMPLETED','PARTIAL']);
  if(result.error)fail(result.error,'오늘 자동입찰 변경 수를 확인하지 못했습니다.');
  return (result.data||[]).reduce((sum,item)=>sum+Number(item.executed_count||0),0);
}

module.exports={
  CONTROL_TABLE,RUN_TABLE,SCHEDULE_FIELDS,SCHEDULE_TABLE,NaverBidScheduleStoreError,
  claimRun,dailyExecutedCount,finishRun,getNaverBidAutomationControl,isSetupMissing,
  listNaverBidSchedules,saveNaverBidSchedule,setNaverBidAutomationPaused
};
