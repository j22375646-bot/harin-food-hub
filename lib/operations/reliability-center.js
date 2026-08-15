'use strict';

const SILENCE_MINUTES = 15;
function iso(value) { const date=new Date(value||0); return Number.isNaN(date.getTime())?null:date.toISOString(); }
function ageMinutes(value, now=Date.now()){const time=new Date(value||0).getTime();return Number.isFinite(time)?Math.max(0,Math.floor((Number(now)-time)/60000)):null;}
function buildWorkerHealth(rows=[], now=Date.now()){
  const workers=(rows||[]).map(row=>{const silence=ageMinutes(row.last_seen_at,now);const stale=silence===null||silence>=SILENCE_MINUTES;return {worker_id:row.worker_id,service_name:row.service_name,collector:row.collector,status:stale?'SILENT':row.status,source_ip:row.source_ip||null,last_seen_at:iso(row.last_seen_at),last_success_at:iso(row.last_success_at),silence_minutes:silence,current_job_type:row.current_job_type||null,current_job_id:row.current_job_id||null,last_error:row.last_error||null,stale};});
  return {status:workers.length===0||workers.some(item=>item.stale)?'CHECK':'HEALTHY',silence_threshold_minutes:SILENCE_MINUTES,workers};
}
function buildDeadLetters(operationRows=[],syncRows=[]){
  const operation=(operationRows||[]).filter(row=>row.status==='FAILED').map(row=>({kind:'OPERATION',id:row.id,title:row.operation_type,target:`${row.target_type||''} ${row.target_id||''}`.trim(),failed_at:iso(row.dead_lettered_at||row.executed_at||row.created_at),attempt_count:Number(row.attempt_count||0),manual_retry_count:Number(row.manual_retry_count||0),error:row.error_message||'작업 실패'}));
  const sync=(syncRows||[]).filter(row=>row.status==='FAILED').map(row=>({kind:'SYNC',id:row.id,title:row.request_type,target:'쿠팡 데이터 수집',failed_at:iso(row.dead_lettered_at||row.finished_at||row.requested_at),attempt_count:Number(row.attempt_count||0),manual_retry_count:Number(row.manual_retry_count||0),error:row.error_message||'수집 실패'}));
  return [...operation,...sync].sort((a,b)=>String(b.failed_at||'').localeCompare(String(a.failed_at||'')));
}
function buildReliabilityCenter({heartbeats=[],operationRequests=[],syncRequests=[],now=Date.now()}={}){const worker=buildWorkerHealth(heartbeats,now);const dead_letters=buildDeadLetters(operationRequests,syncRequests);return {phase:'13-8',status:worker.status==='HEALTHY'&&dead_letters.length===0?'HEALTHY':'CHECK',worker,dead_letters,dead_letter_count:dead_letters.length};}
async function runWorkerWatchdog(db,{now=new Date()}={}){
  const result=await db.from('worker_heartbeats').select('worker_id,service_name,collector,status,source_ip,last_seen_at,last_success_at,last_error,current_job_type,current_job_id');if(result.error)throw result.error;
  const health=buildWorkerHealth(result.data||[],now.getTime());const fingerprint='worker-silence:harin-coupang-worker';
  const open=await db.from('alerts').select('id,status').eq('fingerprint',fingerprint).eq('status','OPEN').maybeSingle();if(open.error)throw open.error;
  if(health.status==='CHECK'){const silent=health.workers.find(item=>item.stale);const message=silent?`고정 IP 워커가 ${silent.silence_minutes}분 동안 신호를 보내지 않았습니다. 주문·쿠팡 수집 대기열을 확인해 주세요.`:'고정 IP 워커의 생존 신호가 아직 등록되지 않았습니다.';if(!open.data){const inserted=await db.from('alerts').insert({source_type:'WORKER_HEARTBEAT',platform:'COUPANG',severity:'ERROR',title:'쿠팡 고정 IP 워커 확인 필요',message,fingerprint,status:'OPEN'});if(inserted.error&&inserted.error.code!=='23505')throw inserted.error;}}
  else if(open.data){const resolved=await db.from('alerts').update({status:'RESOLVED',resolved_at:now.toISOString()}).eq('id',open.data.id);if(resolved.error)throw resolved.error;}
  return health;
}
module.exports={SILENCE_MINUTES,buildDeadLetters,buildReliabilityCenter,buildWorkerHealth,runWorkerWatchdog};
