'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const auth=require('../lib/dashboard-auth.js');
const supabase=require('../lib/cafe24/supabase.js');
const syncModule=require('../lib/automation/sync-all.js');
const runnerModule=require('../lib/automation/job-runner.js');
const executionGuard=require('../lib/infrastructure/execution-route-guard.js');

function valueAt(row,key){
  if(key==='metadata->>kind')return row.metadata?.kind;
  if(key==='metadata->>scopeHash')return row.metadata?.scopeHash;
  return row[key];
}
function fakeDb(seed={}){
  const tables=Object.fromEntries(Object.entries(seed).map(([key,rows])=>[key,rows.map(row=>({...row}))]));
  const calls=[];let sequence=0;
  return {tables,calls,from(table){
    const rows=tables[table]||(tables[table]=[]);const filters=[];let order=null,limit=null,mode='select',payload=null;
    const query={
      select(){calls.push({table,op:'select'});return query;},eq(key,value){filters.push(row=>valueAt(row,key)===value);return query;},
      in(key,values){filters.push(row=>values.includes(valueAt(row,key)));return query;},
      gt(key,value){filters.push(row=>new Date(valueAt(row,key)).getTime()>new Date(value).getTime());return query;},
      lt(key,value){filters.push(row=>new Date(valueAt(row,key)).getTime()<new Date(value).getTime());return query;},
      order(key,options={}){order={key,ascending:Boolean(options.ascending)};return query;},limit(value){limit=value;return query;},
      insert(value){mode='insert';payload=value;calls.push({table,op:'insert',value});return query;},
      update(value){mode='update';payload=value;calls.push({table,op:'update',value});return query;},
      async maybeSingle(){let found=rows.filter(row=>filters.every(filter=>filter(row)));if(order)found.sort((a,b)=>(new Date(valueAt(a,order.key)).getTime()-new Date(valueAt(b,order.key)).getTime())*(order.ascending?1:-1));if(limit!==null)found=found.slice(0,limit);if(mode==='update'){for(const row of found)Object.assign(row,payload);}return {data:found[0]||null,error:null};},
      async single(){if(mode==='insert'){const row={id:`row-${++sequence}`,...payload};rows.push(row);return {data:row,error:null};}return query.maybeSingle();},
      then(resolve,reject){return query.maybeSingle().then(resolve,reject);}
    };return query;
  }};
}
function privateResponse(response){assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');}
function postRequest(body,{origin='https://hub.example',headers={}}={}){
  return new Request('https://hub.example/api/system/measurement/ga4',{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
}
function googleFetch({failureStatus=null}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,options={})=>{
    calls.push(String(url));
    if(String(url).includes('oauth2.googleapis.com'))return {ok:true,status:200,json:async()=>({access_token:'private-token'})};
    if(failureStatus)return {ok:false,status:failureStatus,json:async()=>({error:{message:'raw provider cron failure'}})};
    const body=JSON.parse(options.body);const transaction=body.dimensions.some(item=>item.name==='transactionId');
    return {ok:true,status:200,json:async()=>transaction?{
      dimensionHeaders:[{name:'eventName'},{name:'transactionId'}],metricHeaders:[{name:'eventCount'}],rows:[],rowCount:0,metadata:{timeZone:'Asia/Seoul',currencyCode:'KRW'}
    }:{dimensionHeaders:[{name:'eventName'}],metricHeaders:[{name:'eventCount'},{name:'totalUsers'},{name:'grossPurchaseRevenue'},{name:'refundAmount'}],rows:[],rowCount:0,metadata:{timeZone:'Asia/Seoul',currencyCode:'KRW'}}};
  }};
}

test('GA4 measurement API enforces owner, origin and exact read-only inputs with real service',async t=>{
  const original={db:supabase.getSupabase,fetch:global.fetch,secret:process.env.DASHBOARD_SESSION_SECRET,site:process.env.HUB_OWNED_SITE_URL,property:process.env.GOOGLE_GA4_PROPERTY_ID,email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,enabled:process.env.GOOGLE_GA4_ENABLED};
  process.env.DASHBOARD_SESSION_SECRET='ga4-api-test-session-secret';
  delete process.env.HUB_OWNED_SITE_URL;delete process.env.GOOGLE_GA4_PROPERTY_ID;delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;delete process.env.GOOGLE_GA4_ENABLED;
  const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
  const ownerToken=auth.createSessionToken({sessionId:'owner-session',userId:'owner-user',username:'owner',role:'OWNER',expiresAt});
  const viewerToken=auth.createSessionToken({sessionId:'viewer-session',userId:'viewer-user',username:'viewer',role:'VIEWER',expiresAt});
  const db=fakeDb({dashboard_sessions:[
    {id:'owner-session',user_id:'owner-user',username:'owner',display_name:'Owner',role:'OWNER',expires_at:expiresAt,revoked_at:null,last_seen_at:new Date().toISOString(),token_hash:auth.tokenHash(ownerToken)},
    {id:'viewer-session',user_id:'viewer-user',username:'viewer',display_name:'Viewer',role:'VIEWER',expires_at:expiresAt,revoked_at:null,last_seen_at:new Date().toISOString(),token_hash:auth.tokenHash(viewerToken)}
  ]});
  supabase.getSupabase=()=>db;
  t.after(()=>{
    supabase.getSupabase=original.db;global.fetch=original.fetch;
    for(const [key,value] of [['DASHBOARD_SESSION_SECRET',original.secret],['HUB_OWNED_SITE_URL',original.site],['GOOGLE_GA4_PROPERTY_ID',original.property],['GOOGLE_SERVICE_ACCOUNT_EMAIL',original.email],['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',original.key],['GOOGLE_GA4_ENABLED',original.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  const routePath=path.resolve(__dirname,'../app/api/system/measurement/ga4/route.js');
  const route=await import(`${pathToFileURL(routePath).href}?test=${Date.now()}`);
  const cookie=token=>({cookie:`${auth.COOKIE_NAME}=${token}`});
  const denied=await route.GET(new Request('https://hub.example/api/system/measurement/ga4'));assert.equal(denied.status,401);privateResponse(denied);
  const forbidden=await route.GET(new Request('https://hub.example/api/system/measurement/ga4',{headers:cookie(viewerToken)}));assert.equal(forbidden.status,403);privateResponse(forbidden);
  const setup=await route.GET(new Request('https://hub.example/api/system/measurement/ga4',{headers:cookie(ownerToken)}));assert.equal(setup.status,200);privateResponse(setup);assert.equal((await setup.json()).measurement.status,'SETUP_REQUIRED');
  assert.deepEqual([...new Set(db.calls.map(call=>call.table))],['dashboard_sessions']);
  const badQuery=await route.GET(new Request('https://hub.example/api/system/measurement/ga4?propertyId=private',{headers:cookie(ownerToken)}));assert.equal(badQuery.status,400);privateResponse(badQuery);
  for(const [request,status] of [
    [postRequest({action:'REFRESH'},{origin:'https://evil.example',headers:cookie(ownerToken)}),403],
    [postRequest({action:'REFRESH',propertyId:'private'},{headers:cookie(ownerToken)}),400],
    [postRequest({action:'OTHER'},{headers:cookie(ownerToken)}),400],
    [postRequest('{',{headers:cookie(ownerToken)}),400],
    [postRequest({action:'REFRESH'},{headers:{...cookie(ownerToken),'sec-fetch-site':'cross-site'}}),403],
    [postRequest({action:'REFRESH'},{headers:{...cookie(ownerToken),'content-length':'2048'}}),413]
  ]){const response=await route.POST(request);assert.equal(response.status,status);privateResponse(response);}

  const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
  process.env.HUB_OWNED_SITE_URL='https://shop.example.com';process.env.GOOGLE_GA4_PROPERTY_ID='123456';process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL='reader@example.test';process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=privateKey;
  const google=googleFetch();global.fetch=google.fetchImpl;
  const refreshed=await route.POST(postRequest({action:'REFRESH'},{headers:cookie(ownerToken)}));
  assert.equal(refreshed.status,200);privateResponse(refreshed);
  const body=await refreshed.json();assert.equal(body.ok,true);assert.equal(body.measurement.status,'NO_DATA');
  assert.equal(google.calls.length,3);assert.equal(db.tables.owned_site_api_snapshots.length,1);
  assert.doesNotMatch(JSON.stringify(body),/private-token|privateKey|propertyId/);
});

test('daily cron runs GA4 independently and keeps existing jobs when GA4 fails',async t=>{
  const original={db:supabase.getSupabase,fetch:global.fetch,guard:executionGuard.runGuardedRoute,sync:syncModule.syncAllPlatforms,job:runnerModule.runJob,secret:process.env.CRON_SECRET,site:process.env.HUB_OWNED_SITE_URL,property:process.env.GOOGLE_GA4_PROPERTY_ID,email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,enabled:process.env.GOOGLE_GA4_ENABLED};
  const db=fakeDb();let syncCalls=0,jobCalls=0;
  supabase.getSupabase=()=>db;
  executionGuard.runGuardedRoute=async(_options,work)=>work();
  syncModule.syncAllPlatforms=async()=>{syncCalls+=1;return {status:'SUCCESS',jobs:[]};};
  runnerModule.runJob=async()=>{jobCalls+=1;return {status:'SUCCESS'};};
  process.env.CRON_SECRET='cron-test-secret';
  delete process.env.HUB_OWNED_SITE_URL;delete process.env.GOOGLE_GA4_PROPERTY_ID;delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;delete process.env.GOOGLE_GA4_ENABLED;
  t.after(()=>{
    supabase.getSupabase=original.db;global.fetch=original.fetch;executionGuard.runGuardedRoute=original.guard;syncModule.syncAllPlatforms=original.sync;runnerModule.runJob=original.job;
    for(const [key,value] of [['CRON_SECRET',original.secret],['HUB_OWNED_SITE_URL',original.site],['GOOGLE_GA4_PROPERTY_ID',original.property],['GOOGLE_SERVICE_ACCOUNT_EMAIL',original.email],['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',original.key],['GOOGLE_GA4_ENABLED',original.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  const routePath=path.resolve(__dirname,'../app/api/cron/daily-sync/route.js');
  const route=await import(`${pathToFileURL(routePath).href}?ga4=${Date.now()}`);
  let unexpectedGoogleCalls=0;global.fetch=async()=>{unexpectedGoogleCalls+=1;throw new Error('Google must not run without config');};
  const skipped=await route.GET(new Request('https://hub.example/api/cron/daily-sync',{headers:{authorization:'Bearer cron-test-secret'}}));
  const skippedBody=await skipped.json();const ga4Skipped=skippedBody.jobs.find(job=>job.name==='GA4_ECOMMERCE');
  assert.equal(ga4Skipped.ok,true);assert.equal(ga4Skipped.skipped,true);assert.equal(ga4Skipped.data.status,'SETUP_REQUIRED');assert.equal(unexpectedGoogleCalls,0);

  process.env.HUB_OWNED_SITE_URL='https://shop.example.com';process.env.GOOGLE_GA4_PROPERTY_ID='654321';process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL='reader@example.test';
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
  global.fetch=googleFetch().fetchImpl;
  const success=await route.GET(new Request('https://hub.example/api/cron/daily-sync',{headers:{authorization:'Bearer cron-test-secret'}}));
  const successBody=await success.json();
  const ga4Success=successBody.jobs.find(job=>job.name==='GA4_ECOMMERCE');
  assert.equal(ga4Success.ok,true);assert.equal(ga4Success.data.status,'NO_DATA');
  assert.equal(db.tables.owned_site_api_snapshots.length,1);
  assert.equal(syncCalls,2);assert.equal(jobCalls,6);

  process.env.GOOGLE_GA4_PROPERTY_ID='654322';
  global.fetch=googleFetch({failureStatus:500}).fetchImpl;
  const failure=await route.GET(new Request('https://hub.example/api/cron/daily-sync',{headers:{authorization:'Bearer cron-test-secret'}}));
  const failureBody=await failure.json();
  const ga4Failure=failureBody.jobs.find(job=>job.name==='GA4_ECOMMERCE');
  assert.equal(failure.status,207);assert.equal(ga4Failure.ok,false);assert.equal(ga4Failure.data.status,'FAILED');
  assert.equal(syncCalls,3);assert.equal(jobCalls,9);
  assert.equal(failureBody.jobs.filter(job=>job.name!=='GA4_ECOMMERCE').every(job=>job.ok),true);
  assert.doesNotMatch(JSON.stringify(failureBody),/raw provider cron failure|private-token/);
});
