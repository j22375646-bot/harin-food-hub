'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const measurement=require('../lib/measurement/ga4-service.js');
const requestGuard=require('../lib/provider-operations/request-guard.js');

const configuredEnv=Object.freeze({
  HUB_OWNED_SITE_URL:'https://Shop.Example.com/path',GOOGLE_GA4_PROPERTY_ID:'123456',
  GOOGLE_SERVICE_ACCOUNT_EMAIL:'reader@example.test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'private-key'
});
const scopeHash=crypto.createHash('sha256').update('123456\0shop.example.com').digest('hex');
const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const liveEnv={...configuredEnv,GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey};

function report(overrides={}){
  return {
    version:'ga4-ecommerce-v1',source:'GA4_DATA_API',host:'shop.example.com',fetchedAt:'2026-08-27T00:00:00.000Z',
    window:{startDate:'7daysAgo',endDate:'yesterday',timeZone:'Asia/Seoul'},currencyCode:'KRW',
    coverage:{events:'COMPLETE',transactions:'COMPLETE',reasons:[]},status:'OBSERVED',
    stages:[{eventName:'purchase',label:'구매',eventCount:2,users:2,observed:true}],
    money:{grossPurchaseRevenue:20000,refundAmount:0},
    diagnostics:{missingPurchaseIdEvents:0,missingRefundIdEvents:0,duplicatePurchaseIds:0,repeatedRefundIds:0},
    trackingVerification:'VERIFY_REQUIRED',notes:['측정 메모'],...overrides
  };
}

function valueAt(row,key){
  if(key==='metadata->>kind')return row.metadata?.kind;
  if(key==='metadata->>scopeHash')return row.metadata?.scopeHash;
  return row[key];
}

function fakeDb(seed={},options={}){
  const tables=Object.fromEntries(Object.entries(seed).map(([key,rows])=>[key,rows.map(row=>({...row}))]));
  const calls=[];let sequence=0;
  return {tables,calls,from(table){
    const rows=tables[table]||(tables[table]=[]);const filters=[];let order=null,limit=null,mode='select',payload=null;
    const query={
      select(fields){calls.push({table,op:'select',fields});return query;},
      eq(key,value){calls.push({table,op:'eq',key,value});filters.push(row=>valueAt(row,key)===value);return query;},
      in(key,values){calls.push({table,op:'in',key,values});filters.push(row=>values.includes(valueAt(row,key)));return query;},
      gt(key,value){filters.push(row=>new Date(valueAt(row,key)).getTime()>new Date(value).getTime());return query;},
      lt(key,value){calls.push({table,op:'lt',key,value});filters.push(row=>new Date(valueAt(row,key)).getTime()<new Date(value).getTime());return query;},
      order(key,options={}){calls.push({table,op:'order',key,options});order={key,ascending:Boolean(options.ascending)};return query;},
      limit(value){calls.push({table,op:'limit',value});limit=value;return query;},
      insert(value){mode='insert';payload=value;calls.push({table,op:'insert',value});return query;},
      update(value){mode='update';payload=value;calls.push({table,op:'update',value});return query;},
      async maybeSingle(){
        if(mode==='update'&&payload?.error_code==='GA4_STALE_READ_LEASE'&&options.failStaleRecovery)return {data:null,error:{message:'raw ledger failure'}};
        let found=rows.filter(row=>filters.every(filter=>filter(row)));
        if(order)found.sort((a,b)=>(new Date(valueAt(a,order.key)).getTime()-new Date(valueAt(b,order.key)).getTime())*(order.ascending?1:-1));
        if(limit!==null)found=found.slice(0,limit);
        if(mode==='update'){for(const row of found)Object.assign(row,payload);return {data:found[0]||null,error:null};}
        return {data:found[0]||null,error:null};
      },
      async single(){
        if(mode==='insert'){
          if(table==='owned_site_api_snapshots'&&options.failSnapshotInsert)return {data:null,error:{message:'raw snapshot database failure'}};
          const row={id:`row-${++sequence}`,...payload};rows.push(row);return {data:row,error:null};
        }
        return query.maybeSingle();
      },
      then(resolve,reject){return query.maybeSingle().then(resolve,reject);}
    };
    return query;
  }};
}

