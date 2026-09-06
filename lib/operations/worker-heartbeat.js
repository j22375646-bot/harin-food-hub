'use strict';

// Each database connection belongs to one worker process. Serialize writes so
// a slow periodic pulse cannot overwrite a newer task transition.
function createHeartbeatWriter({identity,metadata,now=()=>new Date(),sanitize=String,onError=()=>{}}){
  const jobs=new Map();
  let status='ONLINE', lastError=null, errorJob=null, lastSuccess=null;
  let pending=Promise.resolve();
  return function write(db,values={}){
    const action=async()=>{
      const at=now().toISOString();
      const key=values.currentJobId?`${values.currentJobType||''}:${values.currentJobId}`:null;
      if(values.status==='BUSY'&&key)jobs.set(key,{type:values.currentJobType,id:values.currentJobId});
      else if(key)jobs.delete(key);
      if(values.error){lastError=sanitize(values.error);errorJob=key;}
      if(values.success){
        lastSuccess=at;
        if(key&&key===errorJob){lastError=null;errorJob=null;}
      }
      if(status!=='STOPPING'&&values.status)status=values.status;
      const job=jobs.values().next().value;
      const row={...identity(),status:status==='STOPPING'?'STOPPING':job?'BUSY':status,
        current_job_type:job?.type||null,current_job_id:job?.id||null,
        last_seen_at:at,last_error:lastError,updated_at:at,
        metadata:{...metadata(),active_job_count:jobs.size}};
      if(lastSuccess)row.last_success_at=lastSuccess;
      const result=await db.from('worker_heartbeats').upsert(row,{onConflict:'worker_id'});
      if(result.error)throw result.error;
    };
    pending=pending.then(action).catch(onError);
    return pending;
  };
}
module.exports={createHeartbeatWriter};
