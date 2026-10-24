'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'isolated-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/Temp/shipping-continuation-ui-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(25000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain,session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});globalThis.continueCalls=0;globalThis.issueCalls=0;
   const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
   replace('read-overview',()=>({status:'READY',scopes:{}}));replace('issue-and-register',()=>{globalThis.issueCalls++;throw Error('Issuance forbidden');});
   replace('continue-shipping',(_e,id)=>{globalThis.continueCalls++;if(id!=='HR-C24-AAAAAAAA')throw Error('Crossed id');return new Promise(resolve=>globalThis.finishContinue=resolve);});
   replace('shipping-progress-read',(_e,ids)=>({status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items:ids.map(hubOrderId=>({hubOrderId,platform:'CAFE24',phase:'REGISTER',status:'PENDING',requestId:'12345678-1234-4234-8234-123456789012',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),nextAttemptAt:null}))}}));
   replace('view-registered',()=>({status:'READY',scope:'REGISTER',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',productName:'격리 시험 자료 · 기존 송장 등록 완료',stage:'READY_TO_SHIP',quantity:1,amount:1000,details:{invoice:{status:'REGISTERED',number:'1234567890123'}}}]}));
  });
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',productName:'격리 시험 자료 · 기존 작업 이어가기',stage:'PREPARING',quantity:1,amount:1000,issueAndRegisterEligible:false,details:{invoice:{status:'ISSUED',number:'1234567890123'}}}]});showRoute('orders');});
  await page.evaluate(()=>window.moaonShippingProgress.poll());const badge=page.locator('.order-shipping-progress');await badge.locator('summary').click();
  await badge.getByRole('button',{name:'기존 작업 확인·이어가기'}).click();await page.waitForFunction(()=>registrationBusy);assert.equal(await app.evaluate(()=>globalThis.continueCalls),1);
  await badge.locator('.shipping-progress-continue').evaluate(n=>n.click());assert.equal(await app.evaluate(()=>globalThis.continueCalls),1);
  await page.locator('[data-route="settings"]').first().evaluate(n=>n.click());assert.equal(await page.evaluate(()=>registrationBusy),true);
  await app.evaluate(()=>globalThis.finishContinue({status:'PARTIAL',results:[{hubOrderId:'HR-C24-AAAAAAAA',phase:'REGISTER',status:'PENDING',invoiceNumber:'1234567890123'}]}));await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await page.locator('[data-page="settings"]').isVisible(),true);await page.evaluate(()=>showRoute('orders'));
  assert.equal(await badge.getAttribute('data-progress-state'),'PENDING');await badge.locator('summary').click();
  await badge.getByRole('button',{name:'기존 작업 확인·이어가기'}).click();await page.waitForFunction(()=>registrationBusy);
  await app.evaluate(()=>globalThis.finishContinue({status:'COMPLETED',results:[{hubOrderId:'HR-C24-AAAAAAAA',phase:'REGISTER',status:'REGISTERED',invoiceNumber:'1234567890123'}]}));await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await badge.getAttribute('data-progress-state'),'REGISTERED');assert.equal(await page.locator('#auto-shipping-results').isVisible(),false);assert.equal(await app.evaluate(()=>globalThis.issueCalls),0);
  await badge.locator('summary').click();assert.equal(await badge.getByRole('button',{name:'등록 결과 확인'}).isVisible(),true);
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await badge.locator('.shipping-progress-detail').scrollIntoViewIfNeeded();assert.equal(await badge.locator('.shipping-progress-detail').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await page.screenshot({path:'D:/GPT/Temp/shipping-continuation-'+theme+'.png'});}
  console.log(JSON.stringify({status:'PASS',continuationCalls:2,issuanceCalls:0,navigationDuringJob:true,duplicateClickBlocked:true,compactResult:true,realWrites:false}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
