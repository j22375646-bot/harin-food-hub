'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-hover-stability-212';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>window.moaonHub.refresh());await page.emulateMedia({reducedMotion:'reduce'});
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',()=>({status:'BUSY'}));});
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'REGISTER',channel:'ALL',total:2,offset:0,checkedAt:new Date().toISOString(),orders:Array.from({length:2},(_,i)=>({hubOrderId:'HR-C24-'+String(i+1).padStart(8,'0'),platform:'CAFE24',productName:'호버 안정성 · 격리 시험 '+(i+1),stage:'WAITING_FOR_CARRIER',quantity:1,amount:1000,details:{invoice:{number:'123456789012'+i,status:'REGISTERED'}}}))});showRoute('orders');});
  const rows=page.locator('.order-row'),outside=page.locator('.orders-page h1').first();
  const geometry=()=>page.evaluate(()=>({rows:[...document.querySelectorAll('.order-item')].map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}),height:document.documentElement.scrollHeight,scroll:document.scrollingElement.scrollTop}));
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await outside.hover();const baseline=await geometry();
   for(let i=0;i<12;i++){await rows.nth(i%2).hover();assert.deepEqual(await geometry(),baseline,'hover must not move any order or alter scrolling');await outside.hover();assert.deepEqual(await geometry(),baseline);}
   await rows.first().hover();const state=await rows.first().evaluate(n=>({transform:getComputedStyle(n).transform,bottom:getComputedStyle(n).borderBottomWidth,line:getComputedStyle(n.closest('.order-item'),'::before').borderColor}));assert.equal(state.transform,'none');assert.equal(state.bottom,'1px');assert.match(state.line,/rgba\(0, 0, 0, 0\)|transparent/);
   await rows.first().click();assert.equal(await page.locator('.order-select').first().isChecked(),true);await rows.first().click();assert.equal(await page.locator('.order-select').first().isChecked(),false);await page.evaluate(()=>closeOrderDetail({preserveFocus:true}));
   await page.screenshot({path:path.join(output,theme+'-hover.png')});
  }
  console.log(JSON.stringify({status:'PASS',themes:2,hoverRoundTrips:24,zeroLayoutShift:true,noHoverOutline:true,selectionToggle:true,realWrites:0}));
 }catch(e){console.error(e);throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
