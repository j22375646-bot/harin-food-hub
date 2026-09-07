'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const auth=require('../lib/dashboard-auth.js');
const supabase=require('../lib/cafe24/supabase.js');

function dbWith(rows){
  return {from(table){let items=rows[table]||[];const query={select(){return query;},eq(key,value){items=items.filter(row=>row[key]===value);return query;},async maybeSingle(){return {data:items[0]||null,error:null};}};return query;}};
}

test('CS status API requires an owner and reads only requested CS jobs without raw results',async()=>{
  const originalAuth=auth.validateSession,originalDb=supabase.getSupabase;
  const id='00000000-0000-4000-8000-000000000123';
  try{
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/customer-service/sync/route.js')).href);
    auth.validateSession=async()=>null;
    const denied=await route.GET(new Request(`https://hub.example/api/customer-service/sync?coupangId=${id}`));
    assert.equal(denied.status,401);
    assert.match(denied.headers.get('cache-control'),/no-store/);
    auth.validateSession=async()=>({role:'OWNER'});
    supabase.getSupabase=()=>dbWith({coupang_sync_requests:[{id,request_type:'CS_REALTIME',status:'SUCCESS',result_json:{status:'PARTIAL',raw:'secret'},error_message:'secret',finished_at:'2026-09-07T10:00:00Z'}]});
    const response=await route.GET(new Request(`https://hub.example/api/customer-service/sync?coupangId=${id}`));
    assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.jobs,[{platform:'COUPANG',id,status:'PARTIAL',finishedAt:'2026-09-07T10:00:00Z'}]);
    assert.equal(JSON.stringify(result).includes('secret'),false);
    supabase.getSupabase=()=>dbWith({coupang_sync_requests:[{id,request_type:'FULL',status:'SUCCESS'}]});
    const unrelated=await route.GET(new Request(`https://hub.example/api/customer-service/sync?coupangId=${id}`));
    assert.equal(unrelated.status,404);
    const invalid=await route.GET(new Request('https://hub.example/api/customer-service/sync?coupangId=not-an-id'));
    assert.equal(invalid.status,400);
  }finally{auth.validateSession=originalAuth;supabase.getSupabase=originalDb;}
});

test('CS status preserves a failed worker partial result without promoting failed or active jobs', async () => {
  const originalAuth = auth.validateSession;
  const originalDb = supabase.getSupabase;
  const id = '00000000-0000-4000-8000-000000000345';
  try {
    auth.validateSession = async () => ({ role: 'OWNER' });
    const route = await import(pathToFileURL(path.resolve(__dirname, '../app/api/customer-service/sync/route.js')).href);
    const cases = [
      ['FAILED', { status: 'PARTIAL' }, 'PARTIAL'],
      ['FAILED', { status: 'SUCCESS' }, 'FAILED'],
      ['FAILED', null, 'FAILED'],
      ['PENDING', { status: 'PARTIAL' }, 'PENDING'],
      ['RUNNING', { status: 'SUCCESS' }, 'RUNNING'],
      ['RETRYING', { status: 'PARTIAL' }, 'RETRYING'],
    ];
    for (const [status, result_json, expected] of cases) {
      supabase.getSupabase = () => dbWith({
        coupang_sync_requests: [{ id, request_type: 'CS_REALTIME', status, result_json }],
      });
      const response = await route.GET(new Request(`https://hub.example/api/customer-service/sync?coupangId=${id}`));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).jobs[0].status, expected, `${status}/${result_json?.status}`);
    }
  } finally {
    auth.validateSession = originalAuth;
    supabase.getSupabase = originalDb;
  }
});

test('CS status API retains partial Naver collection after a successful worker envelope',async()=>{
  const queue=require('../lib/coupang/operation-queue.js');
  const originalAuth=auth.validateSession,originalDb=supabase.getSupabase,originalSecret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const id='00000000-0000-4000-8000-000000000234';
  try{
    process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-cs-status-test-secret';
    auth.validateSession=async()=>({role:'OWNER'});
    supabase.getSupabase=()=>dbWith({coupang_operation_requests:[{id,operation_type:'NAVER_COMMERCE_CS_SYNC',target_type:'CHANNEL',target_id:'SMARTSTORE',status:'SUCCESS',executed_at:'2026-09-07T10:00:00Z',result_json:queue.seal({naverCustomerService:{status:'PARTIAL',private:'never-public'}})}]});
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/customer-service/sync/route.js')).href);
    const response=await route.GET(new Request(`https://hub.example/api/customer-service/sync?naverId=${id}`));
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(payload.jobs,[{platform:'NAVER',id,status:'PARTIAL',finishedAt:'2026-09-07T10:00:00Z'}]);
    assert.equal(JSON.stringify(payload).includes('never-public'),false);
  }finally{
    auth.validateSession=originalAuth;supabase.getSupabase=originalDb;
    if(originalSecret===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalSecret;
  }
});
