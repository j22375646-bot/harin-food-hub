'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const readiness=require('../lib/google-owned-site/readiness.js');
const config=require('../lib/google-owned-site/config.js');
const pageSpeed=require('../lib/google-owned-site/pagespeed.js');
const crux=require('../lib/google-owned-site/crux.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.join(__dirname,'..');

test('phase 19-1 keeps four owned-site providers isolated and read-only',()=>{
  const center=readiness.buildOwnedSiteReadiness({snapshots:[],env:{},now:new Date('2026-08-17T10:00:00Z')});
  assert.equal(center.phase,'19-1');
  assert.deepEqual(center.services.map(item=>item.key),['searchConsole','ga4','pageSpeed','crux']);
  assert.equal(center.services.every(item=>item.status==='SETUP_REQUIRED'),true);
  assert.equal(center.services.flatMap(item=>item.capabilities).every(item=>item.writeStatus==='NOT_APPLICABLE'),true);
});

test('provider kill switches and credentials never leak across domains',()=>{
  const env={HUB_OWNED_SITE_URL:'https://shop.example.com',GOOGLE_PAGESPEED_API_KEY:'page-key',GOOGLE_CRUX_API_KEY:'crux-key',GOOGLE_CRUX_ENABLED:'false'};
  const page=config.providerConfig('PAGESPEED',env);const field=config.providerConfig('CRUX',env);
  assert.equal(page.enabled,true);assert.equal(page.apiKey,'page-key');assert.equal(field.enabled,false);assert.equal(field.apiKey,'crux-key');
  assert.equal(Object.hasOwn(page,'clientEmail'),false);
});

test('PageSpeed only requires a public store URL and keeps its API key optional',()=>{
  const page=config.providerConfig('PAGESPEED',{HUB_OWNED_SITE_URL:'https://shop.example.com'});
  assert.deepEqual(config.missingFields('PAGESPEED',page),[]);
  assert.equal(page.apiKey,'');
});

test('a failed provider preserves another provider success',()=>{
  const env={HUB_OWNED_SITE_URL:'https://shop.example.com',GOOGLE_PAGESPEED_API_KEY:'page-key',GOOGLE_CRUX_API_KEY:'crux-key'};
  const center=readiness.buildOwnedSiteReadiness({env,snapshots:[
    {provider:'PAGESPEED',status:'SUCCESS',fetched_at:'2026-08-17T09:00:00Z',metric_summary:{performanceScore:91,lcpMs:1500}},
    {provider:'CRUX',status:'FAILED',fetched_at:'2026-08-17T09:01:00Z',error_message:'quota exceeded'}
  ]});
  assert.equal(center.services.find(item=>item.key==='pageSpeed').status,'READY');
  assert.equal(center.services.find(item=>item.key==='crux').status,'FAILED');
});

test('GA4 ecommerce measurement snapshots never replace legacy connection readiness',()=>{
  const env={HUB_OWNED_SITE_URL:'https://shop.example.com',GOOGLE_GA4_PROPERTY_ID:'123',GOOGLE_SERVICE_ACCOUNT_EMAIL:'reader@example.test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'key'};
  const center=readiness.buildOwnedSiteReadiness({env,now:new Date('2026-08-27T02:00:00Z'),snapshots:[
    {provider:'GA4',status:'SUCCESS',fetched_at:'2026-08-27T00:00:00Z',metric_summary:{days:7,sessions:10,users:8},metadata:{read_only:true}},
    {provider:'GA4',status:'FAILED',fetched_at:'2026-08-27T01:00:00Z',error_message:'measurement failure',metadata:{kind:'GA4_ECOMMERCE_V1'}}
  ]});
  const ga4=center.services.find(item=>item.key==='ga4');
  assert.equal(ga4.status,'READY');
  assert.equal(ga4.lastAttemptAt,'2026-08-27T00:00:00Z');
  assert.match(ga4.detail,/방문 10회/);
});

test('legacy owned-site snapshot query excludes ecommerce before applying its bound',async()=>{
  const calls=[];
  const query={
    select(fields){calls.push(['select',fields]);return query;},
    or(filter){calls.push(['or',filter]);return query;},
    order(field,options){calls.push(['order',field,options]);return query;},
    limit(value){calls.push(['limit',value]);return query;},
    then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}
  };
  const db={from(table){calls.push(['from',table]);return query;}};
  const result=await readiness.legacySnapshotsQuery(db);
  assert.deepEqual(result,{data:[],error:null});
  assert.deepEqual(calls.map(call=>call[0]),['from','select','or','order','limit']);
  assert.deepEqual(calls.find(call=>call[0]==='or'),['or','metadata->>kind.is.null,metadata->>kind.neq.GA4_ECOMMERCE_V1']);
  assert.deepEqual(calls.at(-1),['limit',200]);
  const dashboard=fs.readFileSync(path.join(root,'app/dashboard-route.js'),'utf8');
  assert.match(dashboard,/ownedSiteReadinessModule\.legacySnapshotsQuery\(db\)/);
});

test('PageSpeed and CrUX adapters use official endpoints and preserve no-data',async()=>{
  let pageUrl='';
  const page=await pageSpeed.probe({config:{siteUrl:'https://shop.example.com',apiKey:'key'},fetchImpl:async url=>{pageUrl=String(url);return {ok:true,json:async()=>({lighthouseResult:{fetchTime:'2026-08-17T00:00:00Z',categories:{performance:{score:.92}},audits:{'largest-contentful-paint':{numericValue:1400}}}})};}});
  assert.match(pageUrl,/pagespeedonline\/v5\/runPagespeed/);assert.equal(page.metricSummary.performanceScore,92);
  const field=await crux.probe({config:{origin:'https://shop.example.com',apiKey:'key'},fetchImpl:async()=>({ok:false,status:404,json:async()=>({})})});
  assert.equal(field.status,'NO_DATA');assert.equal(field.metricSummary.reason,'CRUX_SAMPLE_UNAVAILABLE');
});

test('PageSpeed omits an empty optional API key from the provider request',async()=>{
  let pageUrl='';
  await pageSpeed.probe({config:{siteUrl:'https://shop.example.com',apiKey:''},fetchImpl:async url=>{pageUrl=String(url);return {ok:true,json:async()=>({lighthouseResult:{categories:{performance:{score:.8}},audits:{}}})};}});
  assert.equal(new URL(pageUrl).searchParams.has('key'),false);
});

test('PageSpeed explains exhausted shared no-key quota without leaking provider payloads',async()=>{
  await assert.rejects(()=>pageSpeed.probe({config:{siteUrl:'https://shop.example.com',apiKey:''},fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{message:'raw quota payload'}})})}),error=>{
    assert.equal(error.code,'PAGESPEED_PUBLIC_QUOTA_EXHAUSTED');
    assert.match(error.message,/API 키/);
    return true;
  });
});

