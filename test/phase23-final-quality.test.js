'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const keywordOperations=require('../lib/marketing/keyword-operations.js');
const costWorkbench=require('../lib/products/cost-workbench.js');
const densityWorkbench=require('../lib/ui/density-workbench.js');
const syncModule=require('../lib/automation/sync-all.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-8 keeps private client quality telemetry bounded and free of payload text',()=>{
  const source=read('instrumentation-client.js');
  const layout=read('app/layout.js');
  assert.match(source,/MAX_HEALTH_ENTRIES=30/);
  assert.match(source,/dataset\.harinHealthVersion=globalHealth\.version/);
  assert.match(layout,/data-harin-health-version="23-8"/);
  assert.match(source,/Nothing is transmitted or persisted/);
  assert.match(source,/startRoute=function startRoute/);
  assert.match(source,/finishRoute=function finishRoute/);
  assert.match(source,/type:'longtask'/);
  assert.match(source,/type:'layout-shift'/);
  assert.doesNotMatch(source,/event\.message|event\.reason\.message|localStorage|sessionStorage|fetch\(/);
});

test('23-8 exposes route and server-loader timings for live browser verification',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  assert.match(dashboard,/__HARIN_CLIENT_HEALTH__\?\.startRoute/);
  assert.match(dashboard,/__HARIN_CLIENT_HEALTH__\?\.finishRoute/);
  assert.match(dashboard,/data-loader-within-target/);
  assert.match(dashboard,/data-loader-remote-queries/);
});

test('23-8 hydrates the live shipping clock from the server snapshot before using browser time',()=>{
  const source=read('app/_main/harin-main-command-center.js');
  assert.match(source,/function CutoffClock\(\{ cutoffAt, cutoffState, generatedAt \}\)/);
  assert.match(source,/const \[now,setNow\]=useState\(initialNow\)/);
  assert.match(source,/generatedAt=\{daily\.generated_at\}/);
  assert.doesNotMatch(source,/useState\(\(\)=>Date\.now\(\)\)/);
});

test('23-8 bounds ten-thousand-row workbenches before rendering',()=>{
  const keywords=Array.from({length:10000},(_,index)=>({id:index,keyword:`키워드 ${index}`}));
  const keywordPage=keywordOperations.paginateKeywordRows(keywords,1,36);
  assert.equal(keywordPage.items.length,36);
  assert.equal(keywordPage.totalPages,278);

  const products=Array.from({length:10000},(_,index)=>({id:String(index),name:`상품 ${index}`}));
  const costPage=costWorkbench.paginateCostProducts(products,1);
  assert.equal(costPage.items.length,8);
  assert.equal(costPage.totalPages,1250);

  const providers=densityWorkbench.paginateDensityRows(products,1,10000,densityWorkbench.PROVIDER_PAGE_SIZES);
  assert.equal(providers.items.length,densityWorkbench.PROVIDER_PAGE_SIZES[0]);
});

test('23-8 isolates one provider failure and preserves successful channel results',async()=>{
  const env={
    CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'id',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://hub/callback',
    NAVER_CUSTOMER_ID:'customer',NAVER_API_KEY:'key',NAVER_SECRET_KEY:'secret'
  };
  const result=await syncModule.syncConnectedPlatforms({
    env,cafe24Token:{access_token:'token'},evidence:{naverCommerceWorkerReady:true,coupangWorkerReady:true},db:{},
    syncFunctions:{
      CAFE24:async()=>({status:'SUCCESS',rows:11}),
      NAVER_ADS:async()=>{throw new Error('injected provider outage');},
      NAVER_COMMERCE:async()=>({queued:true}),
      COUPANG:async()=>({queued:true})
    }
  });
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.jobs.find(item=>item.name==='CAFE24').status,'SUCCESS');
  assert.equal(result.jobs.find(item=>item.name==='NAVER_ADS').status,'FAILED');
  assert.equal(result.jobs.find(item=>item.name==='COUPANG').status,'RUNNING');
  assert.equal(result.channel_updates.find(item=>item.platform==='CAFE24').health_status,'READY');
  assert.notEqual(result.channel_updates.find(item=>item.platform==='COUPANG').health_status,'FAILED');
});

test('23-8 preserves mobile touch, fixed navigation, overflow and reduced-motion guards',()=>{
  const shell=read('app/_shell/harin-shell-v8.css');
  const readability=read('app/_design-system/harin-readability-v8.css');
  const interactions=read('app/_design-system/harin-interactions-v8.css');
  assert.match(shell,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shell,/position:fixed/);
  assert.match(readability,/--v8-readable-touch:48px/);
  assert.match(readability,/min-height:var\(--v8-readable-touch\)/);
  assert.match(shell,/overflow-x:hidden/);
  assert.match(interactions,/@media\(prefers-reduced-motion:reduce\)/);
});

test('23-8 ships one verification command and an explicit rollback boundary',()=>{
  const pkg=JSON.parse(read('package.json'));
  const rollback=read('docs/PHASE23_ROLLBACK.md');
  const performance=read('docs/PHASE23_PERFORMANCE.md');
  assert.equal(pkg.scripts['verify:phase23'],'pnpm test && pnpm build');
  assert.match(rollback,/v1\.37\.28/);
  assert.match(rollback,/git checkout v1\.37\.28/);
  assert.match(rollback,/harin-cafe24-sync\.vercel\.app/);
  assert.match(rollback,/데이터베이스 되돌리기 불필요/);
  assert.match(performance,/849\/849 통과/);
  assert.match(performance,/390×844/);
  assert.match(performance,/430×932/);
  assert.match(performance,/네이버 광고 수집기에 강제 오류/);
});
