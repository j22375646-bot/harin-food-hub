'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-completed-state-207';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:60000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',()=>({status:'TIMEOUT'}));});
  await page.evaluate(()=>{
   window.completedFixture=(scope='REGISTER',registered=true,number='6890176974040')=>{applyHubResult({status:'READY',scope,channel:'ALL',total:scope==='REGISTER'?1:0,offset:0,checkedAt:new Date().toISOString(),orders:scope==='REGISTER'?[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'등록 완료 유지 · 격리 시험 자료',stage:'WAITING_FOR_CARRIER',quantity:1,amount:1000,details:{invoice:{status:registered?'REGISTERED':'ISSUED',number}}}]:[]});showRoute('orders');};
   completedFixture();
  });
  const badge=page.locator('.shipping-progress-badge');
  assert.match(await badge.textContent(),/등록 완료/,'a verified stored registered invoice is available before the progress endpoint responds');
  await page.evaluate(()=>window.moaonShippingProgress.poll());assert.match(await badge.textContent(),/등록 완료/);assert.equal(await page.locator('.order-shipping-progress').getAttribute('data-tone'),'complete');
  await badge.click();assert.equal(await page.locator('.shipping-progress-recheck-note').isVisible(),true);assert.match(await page.locator('.shipping-progress-recheck-note').textContent(),/時間|시간|초과/);assert.match(await page.locator('.shipping-progress-reason').textContent(),/등록/);
  await page.screenshot({path:path.join(output,'completed-after-timeout.png')});await page.keyboard.press('Escape');
  for(let i=0;i<3;i++){await page.evaluate(()=>completedFixture('IN_TRANSIT'));await page.evaluate(()=>completedFixture());await page.evaluate(()=>window.moaonShippingProgress.poll());assert.match(await badge.textContent(),/등록 완료/);}
  await page.evaluate(()=>completedFixture('REGISTER',false,'6890176974041'));await page.evaluate(()=>window.moaonShippingProgress.poll());assert.doesNotMatch(await badge.textContent(),/등록 완료/,'a different issued-only invoice cannot borrow old completion');
  await page.evaluate(()=>{window.moaonShippingProgress.start([{id:'HR-C24-00000001',platform:'CAFE24'}],()=>{});window.moaonShippingProgress.finish({results:[{hubOrderId:'HR-C24-00000001',phase:'REGISTER',status:'REGISTERED',invoiceNumber:'6890176974040'}]});completedFixture('REGISTER',false,'6890176974041');});
  assert.doesNotMatch(await badge.textContent(),/등록 완료/,'local completion of invoice A cannot mark invoice B registered');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',()=>({status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',phase:'REGISTER',status:'REGISTERED',requestId:'12345678-1234-4234-8234-123456789012',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),nextAttemptAt:null}]}}));});
  await page.evaluate(()=>window.moaonShippingProgress.poll());assert.doesNotMatch(await badge.textContent(),/등록 완료/,'unbound server history cannot confirm a different issued-only invoice');
  await page.evaluate(()=>completedFixture('REGISTER',true,'6890176974041'));assert.match(await badge.textContent(),/등록 완료/);await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot().length),0);
  console.log(JSON.stringify({status:'PASS',storedProof:true,routeRoundTrips:3,timeoutKeepsComplete:true,changedInvoiceClearsProof:true,logoutClearsProof:true,realWrites:0}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
