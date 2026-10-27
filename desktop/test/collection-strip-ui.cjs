'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-collection-strip-215';fs.mkdirSync(output,{recursive:true});
 console.log('collection strip: starting isolated runtime');const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'},timeout:180000});
 try{
  console.log('collection strip: runtime launched');const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');console.log('collection strip: DOM ready');
  await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.stripState={status:'IDLE',phase:'IDLE',canCollect:true,channels:{}};globalThis.stripCalls={post:0,check:0,refresh:0};globalThis.stripReadMode='fail';
   const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
   replace('read-order-collection',()=>globalThis.stripState);
   replace('collect-orders',()=>{globalThis.stripCalls.post++;globalThis.stripState={status:'PENDING',phase:'REQUESTING',busy:true,canCollect:false,channels:{}};return new Promise(r=>globalThis.finishStrip=r);});
   replace('check-order-collection',()=>{globalThis.stripCalls.check++;return globalThis.stripState;});
   replace('read-delivery',()=>new Promise(r=>globalThis.finishDelivery=r));
   replace('recheck-page',()=>({status:globalThis.stripReadMode==='snapshot'?'SNAPSHOT_CHANGED':'UNAVAILABLE',orders:[]}));
   replace('refresh',()=>{globalThis.stripCalls.refresh++;return {status:'UNAVAILABLE',orders:[]};});
  });
  const show=()=>page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'자동 검증용 작두콩차 · 실제 주문 아님',stage:'PAID',quantity:1,amount:10000,preflight:{status:'REVIEW_ONLY'},details:{receiver:{}}}]});showRoute('orders');clearTimeout(deliveryPreparationTimer);});
  await show();
  await page.evaluate(()=>{selectedOrderIds.add('HR-C24-00000001');renderSelection();void prepareSelectedDelivery(true);});
  await page.waitForFunction(()=>deliveryPreparationBusy);assert.equal(await page.locator('.order-row').count(),1);
  await app.evaluate(()=>globalThis.finishDelivery({status:'READY',receiver:{name:'검증',contact:'01000000000',postCode:'12345',address:'시험 주소'}}));
  await page.waitForFunction(()=>!freshnessReloadBusy&&orderReadUnverified);
  assert.equal(await page.locator('.order-row').count(),1,'Failed delivery recheck must retain visible order');
  assert.equal(await page.evaluate(()=>selectedOrderIds.size),1);assert.equal(await page.locator('#selection-auto-ship').isDisabled(),true);assert.equal(await page.locator('#order-freshness-reload').isVisible(),true);
  await show();await app.evaluate(()=>globalThis.stripReadMode='snapshot');await page.evaluate(()=>recheckShippingSelection());
  assert.equal(await page.locator('.order-row').count(),1,'Changed snapshot plus unavailable fresh read must retain order');assert.equal((await app.evaluate(()=>globalThis.stripCalls)).refresh,1);
  await show();await page.locator('#collect-orders').click();
  await app.evaluate(()=>{globalThis.stripState={status:'PENDING',phase:'WAITING',canCollect:false,canCheck:true,channels:{cafe24:{status:'SUCCESS'},naver:{status:'PENDING'},coupang:{status:'RUNNING'}}};globalThis.finishStrip(globalThis.stripState);});
  await page.waitForFunction(()=>!collectionBusy);await page.evaluate(()=>{collectionCheckAt=Date.now();return pollCollection();});
  assert.match(await page.locator('#collection-channels').textContent(),/Cafe24 · 완료/);assert.equal(await page.locator('#order-collection').getAttribute('data-phase'),'WAITING');
  assert.equal(await page.locator('#order-collection').evaluate(n=>n.closest('#order-freshness')!==null),true);
  assert.equal(await page.locator('#collection-message').isVisible(),true,'Existing header CSS must not hide the stage label');assert.ok((await page.locator('#collection-message').boundingBox()).width>=180);
  assert.equal(await page.locator('#collection-message').evaluate(n=>getComputedStyle(n).textAlign),'left');
  const chipSizes=await page.locator('.collection-chip').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.equal(chipSizes.length,3);assert.ok(Math.max(...chipSizes.map(n=>n.w))-Math.min(...chipSizes.map(n=>n.w))<=1);assert.ok(chipSizes.every(n=>n.h===chipSizes[0].h&&n.h>=32));
  const buttonSizes=await page.locator('.collection-controls button:visible').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,minHeight:getComputedStyle(n).minHeight})));console.log(JSON.stringify({buttonSizes}));assert.ok(buttonSizes.every(n=>Math.abs(n.w-120)<1&&Math.abs(n.h-32)<1),JSON.stringify(buttonSizes));
  const colors=[];
  for(const [phase,status] of [['AUTHORIZING','PENDING'],['REQUESTING','PENDING'],['WAITING','PENDING'],['FINISHED','SUCCESS'],['ATTENTION','CHECK_REQUIRED']]){
   await page.evaluate(({phase,status})=>{collectionState={...collectionState,phase,status,reason:phase==='ATTENTION'?'TIMEOUT':null};renderCollection();},{phase,status});colors.push(await page.locator('#collection-message').evaluate(n=>getComputedStyle(n).color));
  }
  assert.ok(new Set(colors).size>=4,'Connection, collecting, complete and error colors differ');
  await page.evaluate(()=>{collectionState={...collectionState,phase:'WAITING',status:'PENDING',reason:null};renderCollection();});
  assert.notEqual(await page.locator('.collection-motion').evaluate(n=>getComputedStyle(n).animationName),'none');
  for(const theme of ['dark','light']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.locator('#order-freshness').screenshot({path:path.join(output,theme+'.png')});assert.equal(await page.locator('#order-freshness').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);}
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.collection-motion').evaluate(n=>getComputedStyle(n).animationName),'none');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal((await app.evaluate(()=>globalThis.stripCalls)).post,1,'Status reads cannot duplicate collection POST');
  await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.locator('#order-collection').isVisible(),false);
  console.log(JSON.stringify({status:'PASS',scope:'visible right; isolated fixtures; delivery failure and snapshot fallback retain orders, selection and safe issuance gate; unified collection phases, colors, animation, themes, overflow, session reset',realOrderWrites:0,output}));
 }finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