function eventPayload({partial=false}={}){
  return {
    dimensionHeaders:[{name:'eventName'}],metricHeaders:[{name:'eventCount'},{name:'totalUsers'},{name:'grossPurchaseRevenue'},{name:'refundAmount'}],
    rows:[{dimensionValues:[{value:'purchase'}],metricValues:['1','1','12000','0'].map(value=>({value}))}],rowCount:1,
    metadata:{timeZone:'Asia/Seoul',currencyCode:'KRW',...(partial?{subjectToThresholding:true}:{})}
  };
}
function transactionPayload(){
  return {
    dimensionHeaders:[{name:'eventName'},{name:'transactionId'}],metricHeaders:[{name:'eventCount'}],
    rows:[{dimensionValues:[{value:'purchase'},{value:'private-order-id'}],metricValues:[{value:'1'}]}],rowCount:1,
    metadata:{timeZone:'Asia/Seoul',currencyCode:'KRW'}
  };
}
function googleFixture({partial=false,failCode=null}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('oauth2.googleapis.com'))return {ok:true,status:200,json:async()=>({access_token:'private-access-token'})};
    if(failCode)return {ok:false,status:failCode,json:async()=>({error:{message:'raw private provider body'}})};
    const body=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>body.dimensions.some(item=>item.name==='transactionId')?transactionPayload():eventPayload({partial})};
  }};
}

test('GA4 measurement setup and kill-switch gates run before storage',async()=>{
  let reads=0;
  const db={from(){reads+=1;throw new Error('storage must not run');}};
  const setup=await measurement.getState({db,env:{},now:new Date('2026-08-27T00:00:00Z')});
  assert.equal(setup.status,'SETUP_REQUIRED');
  assert.deepEqual(setup.missingFields,['자사몰 주소','GA4 속성 ID','서비스 계정 이메일','서비스 계정 비밀키']);
  assert.equal(setup.canRefresh,false);
  assert.equal(setup.automation.status,'SETUP_REQUIRED');
  const locked=await measurement.getState({db,env:{GOOGLE_GA4_ENABLED:'false'},now:new Date('2026-08-27T00:00:00Z')});
  assert.equal(locked.status,'LOCKED');
  assert.equal(locked.automation.status,'LOCKED');
  assert.equal(reads,0);
});

test('configured state scopes attempts and preserves the last usable report after failure',async()=>{
  const good=report({transactionId:'must-not-leak'});
  const db=fakeDb({owned_site_api_snapshots:[
    {id:'good',provider:'GA4',status:'SUCCESS',fetched_at:'2026-08-27T00:00:00.000Z',error_code:null,error_message:null,metric_summary:{ecommerce:good},metadata:{kind:'GA4_ECOMMERCE_V1',scopeHash}},
    {id:'failed',provider:'GA4',status:'FAILED',fetched_at:'2026-08-27T01:00:00.000Z',error_code:'GA4_AUTH_FAILED',error_message:'provider secret payload',metric_summary:{},metadata:{kind:'GA4_ECOMMERCE_V1',scopeHash}},
    {id:'other',provider:'GA4',status:'SUCCESS',fetched_at:'2026-08-27T02:00:00.000Z',metric_summary:{ecommerce:report({host:'other.example'})},metadata:{kind:'GA4_ECOMMERCE_V1',scopeHash:'other-scope'}}
  ]});
  const state=await measurement.getState({db,env:configuredEnv,now:new Date('2026-08-27T02:00:00Z')});
  assert.equal(state.status,'FAILED');
  assert.equal(state.previousSuccess,true);
  assert.equal(state.lastAttemptAt,'2026-08-27T01:00:00.000Z');
  assert.equal(state.lastSuccessAt,'2026-08-27T00:00:00.000Z');
  assert.equal(state.report.host,'shop.example.com');
  assert.doesNotMatch(JSON.stringify(state),/transactionId|provider secret payload/);
  assert.match(state.error,/권한/);
  const snapshotCalls=db.calls.filter(call=>call.table==='owned_site_api_snapshots');
  assert.equal(snapshotCalls.filter(call=>call.op==='limit'&&call.value===1).length,2);
  assert.equal(snapshotCalls.filter(call=>call.op==='eq'&&call.key==='metadata->>scopeHash'&&call.value===scopeHash).length,2);
});

