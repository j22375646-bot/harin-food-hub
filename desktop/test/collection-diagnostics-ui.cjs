'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-diagnostics-218';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:read-order-collection');ipcMain.handle('moaon-hub:read-order-collection',()=>({status:'IDLE',phase:'IDLE',canCollect:true,channels:{}}));});
 await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',orders:[],total:0,offset:0,checkedAt:new Date().toISOString()});showRoute('orders');clearTimeout(deliveryPreparationTimer);pollCollection=async()=>{};});
 for(const theme of ['light','dark'])for(const width of [1440,1040,900]){
 await app.evaluate(({BrowserWindow},w)=>{const win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(800,720);win.setSize(w,900);},width);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const code of ['RATE_LIMITED','TIMEOUT','AUTH_EXPIRED','DATABASE_ERROR','WORKER_OFFLINE','NETWORK_ERROR','CS_PARTIAL','REQUEST_FAILED']){
 await page.evaluate(code=>{collectionFlow='IDLE';collectionState={status:'CHECK_REQUIRED',phase:'FINISHED',canCollect:true,canCheck:true,verifiedTerminal:true,checkedAt:new Date().toISOString(),channels:{cafe24:{status:code==='CS_PARTIAL'?'PARTIAL':'FAILED',code,httpStatus:code==='RATE_LIMITED'?429:undefined},naver:{status:'SUCCESS',code:'SUCCESS'},coupang:{status:'SUCCESS',code:'SUCCESS'}}};renderCollection();},code);
 const chip=page.locator('.collection-chip').first();assert.match(await chip.textContent(),new RegExp(code));assert.ok((await chip.getAttribute('title')).split('\n').length>=3);assert.equal(await page.locator('#collect-orders').isEnabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#collection-channels').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
 const heights=await page.locator('.collection-chip').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.ok(Math.max(...heights)-Math.min(...heights)<=1,JSON.stringify(heights));
 if(code==='CS_PARTIAL')assert.match(await chip.textContent(),/주문 완료/);
 if(code==='RATE_LIMITED')await page.locator('#order-freshness').screenshot({path:path.join(output,theme+'-'+width+'.png')});
 }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',codes:8,themes:2,widths:[1440,1040,900],retryEnabled:true,equalHeight:true,noOverflow:true,realOrderWrites:0,output}));
 }finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
