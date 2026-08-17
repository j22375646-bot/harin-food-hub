'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/optional-providers/config.js');
const deepl=require('../lib/optional-providers/deepl-client.js');
const readiness=require('../lib/optional-providers/readiness.js');
const routes=require('../lib/navigation/hub-routes.js');
const root=path.resolve(__dirname,'..');

test('phase 20-5 keeps every optional source dormant and cost-free by default',()=>{
  const center=readiness.buildOptionalProviderCenter({env:{},now:new Date('2026-08-18T03:00:00Z')});
  assert.deepEqual(center.services.map(item=>item.provider),['DEEPL','GOOGLE_TRENDS_ALPHA','PUBLIC_PROCUREMENT']);
  assert.deepEqual(center.services.map(item=>item.status),['NOT_NEEDED','ELIGIBILITY_REQUIRED','NOT_NEEDED']);
  assert.equal(center.summary.cost,0);
  assert.ok(center.services.every(item=>item.action===null));
});

test('DeepL API Free usage probe is read-only and stores no source text or secret',async()=>{
  let call;const result=await deepl.readUsage({config:{endpoint:'https://api-free.deepl.com',apiKey:'private-key'},fetchImpl:async(url,options)=>{call={url,options};return {ok:true,status:200,json:async()=>({character_count:1200,character_limit:500000})};}});
  assert.equal(call.url,'https://api-free.deepl.com/v2/usage');
  assert.equal(call.options.headers.Authorization,'DeepL-Auth-Key private-key');
  assert.equal(result.metricSummary.remaining_characters,498800);
  assert.doesNotMatch(JSON.stringify(result),/private-key|source_text|customer/);
});

test('keys and business flags never bypass manual probes or access gates',()=>{
  const env={DEEPL_TRANSLATION_ENABLED:'true',DEEPL_API_KEY:'secret',GOOGLE_TRENDS_ALPHA_ACCESS_CONFIRMED:'true',PUBLIC_PROCUREMENT_B2B_ACTIVE:'true',PUBLIC_PROCUREMENT_ENABLED:'true',PUBLIC_PROCUREMENT_SERVICE_KEY:'public-data-secret'};
  const center=readiness.buildOptionalProviderCenter({env});
  assert.equal(center.services.find(item=>item.provider==='DEEPL').status,'VERIFY_REQUIRED');
  assert.equal(center.services.find(item=>item.provider==='GOOGLE_TRENDS_ALPHA').status,'READ_PROBE_REQUIRED');
  assert.equal(center.services.find(item=>item.provider==='PUBLIC_PROCUREMENT').status,'READ_PROBE_REQUIRED');
  assert.equal(center.services.filter(item=>item.action).length,1);
  assert.doesNotMatch(JSON.stringify(center),/secret/);
  assert.equal(config.providerConfig('PUBLIC_PROCUREMENT',env).businessActive,true);
});

test('one failed DeepL attempt does not change gated Trends or procurement states',()=>{
  const env={DEEPL_TRANSLATION_ENABLED:'true',DEEPL_API_KEY:'secret'};
  const center=readiness.buildOptionalProviderCenter({env,snapshots:[{provider:'DEEPL',status:'SUCCESS',fetched_at:'2026-08-18T01:00:00Z',metric_summary:{character_count:50,character_limit:500000}},{provider:'DEEPL',status:'FAILED',fetched_at:'2026-08-18T02:00:00Z',error_message:'quota'}]});
  assert.equal(center.services.find(item=>item.provider==='DEEPL').status,'FAILED');
  assert.equal(center.services.find(item=>item.provider==='DEEPL').previousSuccess,true);
  assert.equal(center.services.find(item=>item.provider==='GOOGLE_TRENDS_ALPHA').status,'ELIGIBILITY_REQUIRED');
  assert.equal(center.services.find(item=>item.provider==='PUBLIC_PROCUREMENT').status,'NOT_NEEDED');
});

test('optional providers have a real owner-only route, storage and responsive UI',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'optional-providers'}),'/data-collection/optional-providers');
  assert.deepEqual(routes.parseHubHref('/data-collection/optional-providers'),{view:'collection',workspace:'optional-providers',platform:'all',period:'DAY',product:'ALL'});
  const page=fs.readFileSync(path.join(root,'app/data-collection/optional-providers/page.js'),'utf8');const api=fs.readFileSync(path.join(root,'app/api/optional-providers/deepl/probe/route.js'),'utf8');const ui=fs.readFileSync(path.join(root,'app/optional-provider-center.js'),'utf8');const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260818120000_add_optional_provider_snapshots.sql'),'utf8');
  assert.match(page,/renderDashboardRoute\('collection'/);assert.match(api,/handleDeepLProbe/);assert.match(ui,/조건이 맞을 때만 쓰는 자료 API/);assert.match(ui,/fetch\(service\.action\.endpoint/);assert.match(css,/optionalProviderGrid/);assert.match(css,/@media\(max-width:760px\)/);assert.match(migration,/enable row level security/);assert.match(migration,/revoke all .*anon, authenticated/);
});