test('invalid configured scope and storage failures stay explicit before provider I/O',async()=>{
  let reads=0;
  const invalid=await measurement.getState({db:{from(){reads+=1;}},env:{...configuredEnv,GOOGLE_GA4_PROPERTY_ID:'property-secret'},now:new Date('2026-08-27T00:00:00Z')});
  assert.equal(invalid.status,'SETUP_REQUIRED');
  assert.deepEqual(invalid.missingFields,['GA4 속성 ID']);
  assert.equal(reads,0);
  const failed=await measurement.getState({db:{from(){throw new Error('database credential raw error');}},env:configuredEnv,now:new Date('2026-08-27T00:00:00Z')});
  assert.equal(failed.status,'FAILED');
  assert.match(failed.error,/저장된 측정 자료/);
  assert.doesNotMatch(JSON.stringify(failed),/credential raw/);
});

test('refresh collects through the real adapter and saves one privacy-safe scoped snapshot',async()=>{
  const db=fakeDb();const google=googleFixture();
  const state=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T00:00:00Z'),fetchImpl:google.fetchImpl});
  assert.equal(state.status,'OBSERVED');
  assert.equal(state.report.money.grossPurchaseRevenue,12000);
  assert.equal(state.runtime.kind,'LIVE');
  assert.equal(google.calls.length,3);
  const snapshots=db.tables.owned_site_api_snapshots;
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0].status,'SUCCESS');
  assert.deepEqual(snapshots[0].metadata,{kind:'GA4_ECOMMERCE_V1',scopeHash,calculationVersion:'ga4-ecommerce-v1',read_only:true,contains_customer_data:false});
  assert.deepEqual(Object.keys(snapshots[0].metric_summary),['ecommerce']);
  assert.doesNotMatch(JSON.stringify({state,snapshots}),/private-order-id|private-access-token/);
});

test('refresh stores partial reports as SUCCESS and preserves the last success on provider failure',async()=>{
  const db=fakeDb();
  const partial=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T00:00:00Z'),fetchImpl:googleFixture({partial:true}).fetchImpl});
  assert.equal(partial.status,'PARTIAL');
  assert.equal(db.tables.owned_site_api_snapshots[0].status,'SUCCESS');
  const failed=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T00:16:00Z'),fetchImpl:googleFixture({failCode:403}).fetchImpl});
  assert.equal(failed.status,'FAILED');
  assert.equal(failed.previousSuccess,true);
  assert.equal(failed.report.status,'PARTIAL');
  assert.match(failed.error,/권한/);
  assert.equal(db.tables.owned_site_api_snapshots.filter(row=>row.status==='FAILED').length,1);
  assert.doesNotMatch(JSON.stringify({failed,rows:db.tables.owned_site_api_snapshots}),/raw private provider body|private-access-token/);
});

