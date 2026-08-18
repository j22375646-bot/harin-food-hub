const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const guard=require('../lib/provider-operations/request-guard.js');
const centerModule=require('../lib/provider-operations/center.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
function fakeDb(seed=[]){
  const rows=seed.map(row=>({...row}));let sequence=rows.length;
  const db={rows,from(){return {
    select(){const filters=[];let ordered=null,limited=null;const query={
      eq(key,value){filters.push(row=>row[key]===value);return query;},
      in(key,values){filters.push(row=>values.includes(row[key]));return query;},
      gt(key,value){filters.push(row=>new Date(row[key]).getTime()>new Date(value).getTime());return query;},
      order(key,{ascending=false}={}){ordered={key,ascending};return query;},
      limit(value){limited=value;return query;},
      async maybeSingle(){let found=rows.filter(row=>filters.every(filter=>filter(row)));if(ordered)found.sort((a,b)=>(new Date(a[ordered.key]).getTime()-new Date(b[ordered.key]).getTime())*(ordered.ascending?1:-1));if(limited!=null)found=found.slice(0,limited);return {data:found[0]||null,error:null};}
    };return query;},
    insert(value){return {select(){return {async single(){const row={id:`run-${++sequence}`,created_at:value.created_at||value.started_at||new Date().toISOString(),...value};if(row.status==='RUNNING'&&rows.some(item=>item.provider===row.provider&&item.request_hash===row.request_hash&&item.status==='RUNNING'))return {data:null,error:{code:'23505'}};rows.push(row);return {data:row,error:null};}};}};},
    update(value){return {async eq(key,target){const row=rows.find(item=>item[key]===target);if(row)Object.assign(row,value);return {data:row||null,error:null};}};}
  };}};return db;
}

test('provider guard reuses a fresh cache without a second external call',async()=>{
  const db=fakeDb();let calls=0;const now=new Date('2026-08-18T00:00:00Z');
  const first=await guard.protectedRead({db,provider:'PAGESPEED',requestInput:{url:'store'},now,execute:async()=>{calls++;return {provider:'PAGESPEED',status:'SUCCESS',count:1};}});
  const second=await guard.protectedRead({db,provider:'PAGESPEED',requestInput:{url:'store'},now:new Date('2026-08-18T00:01:00Z'),execute:async()=>{calls++;throw new Error('must not run');}});
  assert.equal(first.runtime.kind,'LIVE');assert.equal(second.runtime.kind,'CACHE_HIT');assert.equal(calls,1);assert.ok(db.rows.some(row=>row.status==='CACHED'));
});

test('provider guard suppresses a duplicate in-flight request',async()=>{
  const hash=guard.requestHash('GA4',{probe:'connection'}),db=fakeDb([{id:'active',provider:'GA4',request_hash:hash,status:'RUNNING',started_at:'2026-08-18T00:00:00Z'}]);let calls=0;
  const result=await guard.protectedRead({db,provider:'GA4',requestInput:{probe:'connection'},now:new Date('2026-08-18T00:01:00Z'),execute:async()=>{calls++;return {};}});
  assert.equal(result.runtime.deduplicated,true);assert.equal(calls,0);assert.ok(db.rows.some(row=>row.status==='DEDUPLICATED'));
});

test('provider guard still performs an isolated read when the runtime ledger cannot return an inserted id',async()=>{
  const base=fakeDb();let calls=0;const db={rows:base.rows,from(table){const query=base.from(table);if(table==='provider_request_runs')query.insert=()=>({select:()=>({single:async()=>({data:null,error:null})})});return query;}};
  const result=await guard.protectedRead({db,provider:'TELEGRAM_BOT',requestInput:{probe:'health'},cacheResponse:false,now:new Date('2026-08-18T00:00:00Z'),execute:async()=>{calls++;return {provider:'TELEGRAM_BOT',status:'SUCCESS'};}});
  assert.equal(calls,1);assert.equal(result.status,'SUCCESS');assert.equal(result.runtime.kind,'LIVE');assert.equal(result.runtime.runId,null);
});

test('provider kill switch is checked before a cached response',async()=>{
  const hash=guard.requestHash('DEEPL',{probe:'usage'}),db=fakeDb([{id:'cached',provider:'DEEPL',request_hash:hash,status:'SUCCESS',response_summary:{provider:'DEEPL',status:'SUCCESS'},started_at:'2026-08-18T00:00:00Z',finished_at:'2026-08-18T00:00:00Z',expires_at:'2026-08-18T01:00:00Z'}]);
  await assert.rejects(()=>guard.protectedRead({db,provider:'DEEPL',requestInput:{probe:'usage'},killSwitchEnabled:false,now:new Date('2026-08-18T00:10:00Z'),execute:async()=>({})}),error=>error.code==='PROVIDER_DISABLED'&&error.status===423);
  assert.equal(db.rows.filter(row=>row.status==='CACHED').length,0);
});

test('provider guard returns an explicit stale fallback instead of zero',async()=>{
  const db=fakeDb();await guard.protectedRead({db,provider:'CRUX',requestInput:{origin:'store'},now:new Date('2026-08-18T00:00:00Z'),ttlMs:1000,execute:async()=>({provider:'CRUX',status:'SUCCESS',count:7})});
  const result=await guard.protectedRead({db,provider:'CRUX',requestInput:{origin:'store'},now:new Date('2026-08-18T00:02:00Z'),ttlMs:1000,execute:async()=>{const error=new Error('quota');error.code='QUOTA';throw error;}});
  assert.equal(result.status,'STALE');assert.equal(result.previousSuccess,true);assert.equal(result.count,7);assert.equal(result.runtime.staleFallback,true);
});

test('provider operations center keeps providers separated and honest',()=>{
  const now=new Date('2026-08-18T00:10:00Z');const center=centerModule.buildProviderOperationsCenter({now,env:{},runtimeRuns:[],naverApiCenter:{services:[{key:'commerce',label:'네이버 커머스',subtitle:'주문',status:'SETUP_REQUIRED'}]},ownedSiteCenter:{services:[]},shippingReferenceCenter:{services:[]},operationsHealthCenter:{services:[]},optionalProviderCenter:{services:[]},sources:[],contextSnapshots:[]});
  assert.equal(center.phase,'20-6');assert.ok(center.services.some(item=>item.provider==='NAVER_COMMERCE'));assert.ok(center.services.some(item=>item.provider==='PUBMED'));assert.ok(center.services.some(item=>item.provider==='KAMIS_PRICE'));assert.equal(center.services.find(item=>item.provider==='KAMIS_PRICE').status,'SETUP_REQUIRED');
  assert.doesNotMatch(JSON.stringify(center),/SECRET|PRIVATE_KEY|API_KEY/i);
});

test('provider runtime route, UI and service-role-only migration exist',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'provider-runtime'}),'/data-collection/provider-runtime');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/provider-runtime/page.js')),true);
  const ui=fs.readFileSync(path.join(root,'app/provider-operations-center.js'),'utf8');const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260818150000_add_provider_runtime_requests.sql'),'utf8');
  assert.match(ui,/API 사용량·안전센터/);assert.match(ui,/providerRuntimeGroups/);assert.match(css,/@media\(max-width:760px\).*providerRuntimeRow/s);assert.match(migration,/where status='RUNNING'/);assert.match(migration,/revoke all.*public,anon,authenticated/s);assert.match(migration,/service_role/);
});