test('owned-site workspace and owner session probe routes are real',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'owned-site'}),'/data-collection/owned-site');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/owned-site/page.js')),true);
  const files=['google-search-console','google-analytics','google-pagespeed','google-crux'].map(name=>fs.readFileSync(path.join(root,`app/api/${name}/probe/route.js`),'utf8')).join('\n')+fs.readFileSync(path.join(root,'lib/google-owned-site/route-handler.js'),'utf8');
  assert.match(files,/verifySession/);assert.doesNotMatch(files,/NEXT_PUBLIC_GOOGLE/);
});

test('owned-site snapshots are service-role only aggregated records',()=>{
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817111812_add_owned_site_api_snapshots.sql'),'utf8');
  assert.match(migration,/enable row level security/i);assert.match(migration,/revoke all.*anon, authenticated/i);assert.match(migration,/grant select, insert, update, delete.*service_role/i);
  assert.doesNotMatch(migration,/customer_name|phone|address|visitor_id/i);
});

test('Google adapters declare readonly scopes and provider-owned endpoints',()=>{
  const search=require('../lib/google-owned-site/search-console.js');const ga4=require('../lib/google-owned-site/ga4.js');
  assert.match(search.SCOPE,/webmasters\.readonly$/);assert.match(ga4.SCOPE,/analytics\.readonly$/);
  assert.match(search.ENDPOINT,/googleapis\.com\/webmasters/);assert.match(ga4.ENDPOINT,/analyticsdata\.googleapis\.com/);
});