test('refresh recovers only its stale scoped read lease and leaves recent or other-scope reads active',async()=>{
  const now=new Date('2026-08-27T00:00:00Z');
  const input={kind:'GA4_ECOMMERCE_V1',scopeHash,date:'2026-08-27'};
  const hash=requestGuard.requestHash('GA4',input);
  const otherHash=requestGuard.requestHash('GA4',{...input,scopeHash:'other'});
  const db=fakeDb({provider_request_runs:[
    {id:'stale',provider:'GA4',request_hash:hash,status:'RUNNING',started_at:'2026-08-26T23:57:00.000Z'},
    {id:'other',provider:'GA4',request_hash:otherHash,status:'RUNNING',started_at:'2026-08-26T20:00:00.000Z'}
  ]});
  const google=googleFixture();
  const recovered=await measurement.refresh({db,env:liveEnv,now,fetchImpl:google.fetchImpl});
  assert.equal(recovered.status,'OBSERVED');
  assert.equal(db.tables.provider_request_runs.find(row=>row.id==='stale').status,'FAILED');
  assert.equal(db.tables.provider_request_runs.find(row=>row.id==='stale').error_code,'GA4_STALE_READ_LEASE');
  assert.equal(db.tables.provider_request_runs.find(row=>row.id==='other').status,'RUNNING');
  const recoveryUpdate=db.calls.find(call=>call.op==='update'&&call.value.error_code==='GA4_STALE_READ_LEASE');
  assert.ok(recoveryUpdate);
  for(const [key,value] of [['provider','GA4'],['request_hash',hash],['id','stale'],['status','RUNNING'],['started_at','2026-08-26T23:57:00.000Z']]){
    assert.ok(db.calls.some(call=>call.op==='eq'&&call.key===key&&call.value===value));
  }

  const activeDb=fakeDb({provider_request_runs:[{id:'active',provider:'GA4',request_hash:hash,status:'RUNNING',started_at:'2026-08-26T23:59:00.000Z'}]});
  const unused=googleFixture();
  const active=await measurement.refresh({db:activeDb,env:liveEnv,now,fetchImpl:unused.fetchImpl});
  assert.equal(active.status,'IN_FLIGHT');
  assert.equal(active.runtime.kind,'IN_FLIGHT');
  assert.equal(activeDb.tables.provider_request_runs.find(row=>row.id==='active').status,'RUNNING');
  assert.equal(unused.calls.length,0);
});

test('stale lease ledger failure remains a warning and never claims recovery',async()=>{
  const now=new Date('2026-08-27T00:00:00Z');
  const hash=requestGuard.requestHash('GA4',{kind:'GA4_ECOMMERCE_V1',scopeHash,date:'2026-08-27'});
  const db=fakeDb({provider_request_runs:[{id:'stale',provider:'GA4',request_hash:hash,status:'RUNNING',started_at:'2026-08-26T23:57:00.000Z'}]},{failStaleRecovery:true});
  const google=googleFixture();
  const state=await measurement.refresh({db,env:liveEnv,now,fetchImpl:google.fetchImpl});
  assert.equal(state.status,'IN_FLIGHT');
  assert.equal(state.runtime.kind,'IN_FLIGHT');
  assert.match(state.runtime.warning,/실행 기록/);
  assert.equal(db.tables.provider_request_runs.find(row=>row.id==='stale').status,'RUNNING');
  assert.equal(google.calls.length,0);
  assert.doesNotMatch(JSON.stringify(state),/raw ledger failure/);
});

test('fresh cache and process-local concurrency avoid duplicate GA4 collection without changing source time',async()=>{
  const db=fakeDb();const google=googleFixture();
  const first=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T00:00:00Z'),fetchImpl:google.fetchImpl});
  const second=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T00:05:00Z'),fetchImpl:google.fetchImpl});
  assert.equal(second.runtime.kind,'CACHE_HIT');
  assert.equal(second.report.fetchedAt,first.report.fetchedAt);
  assert.equal(db.tables.owned_site_api_snapshots.length,1);
  assert.equal(google.calls.length,3);

  const concurrentDb=fakeDb();let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const delayed=googleFixture();const original=delayed.fetchImpl;
  delayed.fetchImpl=async(...args)=>{if(delayed.calls.length===0)await gate;return original(...args);};
  const a=measurement.refresh({db:concurrentDb,env:liveEnv,now:new Date('2026-08-28T00:00:00Z'),fetchImpl:delayed.fetchImpl});
  const b=measurement.refresh({db:concurrentDb,env:liveEnv,now:new Date('2026-08-28T00:00:00Z'),fetchImpl:delayed.fetchImpl});
  release();
  const [left,right]=await Promise.all([a,b]);
  assert.equal(left.report.fetchedAt,right.report.fetchedAt);
  assert.equal(concurrentDb.tables.owned_site_api_snapshots.length,1);
  assert.equal(delayed.calls.length,3);
});

