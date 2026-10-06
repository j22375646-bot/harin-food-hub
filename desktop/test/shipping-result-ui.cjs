'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/shipping-result-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>returnToSample());await page.waitForTimeout(1000);
  await app.evaluate(({ipcMain})=>{
   for(const name of ['issue-and-register','recheck-page','view-registered'])ipcMain.removeHandler('moaon-hub:'+name);
   ipcMain.handle('moaon-hub:issue-and-register',(_e,ids)=>({status:'COMPLETED',results:ids.map(hubOrderId=>({hubOrderId,phase:'REGISTER',status:'REGISTERED',invoiceNumber:'1234567890123',trackingStatus:'PENDING'}))}));
   for(const name of ['recheck-page','view-registered'])ipcMain.handle('moaon-hub:'+name,()=>({status:'UNAVAILABLE'}));
  });
  await page.evaluate(async()=>{
   checkVisibleOrderFreshness=async()=>{};refreshOverview=async()=>{};
   applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'자동 검증용 주문 · 실제 발급 없음',stage:'PREPARING',quantity:1,amount:1000,issueAndRegisterEligible:true,registrationEligible:false,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{items:[],cancelled:false,cancellationRequested:false}}]});
   // Keep the synthetic order fixture separate from unauthenticated background results.
   applyHubResult=()=>{};
   document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;showRoute('orders');
   await runAutomaticShipping(['HR-C24-00000001']);
  });
  const result=page.locator('#auto-shipping-results');const rendered=await result.innerText();assert.equal(await result.isVisible(),true);assert.match(rendered,/등록 완료/);assert.match(rendered,/1234567890123/);assert.match(rendered,/배송추적 요청 접수/);assert.doesNotMatch(rendered,/결과 확인 필요 · 재발급 금지/);
  await result.scrollIntoViewIfNeeded();await page.screenshot({path:'D:/GPT/tmp/shipping-result-0176-1.png'});
  console.log('PASS: visible isolated shipping success, invoice and tracking pending remain distinct; no live writes');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
