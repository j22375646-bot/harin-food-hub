'use strict';

const jobRunner=require('../automation/job-runner.js');

const clean=(value,max=160)=>String(value||'').trim().slice(0,max);

async function latestSuccessfulRun(db,jobName){
  if(!db?.from)return null;
  const query=await db.from('automation_runs')
    .select('id,status,finished_at,recovery_count')
    .eq('job_name',jobName).eq('status','SUCCESS')
    .order('finished_at',{ascending:false}).limit(1).maybeSingle();
  if(query.error)throw query.error;
  return query.data||null;
}

function guardMeta({laneKey,ownerKey,runKey},run={}){
  return {
    lane_key:clean(laneKey,80),
    owner_key:clean(ownerKey,160),
    run_key:clean(runKey,240),
    run_id:run.runId||null,
    deduplicated:Boolean(run.deduplicated),
    already_running:Boolean(run.alreadyRunning),
    mode:'AUTOMATION_RUN_LEASE'
  };
}

async function runGuardedRoute({
  db,laneKey,ownerKey,runKey,scheduledFor=null,kstExecutionDate=null,
  staleAfterMs=15*60*1000,runner=jobRunner.runJob,
  previousSuccessLoader=latestSuccessfulRun
},work){
  if(!laneKey||!ownerKey||!runKey)throw new Error('laneKey, ownerKey and runKey are required');
  const jobName=`EXECUTION_LANE_${clean(laneKey,80)}`;
  let result;
  try{
    result=await runner({
      db,
      jobName,
      triggerType:'CRON',
      idempotencyKey:clean(runKey,240),
      scheduledFor,
      kstExecutionDate,
      staleAfterMs,
      maxAttempts:1,
      work:async context=>{
        const outcome=await work(context);
        const httpStatus=Number(outcome?.status)||200;
        return {
          status:httpStatus>=400||outcome?.body?.ok===false?'PARTIAL':'SUCCESS',
          outcome:{status:httpStatus,body:outcome?.body||{ok:true}}
        };
      }
    });
  }catch(error){
    const previous=await previousSuccessLoader(db,jobName).catch(()=>null);
    return {
      status:503,
      body:{
        ok:false,
        error:clean(error?.message||error||'작업 실행 실패',500),
        reason:'CURRENT_RUN_FAILED',
        message:previous?'이번 실행은 실패했지만 이전 성공 자료는 그대로 유지합니다.':'이번 실행이 실패했고 아직 보존할 이전 성공 자료가 없습니다.',
        stale_result_available:Boolean(previous),
        previous_success:previous?{run_id:previous.id,finished_at:previous.finished_at,recovery_count:Number(previous.recovery_count||0)}:null,
        execution_guard:guardMeta({laneKey,ownerKey,runKey},{})
      }
    };
  }
  const executionGuard=guardMeta({laneKey,ownerKey,runKey},result);
  if(result.alreadyRunning){
    return {status:202,body:{ok:true,skipped:true,reason:'ALREADY_RUNNING',message:'같은 작업이 이미 실행 중이라 이번 호출은 건너뛰었습니다.',execution_guard:executionGuard}};
  }
  const outcome=result.outcome||{status:200,body:{ok:true,skipped:true,reason:'ALREADY_COMPLETED',message:'이미 완료된 작업이라 저장된 결과를 사용했습니다.'}};
  return {status:outcome.status,body:{...outcome.body,execution_guard:executionGuard}};
}

module.exports={clean,guardMeta,latestSuccessfulRun,runGuardedRoute};