test('scheduled collection skips safely before I/O and exposes configured partial or failed states',async()=>{
  let dbCalls=0,httpCalls=0;
  const skipped=await measurement.runScheduled({db:{from(){dbCalls+=1;}},env:{},fetchImpl:async()=>{httpCalls+=1;}});
  assert.equal(skipped.skipped,true);
  assert.equal(skipped.status,'SETUP_REQUIRED');
  assert.match(skipped.reason,/설정/);
  assert.equal(dbCalls,0);assert.equal(httpCalls,0);
  const partial=await measurement.runScheduled({db:fakeDb(),env:liveEnv,now:new Date('2026-08-29T00:00:00Z'),fetchImpl:googleFixture({partial:true}).fetchImpl});
  assert.equal(partial.status,'PARTIAL');
  assert.equal(partial.skipped,undefined);
  const failed=await measurement.runScheduled({db:fakeDb(),env:liveEnv,now:new Date('2026-08-30T00:00:00Z'),fetchImpl:googleFixture({failCode:500}).fetchImpl});
  assert.equal(failed.status,'FAILED');
});

test('snapshot write failure remains FAILED and preserves an older report without leaking database errors',async()=>{
  const prior=report({fetchedAt:'2026-08-26T00:00:00.000Z'});
  const db=fakeDb({owned_site_api_snapshots:[{provider:'GA4',status:'SUCCESS',fetched_at:'2026-08-26T00:00:00.000Z',metric_summary:{ecommerce:prior},metadata:{kind:'GA4_ECOMMERCE_V1',scopeHash}}]},{failSnapshotInsert:true});
  const state=await measurement.refresh({db,env:liveEnv,now:new Date('2026-08-27T02:00:00Z'),fetchImpl:googleFixture({failCode:500}).fetchImpl});
  assert.equal(state.status,'FAILED');
  assert.equal(state.previousSuccess,true);
  assert.equal(state.report.fetchedAt,'2026-08-26T00:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(state),/raw snapshot database failure/);
});

test('a usable report older than 26 hours is explicitly stale',async()=>{
  const old=report({fetchedAt:'2026-08-25T23:59:59.000Z'});
  const db=fakeDb({owned_site_api_snapshots:[{provider:'GA4',status:'SUCCESS',fetched_at:'2026-08-25T23:59:59.000Z',metric_summary:{ecommerce:old},metadata:{kind:'GA4_ECOMMERCE_V1',scopeHash}}]});
  const state=await measurement.getState({db,env:configuredEnv,now:new Date('2026-08-27T02:00:00Z')});
  assert.equal(state.status,'STALE');
  assert.equal(state.report.status,'OBSERVED');
});

test('configured storage acquisition failure becomes a safe failed state',async()=>{
  const state=await measurement.runScheduled({db:()=>{throw new Error('raw database password failure');},env:liveEnv,now:new Date('2026-08-31T00:00:00Z'),fetchImpl:async()=>{throw new Error('must not call Google');}});
  assert.equal(state.status,'FAILED');
  assert.equal(state.skipped,undefined);
  assert.match(state.error,/저장된 측정 자료/);
  assert.doesNotMatch(JSON.stringify(state),/password/);
});
