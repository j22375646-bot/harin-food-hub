'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
const profile=fs.mkdtempSync('D:/GPT/Temp/shipping-feed-ui-'),id='HR-C24-AAAAAAAA';
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 for(const pass of [0,1]){
  const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'isolated-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:profile,MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
  try{
   const page=await app.firstWindow();page.setDefaultTimeout(25000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>runHubAction('disconnect'));
   console.log('restore: boot '+pass);
   assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot().length),0,'New app has no in-memory shipping state');
   await app.evaluate(({ipcMain,session},pass)=>{
    session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
    globalThis.feedMode='READY';globalThis.progressCalls=0;globalThis.orderReloads=0;globalThis.shippingWrites=0;
    const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
    replace('read-overview',()=>({status:'READY',scopes:{}}));
    replace('refresh',()=>{globalThis.orderReloads++;return {status:'UNAVAILABLE'};});
    replace('issue-and-register',()=>{globalThis.shippingWrites++;throw Error('Real writes forbidden in fixture');});
    const changed=new Date(Date.now()-5000).toISOString();
    replace('shipping-progress-read',(_event,ids)=>{globalThis.progressCalls++;if(globalThis.feedMode!=='READY')return {status:globalThis.feedMode};return {status:'READY',value:{contract:1,scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),partial:false,items:ids.map(hubOrderId=>({hubOrderId,platform:'CAFE24',phase:'REGISTER',status:pass?'REGISTERED':'RUNNING',requestId:'12345678-1234-4234-8234-123456789012',createdAt:changed,updatedAt:changed,nextAttemptAt:null}))}};});
   },pass);
   await page.evaluate(id=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:id,platform:'CAFE24',productName:'서버 기록 복원 시험 · 긴 상품명과 옵션',quantity:2,amount:1000,stage:'PREPARING'}]});showRoute('orders');},id);
   await page.evaluate(()=>window.moaonShippingProgress.poll());
   const badge=page.locator('.order-shipping-progress:not([hidden])');await badge.waitFor();
   assert.equal(await badge.getAttribute('data-progress-state'),pass?'REGISTERED':'RUNNING');
   assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot()[0].source),'SERVER');
   await page.evaluate(id=>{selectedOrderIds.add(id);orderSearch.value='복원';renderOrders();renderSelection();},id);
   const before=await page.evaluate(()=>({ids:[...selectedOrderIds],query:orderSearch.value,changed:window.moaonShippingProgress.snapshot()[0].changedAt}));
   await badge.locator('.shipping-progress-badge').click();assert.match(await badge.textContent(),pass?/서버의 쇼핑몰 등록 성공 기록/:/최근 서버 조회/);
   if(!pass){
    await app.evaluate(()=>globalThis.feedMode='TIMEOUT');await page.evaluate(()=>window.moaonShippingProgress.poll());
    assert.equal(await badge.getAttribute('data-progress-state'),'RUNNING');assert.equal(await badge.getAttribute('data-tone'),'attention');
    assert.match(await page.locator('#shipping-progress-sync').textContent(),/확인 필요/);
    await app.evaluate(()=>globalThis.feedMode='READY');await page.evaluate(()=>window.moaonShippingProgress.poll());
    assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot()[0].changedAt),before.changed);
   }
   assert.deepEqual(await page.evaluate(()=>({ids:[...selectedOrderIds],query:orderSearch.value})),{ids:before.ids,query:before.query});
   assert.equal(await app.evaluate(()=>globalThis.orderReloads),0);assert.equal(await app.evaluate(()=>globalThis.shippingWrites),0);
   await page.screenshot({path:`D:/GPT/Temp/shipping-feed-restored-${pass}.png`});
   await page.evaluate(()=>applyHubResult({status:'LOGIN_REQUIRED'}));assert.equal(await page.locator('.order-shipping-progress:not([hidden])').count(),0);
  }finally{await app.close();}
 }
 console.log(JSON.stringify({status:'PASS',freshProcessRestore:true,serverOnly:true,failedReadRetainsState:true,orderReloads:0,realWrites:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
