'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const reliability=require('../lib/operations/reliability-center.js');
const topology=require('../lib/infrastructure/execution-topology.js');
const worker=require('../scripts/coupang-local-worker.js');
const now=new Date('2026-09-07T01:30:00Z');

test('fresh stopping or error heartbeat is not ready, while a busy worker can accept queued work',async()=>{
  for(const [status,ready] of [['ERROR',false],['STOPPING',false],['BUSY',true],['ONLINE',true]]){
    const rows=[{worker_id:'worker',service_name:'harin-coupang-worker',status,last_seen_at:now.toISOString()}];
    const query={select(){return this;},eq(){return this;},order(){return this;},limit(){return {data:rows};}};
    const result=await reliability.loadLiveRefreshWorkerReadiness({from:()=>query},{now});
    assert.equal(result.ready,ready,status);
    assert.equal(reliability.buildWorkerHealth(rows,now).status,ready?'HEALTHY':'CHECK',status);
  }
});

function heartbeatDb(){
  let saved={};
  return {get saved(){return saved;},from(table){assert.equal(table,'worker_heartbeats');return {async upsert(row){saved={...saved,...row};return {error:null};}};}};
}

test('periodic worker pulse preserves an active job and latest failure',async()=>{
  const db=heartbeatDb();
  await worker.writeHeartbeat(db,{status:'BUSY',currentJobType:'ORDER_REALTIME',currentJobId:'job-a'});
  await worker.writeHeartbeat(db,{});
  assert.equal(db.saved.status,'BUSY');
  assert.equal(db.saved.current_job_id,'job-a');
  await worker.writeHeartbeat(db,{status:'ERROR',currentJobType:'ORDER_REALTIME',currentJobId:'job-a',error:'upstream timeout'});
  await worker.writeHeartbeat(db,{});
  assert.equal(db.saved.status,'ERROR');
  assert.equal(db.saved.last_error,'upstream timeout');
});

test('finishing one concurrent job does not erase another or undo stopping state',async()=>{
  const db=heartbeatDb();
  await worker.writeHeartbeat(db,{status:'BUSY',currentJobType:'ORDER_REALTIME',currentJobId:'job-a'});
  await worker.writeHeartbeat(db,{status:'BUSY',currentJobType:'EPOST_TRACKING',currentJobId:'job-b'});
  await worker.writeHeartbeat(db,{status:'ONLINE',currentJobType:'ORDER_REALTIME',currentJobId:'job-a',success:true});
  assert.equal(db.saved.current_job_id,'job-b');
  assert.equal(db.saved.status,'BUSY');
  await worker.writeHeartbeat(db,{status:'STOPPING'});
  await worker.writeHeartbeat(db,{status:'ONLINE',currentJobType:'EPOST_TRACKING',currentJobId:'job-b',success:true});
  assert.equal(db.saved.status,'STOPPING');
});

test('an old hourly run cannot look protected just because the worker heartbeat is fresh',()=>{
  const model=topology.buildExecutionTopology({now,heartbeats:[{status:'BUSY',last_seen_at:now.toISOString()}],automationRuns:[{
    job_name:'EXECUTION_LANE_HOURLY_ORDERS',status:'SUCCESS',started_at:'2026-09-03T00:00:00Z',finished_at:'2026-09-03T00:01:00Z'
  }],syncRequests:[{status:'SUCCESS',idempotency_key:'orders-hourly:2026-09-03T00',finished_at:'2026-09-03T00:01:00Z'}]});
  assert.equal(model.worker.ready,true);
  const hourly=model.lanes.find(row=>row.lane_key==='HOURLY_ORDERS');
  assert.equal(hourly.state,'CHECK');
  assert.equal(hourly.protectionState,'CHECK');
  assert.equal(model.summary.switchReady,false);
});

function hourlyModel(run,syncRequests=[]){
  return topology.buildExecutionTopology({now,heartbeats:[{status:'ONLINE',last_seen_at:now.toISOString()}],automationRuns:[{job_name:'EXECUTION_LANE_HOURLY_ORDERS',...run}],syncRequests}).lanes.find(row=>row.lane_key==='HOURLY_ORDERS');
}

test('late queue completion cannot hide a missing hourly trigger',()=>{
  const hourly=hourlyModel({status:'SUCCESS',started_at:'2026-09-06T23:30:00Z',finished_at:'2026-09-07T01:29:00Z'},[
    {status:'SUCCESS',idempotency_key:'orders-hourly:2026-09-06T23',finished_at:'2026-09-07T01:29:30Z'}
  ]);
  assert.equal(hourly.protectionState,'CHECK');
  assert.equal(hourly.lastEvidenceAt,'2026-09-06T23:30:00Z');
});

test('failed, partial or hung hourly runs are not protected',()=>{
  for(const [status,started_at] of [['FAILED','2026-09-07T01:29:00Z'],['PARTIAL','2026-09-07T01:29:00Z'],['RUNNING','2026-09-07T01:00:00Z']]){
    const hourly=hourlyModel({status,started_at});
    assert.equal(hourly.protectionState,'CHECK',status);
    assert.equal(hourly.recoveryState,'CHECK',status);
  }
  assert.equal(hourlyModel({status:'RUNNING',started_at:'2026-09-07T01:29:00Z'}).protectionState,'PROTECTED');
  assert.equal(hourlyModel({status:'SUCCESS',started_at:'2026-09-07T01:29:00Z'}).protectionState,'PROTECTED');
});

test('watchdog reports an error state instead of claiming a fresh heartbeat is missing',async()=>{
  let alert;
  const db={from(table){if(table==='worker_heartbeats')return {select:async()=>({data:[{status:'ERROR',last_seen_at:now.toISOString()}]})};
    const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:null};},async insert(row){alert=row;return {};}};return query;}};
  await reliability.runWorkerWatchdog(db,{now});
  assert.match(alert.message,/ERROR/);
  assert.doesNotMatch(alert.message,/등록되지/);
});
