'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');

function isolatedSync({inquiryVerificationWarnings=[],failedDatasets=[]}={}){
  const updates=[];
  const db={from(table){
    const query={
      insert(){return query;},select(){return query;},eq(){return query;},gte(){return query;},upsert(){return query;},
      update(row){updates.push({table,row});return query;},
      single:async()=>({data:{id:'cs-sync-test'},error:null}),
      then(resolve,reject){return Promise.resolve({data:[],count:0,error:null}).then(resolve,reject);}
    };
    return query;
  }};
  const collect=(dataset,counts)=>async()=>{
    if(failedDatasets.includes(dataset))throw Object.assign(new Error(`${dataset} source unavailable`),{status:403});
    return counts;
  };
  const filename=path.resolve(__dirname,'../lib/coupang/sync.js');
  const localRequire=createRequire(filename);
  const overrides={
    './config.js':{getConfig:()=>({vendorId:'test-vendor',syncDays:1})},
    '../cafe24/supabase.js':{getSupabase:()=>db},
    './client.js':{request:async()=>({status:200,data:[]})},
    './operations.js':{
      syncReturns:collect('returns',{returns:0}),
      syncExchanges:collect('exchanges',{exchanges:0}),
      syncInquiries:collect('inquiries',{inquiries:0,unansweredInquiries:0,staleInquiriesRefreshed:0,inquiryVerificationWarnings}),
      syncOperations:async()=>({counts:{inquiries:0,unansweredInquiries:0,staleInquiriesRefreshed:0,inquiryVerificationWarnings},errors:[]})
    }
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    module,exports:module.exports,process:{env:{}},
    require:name=>overrides[name]||localRequire(name)
  },{filename});
  return {sync:module.exports,updates};
}

for(const method of ['syncCustomerServiceRealtime','syncAll']){
  test(`${method} preserves inquiry verification warnings as partial evidence outside numeric counts`,async()=>{
    const warning={inquiryId:'old-inquiry',code:'COUPANG_INQUIRY_NOT_FOUND'};
    const ctx=isolatedSync({inquiryVerificationWarnings:[warning]});
    const result=await ctx.sync[method]();
    assert.equal(result.status,'PARTIAL');
    assert.equal(result.inquiryVerificationWarnings[0].inquiryId,'old-inquiry');
    assert.equal(result.inquiryVerificationWarnings[0].code,'COUPANG_INQUIRY_NOT_FOUND');
    assert.equal(result.counts.inquiryVerificationWarnings,undefined);
    assert.equal(result.counts.staleInquiriesRefreshed,0);
    const saved=ctx.updates.find(item=>item.table==='sync_logs'&&item.row.finished_at).row;
    assert.equal(saved.status,'PARTIAL');
    assert.equal(saved.metadata.inquiryVerificationWarnings[0].code,'COUPANG_INQUIRY_NOT_FOUND');
    assert.equal(saved.metadata.counts.inquiryVerificationWarnings,undefined);
    assert.ok(Number.isFinite(saved.rows_received));
    assert.match(saved.error_message,/COUPANG_INQUIRY_NOT_FOUND/);
  });
}

test('successful empty CS collection with no verification warnings remains success',async()=>{
  const ctx=isolatedSync();
  const result=await ctx.sync.syncCustomerServiceRealtime();
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.inquiryVerificationWarnings?.length,0);
  const saved=ctx.updates.find(item=>item.table==='sync_logs'&&item.row.finished_at).row;
  assert.equal(saved.status,'SUCCESS');
  assert.equal(saved.error_message,null);
  assert.equal(saved.rows_received,0);
});

test('CS collection keeps all-source failure distinct from verification warnings',async()=>{
  const ctx=isolatedSync({failedDatasets:['returns','exchanges','inquiries']});
  const result=await ctx.sync.syncCustomerServiceRealtime();
  assert.equal(result.status,'FAILED');
  assert.equal(result.errors.length,3);
  assert.equal(result.inquiryVerificationWarnings?.length,0);
  assert.equal(ctx.updates.find(item=>item.table==='sync_logs'&&item.row.finished_at).row.status,'FAILED');
});
