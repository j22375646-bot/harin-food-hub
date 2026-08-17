const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {requestJson}=require('../lib/market-intelligence/request-safety.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('market request safety rejects HTTP errors without leaking HTML',async()=>{
  await assert.rejects(()=>requestJson('/probe',{fetchImpl:async()=>new Response('<h1>secret proxy page</h1>',{status:503}),timeoutMs:50}),error=>{
    assert.equal(error.code,'INVALID_JSON');
    assert.equal(error.status,503);
    assert.doesNotMatch(error.message,/secret proxy page/u);
    return true;
  });
});

test('market request safety rejects API errors with a safe message',async()=>{
  await assert.rejects(()=>requestJson('/probe',{fetchImpl:async()=>new Response(JSON.stringify({ok:false,error:'잠시 사용할 수 없습니다.'}),{status:503}),timeoutMs:50}),error=>{
    assert.equal(error.code,'HTTP_ERROR');
    assert.equal(error.status,503);
    assert.match(error.message,/잠시 사용할 수 없습니다/u);
    return true;
  });
});

test('market request safety times out a hanging request',async()=>{
  await assert.rejects(()=>requestJson('/probe',{fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true})),timeoutMs:5}),error=>error.code==='REQUEST_TIMEOUT');
});

test('market workspace paints immediately and defers secondary conversion workbenches',()=>{
  const shell=read('app/_shell/market-intelligence-shell.js');
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  const stage=read('app/market-intelligence/[projectId]/conversion/conversion-stage-client.js');
  assert.doesNotMatch(shell,/HarinLoadingScreen|mounted/u);
  assert.match(workspace,/ConversionStage/u);
  assert.doesNotMatch(workspace,/GrowthLoopWorkbench|ExecutionBridgeWorkbench/u);
  assert.match(stage,/dynamic\(\(\)=>import\('\.\/growth-loop-client\.js'\)/u);
  assert.match(stage,/opened\.growth\?<GrowthLoopWorkbench/u);
  assert.match(stage,/opened\.execution\?<ExecutionBridgeWorkbench/u);
});

test('every phase 17 workbench exposes isolated retry recovery',()=>{
  const files=[
    'app/market-intelligence/[projectId]/data/product-baseline-client.js',
    'app/market-intelligence/[projectId]/data/data-room-client.js',
    'app/market-intelligence/[projectId]/market/market-profile-client.js',
    'app/market-intelligence/[projectId]/competition/competition-client.js',
    'app/market-intelligence/[projectId]/conversion/conversion-client.js',
    'app/market-intelligence/[projectId]/conversion/growth-loop-client.js',
    'app/market-intelligence/[projectId]/conversion/execution-bridge-client.js'
  ];
  for(const file of files){const source=read(file);assert.match(source,/requestJson/u,file);assert.match(source,/MarketWorkbenchError/u,file);assert.match(source,/onRetry/u,file);}
  assert.match(read('app/market-intelligence/error.js'),/reset/u);
});

test('mobile stage navigation is horizontal and recovery controls remain touch sized',()=>{
  const css=read('app/globals.css');
  assert.match(css,/\.marketWorkspaceTabs\{display:flex!important;overflow-x:auto/u);
  assert.match(css,/\.marketWorkbenchError \.harinButton\{min-height:48px/u);
});
