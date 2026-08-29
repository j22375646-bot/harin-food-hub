'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const center=require('../lib/provider-fallback/center.js');
const routes=require('../lib/navigation/hub-routes.js');
const root=path.resolve(__dirname,'..');

const naverApiCenter={services:[{key:'apiHub',status:'READY'}]};
const ownedSiteCenter={services:[{key:'searchConsole',status:'READY'},{key:'ga4',status:'READY'},{key:'pageSpeed',status:'READY'},{key:'crux',status:'NO_DATA'}]};

test('phase 19-8 keeps every paid provider inactive and cost-free by default',()=>{
  const result=center.buildProviderFallbackCenter({naverApiCenter,ownedSiteCenter,env:{},now:new Date('2026-08-18T03:00:00Z')});
  assert.deepEqual(result.providers.map(item=>item.key),['BRAVE_SEARCH','NAVER_CLOVA_OCR','SEMRUSH']);
  assert.equal(result.summary.active,0);
  assert.equal(result.summary.currentCost,0);
  assert.ok(result.providers.every(item=>item.decisionStatus==='FREE_FIRST'));
  assert.ok(result.providers.every(item=>item.status==='SETUP_REQUIRED'));
  assert.ok(result.providers.every(item=>item.currentCost===0));
});

test('credentials and kill switches never pretend the first provider read succeeded',()=>{
  const env={
    BRAVE_SEARCH_API_KEY:'server-only',BRAVE_SEARCH_ENABLED:'true',
    NAVER_CLOVA_OCR_INVOKE_URL:'https://example.invalid/ocr',NAVER_CLOVA_OCR_SECRET:'server-only',NAVER_CLOVA_OCR_ENABLED:'false',
    SEMRUSH_API_KEY:'server-only',SEMRUSH_ENABLED:'true'
  };
  const result=center.buildProviderFallbackCenter({naverApiCenter,ownedSiteCenter,env});
  assert.equal(result.providers.find(item=>item.key==='BRAVE_SEARCH').status,'READ_PROBE_REQUIRED');
  assert.equal(result.providers.find(item=>item.key==='NAVER_CLOVA_OCR').status,'LOCKED');
  assert.equal(result.providers.find(item=>item.key==='SEMRUSH').status,'READ_PROBE_REQUIRED');
  assert.equal(result.summary.active,0);
  assert.doesNotMatch(JSON.stringify(result),/server-only/);
});

test('free and official sources are shown before each paid fallback',()=>{
  const result=center.buildProviderFallbackCenter({naverApiCenter,ownedSiteCenter,env:{}});
  const brave=result.providers.find(item=>item.key==='BRAVE_SEARCH');
  const ocr=result.providers.find(item=>item.key==='NAVER_CLOVA_OCR');
  const semrush=result.providers.find(item=>item.key==='SEMRUSH');
  assert.ok(brave.freeSources.some(item=>item.label.includes('NAVER API HUB')&&item.status==='READY'));
  assert.ok(ocr.freeSources.some(item=>item.label.includes('수동 판독')&&item.status==='READY'));
  assert.ok(semrush.freeSources.some(item=>item.label.includes('Search Console')&&item.status==='READY'));
  assert.match(ocr.priceLabel,/월 100회/);
  assert.match(semrush.priceLabel,/유료 구독/);
});

test('provider fallback center exposes no customer PII or client-side provider call',()=>{
  const service=fs.readFileSync(path.join(root,'lib/provider-fallback/center.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'app/provider-fallback-center.js'),'utf8');
  assert.doesNotMatch(service,/receiver_name|receiver_phone|receiver_address|customer_id/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|primaryAction\.endpoint/);
  assert.match(ui,/페이지를 열어도 외부 호출 0건/);
  assert.match(ui,/무료 자료만으로는 부족해요/);
});

test('provider fallback workspace is a real responsive owner-only route',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'provider-fallback'}),'/data-collection/provider-fallback');
  assert.deepEqual(routes.parseHubHref('/data-collection/provider-fallback'),{view:'collection',workspace:'provider-fallback',platform:'all',period:'DAY',product:'ALL'});
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/provider-fallback/page.js')),true);
  const page=fs.readFileSync(path.join(root,'app/data-collection/provider-fallback/page.js'),'utf8');
  const dashboard=fs.readFileSync(path.join(root,'app/legacy-dashboard-client.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');
  assert.match(page,/renderDashboardRoute\('collection'/);
  assert.match(dashboard,/workspace==='provider-fallback'/);
  assert.match(css,/\.providerFallbackGrid/);
  assert.match(css,/@media\(max-width:760px\)/);
});
