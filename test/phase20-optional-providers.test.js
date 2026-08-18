'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/optional-providers/config.js');
const deepl=require('../lib/optional-providers/deepl-client.js');
const procurement=require('../lib/optional-providers/procurement-client.js');
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
  assert.equal(center.services.filter(item=>item.action).length,2);
  assert.doesNotMatch(JSON.stringify(center),/secret/);
  assert.equal(config.providerConfig('PUBLIC_PROCUREMENT',env).businessActive,true);
});

test('public procurement probe decodes the portal key and reads only a known goods notice',async()=>{
  let requested;const result=await procurement.probe({config:{endpoint:'https://apis.data.go.kr/example',apiKey:'abc%2B123%3D'},fetchImpl:async url=>{requested=url;return {ok:true,status:200,text:async()=>'<response><header><resultCode>00</resultCode><resultMsg>정상</resultMsg></header><body><items><item><bidNtceNo>20160234982</bidNtceNo><bidNtceNm>물품 조회</bidNtceNm></item></items><totalCount>1</totalCount></body></response>'};}});
  assert.equal(requested.searchParams.get('ServiceKey'),'abc+123=');
  assert.equal(result.status,'SUCCESS');assert.equal(result.totalCount,1);
  assert.doesNotMatch(JSON.stringify(result),/abc\+123/u);
});

test('public procurement readiness stores only columns supported by optional provider snapshots',async()=>{
  let inserted;const db={from(table){assert.equal(table,'optional_provider_snapshots');return {insert(row){inserted=row;return {select(){return {async single(){return {data:{id:'snapshot-1',provider:row.provider,status:row.status,fetched_at:row.fetched_at},error:null};}};}};}};}};
  const env={PUBLIC_PROCUREMENT_B2B_ACTIVE:'true',PUBLIC_PROCUREMENT_ENABLED:'true',DATA_GO_KR_SERVICE_KEY:'abc%2B123%3D'};
  const result=await readiness.probeProcurement({db,env,now:new Date('2026-08-18T09:20:00Z'),fetchImpl:async()=>({ok:true,status:200,text:async()=>'<response><header><resultCode>00</resultCode><resultMsg>정상</resultMsg></header><body><items><item><bidNtceNo>20160234982</bidNtceNo></item></items><totalCount>1</totalCount></body></response>'})});
  assert.equal(result.snapshot.id,'snapshot-1');assert.equal(inserted.metric_summary.item_count,1);assert.equal(inserted.metadata.read_only,true);assert.equal(inserted.metadata.sample_notice_number,'20160234982');assert.equal('source_data' in inserted,false);assert.equal('source_timestamp' in inserted,false);
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
  const page=fs.readFileSync(path.join(root,'app/data-collection/optional-providers/page.js'),'utf8');const api=fs.readFileSync(path.join(root,'app/api/optional-providers/deepl/probe/route.js'),'utf8');const procurementApi=fs.readFileSync(path.join(root,'app/api/optional-providers/public-procurement/probe/route.js'),'utf8');const ui=fs.readFileSync(path.join(root,'app/optional-provider-center.js'),'utf8');const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260818120000_add_optional_provider_snapshots.sql'),'utf8');
  assert.match(page,/renderDashboardRoute\('collection'/);assert.match(api,/handleDeepLProbe/);assert.match(procurementApi,/handleProcurementProbe/);assert.match(ui,/조건이 맞을 때만 쓰는 자료 API/);assert.match(ui,/fetch\(service\.action\.endpoint/);assert.match(css,/optionalProviderGrid/);assert.match(css,/@media\(max-width:760px\)/);assert.match(migration,/enable row level security/);assert.match(migration,/revoke all .*anon, authenticated/);
});
