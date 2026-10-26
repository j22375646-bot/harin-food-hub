'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-retry-actions-208';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ipcMain})=>{
   globalThis.retryCalls={issue:0,continue:0};
   const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
   replace('shipping-progress-read',()=>({status:'BUSY'}));
   replace('continue-shipping',()=>{globalThis.retryCalls.continue++;return new Promise(resolve=>globalThis.resolveRetry=resolve);});
   replace('issue-and-register',()=>{globalThis.retryCalls.issue++;return {status:'REVIEW_CANCELLED'};});
  });
  await page.evaluate(()=>{
   window.retryFixture=(status,phase='REGISTER',invoice=true)=>{
    window.moaonShippingProgress.reset();
    applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',productName:'격리 시험 · 단계별 복구 버튼',stage:'PREPARING',quantity:1,amount:1000,issueAndRegisterEligible:!invoice,details:{invoice:invoice?{number:'1234567890123',status:'ISSUED'}:null}}]});showRoute('orders');
    window.moaonShippingProgress.start([{id:'HR-C24-AAAAAAAA',platform:'CAFE24'}],()=>{});
    window.moaonShippingProgress.update({hubOrderId:'HR-C24-AAAAAAAA',phase,status:'RUNNING'});
    window.moaonShippingProgress.finish({status:status==='CANCELLED'?'REVIEW_CANCELLED':status==='NOT_STARTED'?'BUSY':'PARTIAL',results:['CANCELLED','NOT_STARTED'].includes(status)?[]:[{hubOrderId:'HR-C24-AAAAAAAA',phase,status,...(invoice?{invoiceNumber:'1234567890123'}:{})}]});
   };retryFixture('FAILED');
  });
  const badge=page.locator('.shipping-progress-badge'),retry=page.locator('.shipping-progress-retry-action'),body=page.locator('.shipping-progress-detail');
  await badge.click();await page.getByRole('button',{name:'등록 다시 시도',exact:true}).click();
  assert.equal(await app.evaluate(()=>globalThis.retryCalls.continue),1);await retry.evaluate(n=>n.click());assert.equal(await app.evaluate(()=>globalThis.retryCalls.continue),1);
  await page.evaluate(()=>showRoute('settings'));assert.equal(await page.evaluate(()=>registrationBusy),true);
  await app.evaluate(()=>globalThis.resolveRetry({status:'COMPLETED',results:[{hubOrderId:'HR-C24-AAAAAAAA',phase:'REGISTER',status:'REGISTERED',invoiceNumber:'1234567890123'}]}));
  await page.waitForFunction(()=>!registrationBusy);await page.evaluate(()=>showRoute('orders'));assert.equal(await retry.isVisible(),false);
  await page.evaluate(()=>retryFixture('PENDING'));await badge.click();assert.equal(await retry.textContent(),'등록 이어가기');
  await page.evaluate(()=>retryFixture('FAILED','ISSUE',false));await badge.click();assert.equal(await retry.textContent(),'발급 결과 확인·이어가기');
  assert.equal(await app.evaluate(()=>globalThis.retryCalls.issue),0,'failed/unknown issuance never calls new issuance');
  await page.evaluate(()=>retryFixture('CANCELLED','CONFIRM',false));await badge.click();assert.equal(await retry.textContent(),'발급 다시 시도');
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.equal(await body.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   const styles=await page.locator('.shipping-progress-actions').evaluate(n=>[...n.querySelectorAll('button:not([hidden])')].map(b=>{const s=getComputedStyle(b);return [s.borderRadius,s.fontSize,s.backgroundColor].join('|');}));assert.equal(new Set(styles).size,1);
   await page.screenshot({path:path.join(output,'retry-'+theme+'.png')});
  }
  await retry.click();await page.waitForFunction(()=>!registrationBusy);assert.equal(await app.evaluate(()=>globalThis.retryCalls.issue),1);
  await page.evaluate(()=>retryFixture('REGISTERED'));await badge.click();assert.equal(await retry.isVisible(),false);assert.equal(await page.getByRole('button',{name:'등록 결과 확인',exact:true}).isVisible(),true);
  await page.evaluate(()=>retryFixture('CHECK_REQUIRED','ISSUE',false));await badge.click();assert.match(await retry.textContent(),/발급 결과 확인/);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',()=>({status:'TIMEOUT'}));});
  await page.evaluate(()=>window.moaonShippingProgress.poll());assert.equal(await retry.isVisible(),false,'failed recheck cannot offer a fresh write action');
  console.log(JSON.stringify({status:'PASS',registrationRetry:true,unstartedIssueRetry:true,unknownIssuanceReadOnly:true,completeHidesRetry:true,duplicateBlocked:true,navigation:true,themes:2,realWrites:0}));
 }catch(e){console.error(e);throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
