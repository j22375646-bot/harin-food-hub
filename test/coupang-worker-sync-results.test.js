'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

function isolatedWorker(runSync){
  const updates=[],heartbeats=[],logs=[];
  const db={from(table){
    if(table==='worker_heartbeats')return {async upsert(row){heartbeats.push(row);return {error:null};}};
    assert.equal(table,'coupang_sync_requests');
    const query={
      update(row){updates.push(row);return query;},
      eq(){return query;},
      then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject);}
    };
    return query;
  }};
  const filename=path.resolve(__dirname,'../scripts/coupang-local-worker.js');
  const localRequire=createRequire(filename);
  const overrides={
    dotenv:{config(){}},
    'node:fs':{mkdirSync(){},appendFileSync(_file,line){logs.push(line);}},
    '../lib/coupang/sync.js':{
      syncAll:runSync,syncRocketGrowthInventoryOnly:runSync,syncRocketGrowthRealtime:runSync,
      syncSellerOrdersRealtime:runSync,syncCustomerServiceRealtime:runSync
    }
  };
  const module={exports:{}};
  // Isolate dotenv, network collectors and log I/O. Run the real worker and
  // heartbeat writer so the assertions cover queue and operational state.
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    module,exports:module.exports,__dirname:path.dirname(filename),
    process:{argv:['--quiet'],env:{},version:process.version},
    require:name=>overrides[name]||localRequire(name),
    fetch:()=>{throw new Error('Unexpected network access in worker regression');}
  },{filename});
  return {worker:module.exports,db,updates,heartbeats,logs};
}

const request=(attempt_count=1,request_type='CS_REALTIME')=>({id:'sync-result-test',request_type,attempt_count});

for(const status of ['FAILED','PARTIAL']){
  test(`a returned ${status} CS collection result cannot become queue or heartbeat success`,async()=>{
    const result={status,counts:{returns:status==='PARTIAL'?1:0,inquiries:0},errors:[{dataset:'inquiries',message:'Unexpected inquiry response',status:422}]};
    const ctx=isolatedWorker(async()=>result);
    await assert.rejects(ctx.worker.processRequest(ctx.db,request()),error=>error.code===`COUPANG_SYNC_${status}`);
    assert.equal(ctx.updates.length,1);
    assert.equal(ctx.updates[0].status,'FAILED');
    assert.equal(ctx.updates[0].result_json,result);
    assert.ok(ctx.updates[0].finished_at);
    assert.ok(ctx.updates[0].dead_lettered_at);
    assert.match(ctx.updates[0].error_message,/inquiries.*Unexpected inquiry response/);
    assert.equal(ctx.heartbeats.at(-1).status,'ERROR');
    assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
    assert.equal(ctx.logs.some(line=>line.includes('SUCCESS CS_REALTIME')),false);
  });
}

test('a partial HTTP 429 collection keeps the existing five-minute retry contract',async()=>{
  const result={status:'PARTIAL',counts:{returns:1},errors:[{dataset:'inquiries',message:'Rate limited',status:429}]};
  const ctx=isolatedWorker(async()=>result);
  const before=Date.now();
  await ctx.worker.processRequest(ctx.db,request(7));
  const after=Date.now();
  const saved=ctx.updates[0];
  assert.equal(saved.status,'PENDING');
  assert.equal(saved.result_json,result);
  assert.match(saved.error_message,/429/);
  assert.ok(Date.parse(saved.next_attempt_at)>=before+5*60*1000);
  assert.ok(Date.parse(saved.next_attempt_at)<=after+5*60*1000);
  assert.equal(saved.dead_lettered_at,undefined);
  assert.equal(saved.finished_at,undefined);
  assert.equal(ctx.heartbeats.at(-1).status,'ONLINE');
  assert.match(ctx.heartbeats.at(-1).last_error,/429/);
  assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
});

test('the eighth failed CS collection goes to the existing dead-letter path',async()=>{
  const result={status:'FAILED',counts:{inquiries:0},errors:[{dataset:'inquiries',message:'fetch failed'}]};
  const ctx=isolatedWorker(async()=>result);
  await assert.rejects(ctx.worker.processRequest(ctx.db,request(8)),/fetch failed/);
  assert.equal(ctx.updates[0].status,'FAILED');
  assert.ok(ctx.updates[0].dead_lettered_at);
  assert.equal(ctx.updates[0].next_attempt_at,undefined);
  assert.equal(ctx.heartbeats.at(-1).status,'ERROR');
});

test('a successful collector with non-failure warnings still records success',async()=>{
  const result={status:'SUCCESS',counts:{inquiries:0},errors:[],warnings:[{code:'PENDING_TYPED_EVIDENCE'}]};
  const ctx=isolatedWorker(async()=>result);
  await ctx.worker.processRequest(ctx.db,request());
  assert.equal(ctx.updates.length,1);
  assert.equal(ctx.updates[0].status,'SUCCESS');
  assert.equal(ctx.updates[0].result_json,result);
  assert.equal(ctx.updates[0].error_message,null);
  assert.ok(ctx.updates[0].finished_at);
  assert.equal(ctx.heartbeats.at(-1).status,'ONLINE');
  assert.ok(ctx.heartbeats.at(-1).last_success_at);
});

test('thrown collector timeouts retain retry scheduling and available failure evidence',async()=>{
  const result={status:'FAILED',counts:{inquiries:0}};
  const ctx=isolatedWorker(async()=>{throw Object.assign(new Error('upstream timeout'),{syncResult:result});});
  await ctx.worker.processRequest(ctx.db,request());
  assert.equal(ctx.updates[0].status,'PENDING');
  assert.equal(ctx.updates[0].result_json,result);
  assert.ok(ctx.updates[0].next_attempt_at);
  assert.match(ctx.heartbeats.at(-1).last_error,/timeout/);
  assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
});

test('a collector result without a completion status remains a failure',async()=>{
  const ctx=isolatedWorker(async()=>({counts:{inquiries:0}}));
  await assert.rejects(ctx.worker.processRequest(ctx.db,request()),error=>error.code==='COUPANG_SYNC_RESULT_INVALID');
  assert.equal(ctx.updates[0].status,'FAILED');
  assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
});

test('partial seller-order results retain the claim warning needed for retry classification',async()=>{
  const result={status:'PARTIAL',counts:{orders:1,claimWarning:'claims request timeout'}};
  const ctx=isolatedWorker(async()=>result);
  await ctx.worker.processRequest(ctx.db,request(1,'ORDER_REALTIME'));
  assert.equal(ctx.updates[0].status,'PENDING');
  assert.match(ctx.updates[0].error_message,/claims request timeout/);
  assert.equal(ctx.updates[0].result_json,result);
  assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
});

test('unverified inquiry warnings remain visible when a partial collection reaches the worker',async()=>{
  const result={status:'PARTIAL',errors:[],inquiryVerificationWarnings:[{inquiryId:'old',code:'COUPANG_INQUIRY_NOT_FOUND'}]};
  const ctx=isolatedWorker(async()=>result);
  await assert.rejects(ctx.worker.processRequest(ctx.db,request()),/COUPANG_INQUIRY_NOT_FOUND/);
  assert.equal(ctx.updates[0].status,'FAILED');
  assert.equal(ctx.updates[0].result_json,result);
  assert.equal(ctx.heartbeats.some(row=>row.last_success_at),false);
});
