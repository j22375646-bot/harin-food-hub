'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-order-colors-211';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>window.moaonHub.refresh());
  await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',(_e,ids)=>({status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items:ids.map((hubOrderId,i)=>({hubOrderId,platform:'CAFE24',phase:['PREPARE','ISSUE','REGISTER','REGISTER','REGISTER'][i],status:i===3?'REGISTERED':i===4?'FAILED':'RUNNING',requestId:'12345678-1234-4234-8234-12345678901'+i,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),nextAttemptAt:null}))}}));});
  await page.evaluate(()=>{const orders=Array.from({length:5},(_,i)=>({hubOrderId:'HR-C24-'+String(i+1).padStart(8,'0'),platform:'CAFE24',productName:'색상 확인 · 격리 시험 '+(i+1),stage:'PREPARING',quantity:1,amount:1000,details:{invoice:{status:i===3?'REGISTERED':'ISSUED',number:'123456789012'+i}}}));applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:5,offset:0,checkedAt:new Date().toISOString(),orders});showRoute('orders');});
  await page.evaluate(()=>window.moaonShippingProgress.poll());await page.evaluate(()=>window.moaonShippingProgress.poll());
  for(const theme of ['light','dark']){
   await page.evaluate(()=>closeOrderDetail({preserveFocus:true}));
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await page.waitForTimeout(300); // Let the existing finite color transitions settle.
   const colors=await page.locator('.shipping-progress-badge').evaluateAll(nodes=>nodes.map(n=>({bg:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderColor,color:getComputedStyle(n).color})));
   if(new Set(colors.map(c=>c.bg)).size!==5)console.log(await page.evaluate(()=>{const n=document.querySelector('.shipping-progress-badge'),matches=[];function scan(rules){for(const r of rules){if(r.selectorText){try{if(n.matches(r.selectorText)&&(r.style.background||r.style.backgroundColor||r.style.animation))matches.push({selector:r.selectorText,style:r.style.cssText});}catch{}}if(r.cssRules)scan(r.cssRules);}}for(const sheet of document.styleSheets){try{scan(sheet.cssRules);}catch{}}return {matches,animation:getComputedStyle(n).animationName,variable:getComputedStyle(n).getPropertyValue('--shipping-color'),inline:n.getAttribute('style')};}));
   assert.equal(new Set(colors.map(c=>c.bg)).size,5,'preparation, issuance, registration, completion and failure are visually distinct');
   const failed=page.locator('.order-shipping-progress').nth(4);await failed.evaluate(n=>n.dataset.phase='PREPARE');assert.equal(await failed.locator('button').first().evaluate(n=>getComputedStyle(n).color),colors[4].color,'failure color has priority over the phase in both themes');await failed.evaluate(n=>n.dataset.phase='REGISTER');
   await page.locator('#order-search').focus();const focus=await page.locator('.search-field:has(#order-search)').evaluate(n=>({border:getComputedStyle(n).borderTopWidth,shadow:getComputedStyle(n).boxShadow,inputOutline:getComputedStyle(n.querySelector('input')).outlineStyle,overflow:n.scrollWidth>n.clientWidth}));assert.equal(focus.border,'1px');assert.equal(focus.shadow,'none');assert.equal(focus.inputOutline,'none');assert.equal(focus.overflow,false);
   await page.screenshot({path:path.join(output,theme+'-orders.png')});
   const complete=page.locator('.order-shipping-progress').nth(3);await complete.locator('.shipping-progress-badge').click();
   const completePopover=await complete.locator('.shipping-progress-detail').evaluate(n=>getComputedStyle(n).borderColor);await complete.locator('.shipping-progress-badge').click();
   const issue=page.locator('.order-shipping-progress').nth(1);await issue.locator('.shipping-progress-badge').click();assert.notEqual(await issue.locator('.shipping-progress-detail').evaluate(n=>getComputedStyle(n).borderColor),completePopover);await issue.locator('.shipping-progress-badge').click();
   await page.locator('.order-row').nth(3).click();
   await page.evaluate(()=>showOrderDetail(displayedOrders[3],document.querySelectorAll('.order-row')[3],{preserveFocus:true}));
   const badge=page.locator('#order-detail .detail-status-badge');assert.equal(await badge.getAttribute('data-state'),'REGISTERED');assert.equal(await badge.evaluate(n=>getComputedStyle(n).color),colors[3].color);
   await page.locator('#order-detail').screenshot({path:path.join(output,theme+'-registered-detail.png')});
  }
  console.log(JSON.stringify({status:'PASS',themes:2,distinctStates:5,wholeFieldThinFocus:true,popoverColors:true,registeredDetailColor:true,realWrites:0}));
 }catch(e){console.error(e);throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
