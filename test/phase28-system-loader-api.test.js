'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const snapshotModule=require('../lib/system/phase28-snapshot.js');

function mockDb(tables){
  return {from(table){
    const query={
      select(){return query;},in(){return query;},eq(){return query;},order(){return query;},limit(){return query;},maybeSingle(){return query;},
      then(resolve){return Promise.resolve(tables[table]||{data:[],error:null}).then(resolve);}
    };
    return query;
  }};
}

test('시스템 경량 로더는 핵심 상태 표본만 읽고 실패를 0이나 정상으로 바꾸지 않는다',async()=>{
  const db=mockDb({
    sync_logs:{data:[
      {platform:'CAFE24',job_type:'ORDERS_REALTIME',status:'SUCCESS',started_at:'2026-08-29T05:00:00Z',finished_at:'2026-08-29T05:01:00Z'},
      {platform:'NAVER',job_type:'FETCH_ALL',status:'FAILED',started_at:'2026-08-29T05:02:00Z',finished_at:'2026-08-29T05:03:00Z'},
      {platform:'COUPANG',job_type:'FETCH_ALL',status:'RUNNING',started_at:'2026-08-29T05:04:00Z'}
    ],error:null},
    cafe24_oauth_tokens:{data:{token_data:{access_token:'server-secret'}},error:null},
    worker_heartbeats:{data:[{worker_id:'worker-1',last_seen_at:'2026-08-29T05:29:00Z',last_success_at:'2026-08-29T05:20:00Z',current_job_type:'FETCH_ALL'}],error:null},
    coupang_operation_requests:{data:[{id:'dead-1',operation_type:'EPOST_CONFIG_PROBE',status:'FAILED',attempt_count:3,dead_lettered_at:'2026-08-29T05:10:00Z'}],error:null},
    coupang_sync_requests:{data:[{id:'retry-1',request_type:'FETCH_ALL',status:'RETRYING',attempt_count:1,requested_at:'2026-08-29T05:15:00Z'}],error:null},
    automation_runs:{data:[{job_name:'DAILY_SYNC',status:'SUCCESS',started_at:'2026-08-29T04:30:00Z',finished_at:'2026-08-29T04:31:00Z'}],error:null}
  });
  const result=await snapshotModule.loadPhase28SystemSnapshot({db,env:{
    CAFE24_MALL_ID:'shop',NAVER_CUSTOMER_ID:'set',NAVER_API_KEY:'set',NAVER_SECRET_KEY:'set',
    NAVER_COMMERCE_CLIENT_ID:'set',NAVER_COMMERCE_CLIENT_SECRET:'set',COUPANG_VENDOR_ID:'set',COUPANG_ACCESS_KEY:'set',COUPANG_SECRET_KEY:'set',
    EPOST_API_KEY:'set',EPOST_CUSTOMER_NO:'set',EPOST_APPROVAL_NO:'set',EPOST_OFFICE_SER:'set',SUPABASE_URL:'set',SUPABASE_SERVICE_ROLE_KEY:'set'
  },now:new Date('2026-08-29T05:30:00Z')});
  assert.deepEqual(result.services.map(item=>item.id),['cafe24','naver-ads','naver-commerce','coupang','epost','supabase']);
  assert.equal(result.services.find(item=>item.id==='naver-ads').status,'FAILED');
  assert.equal(result.services.find(item=>item.id==='coupang').status,'RUNNING');
  assert.equal(result.recovery.retryWaiting,1);
  assert.equal(result.recovery.deadLetters,1);
  assert.equal(JSON.stringify(result).includes('server-secret'),false);
});

test('시스템 제공처 상세 API는 손님을 차단하고 허용된 한 건만 반환한다',async()=>{
  const auth=require('../lib/dashboard-auth.js');
  const supabase=require('../lib/cafe24/supabase.js');
  const adapter=require('../lib/ui/phase28-adapters/system.js');
  const originalValidate=auth.validateSession,originalCookie=auth.cookieValue,originalDb=supabase.getSupabase,originalLoad=snapshotModule.loadPhase28SystemSnapshot;
  try{
    auth.cookieValue=()=>'';
    auth.validateSession=async()=>null;
    const routePath=path.join(__dirname,'..','app','api','system','providers','[providerId]','route.js');
    const route=await import(`${pathToFileURL(routePath).href}?test=${Date.now()}`);
    const denied=await route.GET(new Request('https://hub.example/api/system/providers/cafe24'),{params:Promise.resolve({providerId:'cafe24'})});
    assert.equal(denied.status,401);

    auth.validateSession=async()=>({id:'owner-session',role:'OWNER'});
    supabase.getSupabase=()=>mockDb({});
    snapshotModule.loadPhase28SystemSnapshot=async({providerId})=>({generatedAt:'2026-08-29T05:30:00Z',services:[{id:providerId,status:'READY',configuration:'CONFIGURED',read:'READ_READY',write:'LOCKED',job:'IDLE',lastSuccessAt:'2026-08-29T05:20:00Z'}]});
    const response=await route.GET(new Request('https://hub.example/api/system/providers/cafe24'),{params:Promise.resolve({providerId:'cafe24'})});
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.detail.id,'cafe24');
    assert.deepEqual(Object.keys(payload.detail.axes),['configuration','read','freshness','write','job']);
    assert.equal('access_token' in payload.detail,false);

    const unknown=await route.GET(new Request('https://hub.example/api/system/providers/unknown'),{params:Promise.resolve({providerId:'unknown'})});
    assert.equal(unknown.status,404);
    assert.ok(adapter.CORE_SERVICE_IDS.includes('supabase'));
  }finally{
    auth.validateSession=originalValidate;auth.cookieValue=originalCookie;supabase.getSupabase=originalDb;snapshotModule.loadPhase28SystemSnapshot=originalLoad;
  }
});
