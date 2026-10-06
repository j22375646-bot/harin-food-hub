'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.recoveryWrites=0;globalThis.recoveryReads=[];
   for(const name of ['issue-and-register','register-invoices']){
    ipcMain.removeHandler('moaon-hub:'+name);
    ipcMain.handle('moaon-hub:'+name,(_e,ids)=>{globalThis.recoveryWrites++;return {status:'PARTIAL',results:ids.map(hubOrderId=>({hubOrderId,phase:'REGISTER',status:'CHECK_REQUIRED'}))};});
   }
   ipcMain.removeHandler('moaon-hub:find-order');
   ipcMain.handle('moaon-hub:find-order',(_e,id)=>{globalThis.recoveryReads.push(id);return {status:'NOT_FOUND',page:{status:'READY',scope:'ACTIVE',channel:'ALL',orders:[],total:0}};});
  });
  for(const mode of ['auto','manual']){
   await page.evaluate(()=>applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'복구 시험',stage:'PREPARING',quantity:1,amount:30000,issueAndRegisterEligible:true,registrationEligible:true,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{cancelled:false,cancellationRequested:false,items:[]}}],total:1}));
   await page.getByRole('button',{name:'주문·배송',exact:true}).click();
   await page.evaluate(async mode=>{selectedOrderIds.add('HR-C24-00000001');if(mode==='auto')await runAutomaticShipping();else await registerSelectedInvoices();},mode);
   const panel=page.locator(mode==='auto'?'#auto-shipping-results':'#registration-items');
   const recover=panel.getByRole('button',{name:'주문·발급 상태 확인',exact:true});
   assert.equal(await recover.count(),1,'uncertain result must offer in-app read-only recovery');
   const before=await app.evaluate(()=>globalThis.recoveryWrites);
   const oldButton=await recover.elementHandle();
   await recover.click();await page.waitForFunction(()=>!document.querySelector('#shipping-history-status').textContent.includes('찾는 중')&&displayedOrders.length===0);
   await oldButton.evaluate(button=>button.click());
   assert.equal(await app.evaluate(()=>globalThis.recoveryWrites),before,'recovery never resubmits issuance or registration');
  }
  assert.deepEqual(await app.evaluate(()=>globalThis.recoveryReads),['HR-C24-00000001','HR-C24-00000001']);
  console.log('PASS: automatic/manual uncertain shipment results recover through order reads without resending');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
