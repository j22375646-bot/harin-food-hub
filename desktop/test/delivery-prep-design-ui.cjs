'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-delivery-design-222';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>window.moaonHub.refresh());
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:0,offset:0,checkedAt:new Date().toISOString(),orders:[]});showRoute('orders');});
  const panel=page.locator('#delivery-prep-status');
  for(const width of [1440,1040,900])for(const theme of ['light','dark'])for(const state of ['loading','complete','attention']){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(({theme,state})=>{document.documentElement.dataset.theme=theme;paintDeliveryPreparation(deliveryPreparationStatus(),state==='loading'?3:4,4,state==='attention'?3:state==='loading'?2:4,state!=='loading');},{theme,state});
   assert.equal(await panel.getAttribute('data-state'),state);assert.doesNotMatch(await panel.textContent(),/최대 3건|동시|조회 방식/);
   assert.equal(await panel.locator('progress').getAttribute('value'),state==='loading'?'3':'4');
   assert.equal(await panel.getAttribute('aria-busy'),String(state==='loading'));
   assert.equal(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   assert.ok((await panel.boundingBox()).height<=64);
   assert.equal(await panel.locator('progress').evaluate(n=>getComputedStyle(n).position),'absolute');
   if(state==='loading')assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::before').animationName),'prep-orbit-breathe');
   if(state==='complete'){assert.equal(await panel.locator('svg path').count(),1);assert.equal(await panel.locator('svg path').evaluate(n=>getComputedStyle(n).animationIterationCount),'1');await page.waitForTimeout(700);}
   await panel.screenshot({path:path.join(output,theme+'-'+state+'-'+width+'.png')});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>paintDeliveryPreparation(deliveryPreparationStatus(),0,4,0));
  assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
  assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::before').animationName),'none');
  await page.evaluate(()=>paintDeliveryPreparation(deliveryPreparationStatus(),4,4,4,true));assert.equal(await panel.locator('svg path').evaluate(n=>getComputedStyle(n).animationName),'none');
  await page.evaluate(()=>{selectedScope='REGISTER';scheduleDeliveryPreparation();});assert.equal(await panel.isVisible(),false);
  await page.evaluate(()=>document.dispatchEvent(new Event('moaon-session-changed')));assert.equal(await panel.textContent(),'');assert.equal(await panel.isVisible(),false);
  console.log(JSON.stringify({status:'PASS',states:3,themes:2,widths:[1440,1040,900],finiteCompletionMotion:true,compact:true,noOverflow:true,reducedMotion:true,scopeAndSessionReset:true,realWrites:0}));
 }finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
