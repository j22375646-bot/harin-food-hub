'use strict';

const {buildExecutionTopology}=require('./execution-topology.js');

const querySpecs=[
  ['controls',db=>db.from('execution_path_controls').select('lane_key,label,current_trigger,current_executor,queue_backend,desired_trigger,desired_executor,desired_queue_backend,mode,migration_authorized,schedule_label,source_path,safety_rules,notes,updated_at').order('lane_key')],
  ['syncRequests',db=>db.from('coupang_sync_requests').select('id,request_type,status,requested_at,started_at,finished_at,idempotency_key,scheduled_for,kst_execution_date').order('requested_at',{ascending:false}).limit(800)],
  ['operationRequests',db=>db.from('coupang_operation_requests').select('id,operation_type,target_type,status,created_at,started_at,executed_at,idempotency_key').order('created_at',{ascending:false}).limit(1200)],
  ['automationRuns',db=>db.from('automation_runs').select('id,job_name,trigger_type,status,started_at,finished_at,heartbeat_at,idempotency_key,scheduled_for,kst_execution_date,recovery_count,error_message').order('started_at',{ascending:false}).limit(500)],
  ['heartbeats',db=>db.from('worker_heartbeats').select('worker_id,service_name,status,source_ip,last_seen_at,last_success_at,updated_at').order('last_seen_at',{ascending:false}).limit(20)],
  ['syncLogs',db=>db.from('sync_logs').select('platform,job_type,status,started_at,finished_at').order('started_at',{ascending:false}).limit(300)]
];

async function loadExecutionTopology(db,{now=new Date(),nativeQueueEnabled=process.env.SUPABASE_NATIVE_QUEUE_ENABLED==='true'}={}){
  const settled=await Promise.allSettled(querySpecs.map(([,query])=>query(db)));
  const input={now,nativeQueueEnabled},issues=[];
  settled.forEach((result,index)=>{
    const key=querySpecs[index][0];
    if(result.status==='rejected'){issues.push({dataset:key,message:result.reason?.message||'조회 실패'});input[key]=[];return;}
    if(result.value?.error){issues.push({dataset:key,message:result.value.error.message||'조회 실패'});input[key]=[];return;}
    input[key]=result.value?.data||[];
  });
  input.issues=issues;
  return buildExecutionTopology(input);
}

module.exports={loadExecutionTopology,querySpecs};
