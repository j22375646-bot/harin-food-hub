'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/market-context/config.js');
const kamis=require('../lib/market-context/kamis-price.js');
const weather=require('../lib/market-context/kma-weather.js');
const youtube=require('../lib/market-context/youtube-search.js');
const context=require('../lib/market-intelligence/context-evidence.js');
const utils=require('../lib/public-evidence/candidate-utils.js');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 19-5 keeps KAMIS, KMA and YouTube credentials and kill switches isolated',()=>{
  const env={KAMIS_API_KEY:'kamis-key',KAMIS_API_ID:'owner-id',KMA_API_HUB_KEY:'weather-key',KMA_WEATHER_ENABLED:'false',YOUTUBE_DATA_API_KEY:'youtube-key'};
  const price=config.providerConfig('KAMIS_PRICE',env),forecast=config.providerConfig('KMA_WEATHER',env),video=config.providerConfig('YOUTUBE_SEARCH',env);
  assert.equal(price.apiKey,'kamis-key');assert.equal(price.apiId,'owner-id');assert.equal(Object.hasOwn(price,'authKey'),false);
  assert.equal(forecast.authKey,'weather-key');assert.equal(forecast.enabled,false);assert.equal(Object.hasOwn(forecast,'apiKey'),false);
  assert.equal(video.apiKey,'youtube-key');assert.deepEqual(config.missingFields('KAMIS_PRICE',{apiKey:'',apiId:''}),['KAMIS 인증키','KAMIS 요청자 ID']);
});

test('KAMIS uses the official HTTPS endpoint, filters the ingredient and removes credentials',async()=>{
  let requested='';const result=await kamis.probe({config:{apiKey:'private-key',apiId:'private-id'},query:'작두콩',now:new Date('2026-08-17T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({price:[{productno:'123',productName:'작두콩',unit:'1kg',day1:'20260817',dpr1:'12000',day2:'11800',direction:'상승',value:'200'}]})};}});
  assert.match(requested,/^https:\/\/www\.kamis\.or\.kr\/service\/price\/xml\.do/u);assert.match(requested,/p_cert_key=private-key/u);assert.equal(result.status,'READY');assert.equal(result.candidates[0].metadata.today_price,'12000');assert.doesNotMatch(JSON.stringify(result.candidates),/private-key|private-id/u);
});

test('KAMIS preserves no-data instead of inventing zero',async()=>{const result=await kamis.probe({config:{apiKey:'key',apiId:'id'},query:'작두콩',fetchImpl:async()=>({ok:true,json:async()=>({price:[{productName:'감자',dpr1:'9000'}]})})});assert.equal(result.status,'NO_DATA');assert.equal(result.totalCount,0);assert.equal(result.reason,'NO_MATCHING_PRICE');});

test('KMA parser normalizes a product-independent weather context without an auth key',async()=>{
  const fixture='REG_ID,TM_FC,TM_EF,TA,ST,SKY,PREP,WF\n11F20000,202608170600,202608181200,31,60,흐림,비,오후 비';
  const rows=weather.parseForecast(fixture);assert.equal(rows[0].REG_ID,'11F20000');
  let requested='';const result=await weather.probe({config:{authKey:'secret-weather',regionCode:'11F20000',regionLabel:'광주·전남'},now:new Date('2026-08-17T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,text:async()=>fixture};}});
  assert.match(requested,/apihub\.kma\.go\.kr/u);assert.equal(result.candidates[0].metadata.precipitation_probability,'60');assert.doesNotMatch(JSON.stringify(result.candidates),/secret-weather/u);
});

test('YouTube search is manual read-only, strict and stores no comments or viewer identity',async()=>{
  let requested='';const result=await youtube.probe({config:{apiKey:'video-secret'},query:'작두콩차',now:new Date('2026-08-17T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({items:[{id:{videoId:'abc123'},snippet:{title:'<b>작두콩차</b> 끓이기',description:'공개 영상',channelTitle:'차 채널',publishedAt:'2026-08-16T00:00:00Z'}}]})};}});
  assert.match(requested,/googleapis\.com\/youtube\/v3\/search/u);assert.match(requested,/safeSearch=strict/u);assert.match(requested,/type=video/u);assert.equal(result.quotaCost,1);assert.equal(result.candidates[0].title,'작두콩차 끓이기');assert.doesNotMatch(JSON.stringify(result.candidates),/video-secret|comment|viewer/u);
});

test('signed market context candidates are domain allowlisted and browser changes are rejected',()=>{
  const candidate=kamis.normalizeRow({productno:'123',productName:'작두콩',unit:'1kg',day1:'20260817',dpr1:'12000'},new Date('2026-08-17T00:00:00Z'));
  const token=utils.signCandidate(candidate,'test-secret');assert.equal(utils.verifyCandidate(candidate,token,'test-secret'),true);assert.equal(utils.verifyCandidate({...candidate,title:'changed'},token,'test-secret'),false);assert.equal(context.candidateFromInput(candidate).provider,'KAMIS_PRICE');assert.throws(()=>context.candidateFromInput({...candidate,source_url:'https://evil.example.com'}),/공식 원문/);
});

test('phase 19-5 route, storage and UI keep product isolation, auth and owner review',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/context-evidence/route.js'),service=read('lib/market-intelligence/context-evidence.js'),migration=read('supabase/migrations/20260817140939_add_market_context_snapshots.sql'),workspace=read('app/market-intelligence/[projectId]/workspace-page.js'),client=read('app/market-intelligence/[projectId]/market/context-evidence-client.js'),css=read('app/_analysis/harin-market-intelligence.css'),env=read('.env.example');
  assert.match(route,/isAuthorized\(request,authModule\)/);assert.match(route,/maxBytes:64\*1024/);assert.match(service,/master_product_id:project\.master_product_id/);assert.match(service,/evidence_type:'PROXY'/);assert.match(service,/status:'OWNER_CONFIRMATION_REQUIRED'/);assert.match(service,/Promise\.all/);assert.doesNotMatch(service,/NEXT_PUBLIC_/);
  assert.match(migration,/enable row level security/);assert.match(migration,/revoke all[^;]+anon,authenticated/su);assert.match(migration,/service_role/);assert.match(migration,/market_context_snapshot_product_guard/);
  assert.match(workspace,/MarketContextEvidence/);assert.match(client,/댓글과 시청자 정보는 수집하지 않아요/);assert.match(client,/화면을 여는 것만으로 외부 API를 호출하지 않아요/);assert.match(client,/API 키는 18~21단계 완료 후 한 번에 입력/);assert.match(css,/\.marketContextEvidenceWorkbench/);assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.marketContextEvidenceWorkbench/);
  assert.match(env,/KAMIS_API_KEY=/);assert.match(env,/KMA_API_HUB_KEY=/);assert.match(env,/YOUTUBE_DATA_API_KEY=/);
});
