'use strict';

const jobRunner=require('../automation/job-runner.js');

const clean=(value,max=160)=>String(value||'').trim().slice(0,max);

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
  staleAfterMs=15*60*1000,runner=jobRunner.runJob
},work){
  if(!laneKey||!ownerKey||!runKey)throw new Error('laneKey, ownerKey and runKey are required');
  const result=await runner({
    db,
    jobName:`EXECUTION_LANE_${clean(laneKey,80)}`,
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
  const executionGuard=guardMeta({laneKey,ownerKey,runKey},result);
  if(result.alreadyRunning){
    return {status:202,body:{ok:true,skipped:true,reason:'ALREADY_RUNNING',message:'같은 작업이 이미 실행 중이라 이번 호출은 건너뛰었습니다.',execution_guard:executionGuard}};
  }
  const outcome=result.outcome||{status:200,body:{ok:true,skipped:true,reason:'ALREADY_COMPLETED',message:'이미 완료된 작업이라 저장된 결과를 사용했습니다.'}};
  return {status:outcome.status,body:{...outcome.body,execution_guard:executionGuard}};
}

module.exports={clean,guardMeta,runGuardedRoute};
