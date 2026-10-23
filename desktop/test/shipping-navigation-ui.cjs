'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const { _electron }=require('playwright'),fs=require('node:fs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'isolated-bootstrap.cjs')],timeout:90000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/Temp/shipping-navigation-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  console.log('navigation: launched');const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForLoadState('domcontentloaded',{timeout:120000});
  console.log('navigation: loaded');await page.evaluate(()=>runHubAction('disconnect'));console.log('navigation: disconnected');
  await app.evaluate(({ipcMain,session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   globalThis.jobCalls=0;
   ipcMain.removeHandler('moaon-hub:read-overview');ipcMain.handle('moaon-hub:read-overview',()=>({status:'READY',scopes:{}}));
   ipcMain.removeHandler('moaon-hub:issue-and-register');
   ipcMain.handle('moaon-hub:issue-and-register',(_e,ids)=>{globalThis.jobCalls++;return new Promise(resolve=>{globalThis.finishJob=()=>resolve({status:'PARTIAL',results:ids.map(hubOrderId=>({hubOrderId,phase:'REGISTER',status:'PENDING'}))});});});
  });
  await page.evaluate(()=>{
   applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:2,offset:0,checkedAt:new Date().toISOString(),orders:[1,2].map(i=>({hubOrderId:`HR-C24-0000000${i}`,platform:'CAFE24',productName:`탭 이동 시험 ${i}`,stage:'PREPARING',quantity:1,amount:1000,issueAndRegisterEligible:true,details:{receiver:{name:'시험',contact:'01000000000',postCode:'12345',address:'시험 주소'}}}))});
   showRoute('orders');
  });
  const first=page.locator('.order-row[data-order-id="HR-C24-00000001"]');
  const second=page.locator('.order-row[data-order-id="HR-C24-00000002"]');
  await first.click();await second.click();await first.click();
  assert.deepEqual(await page.evaluate(()=>[...selectedOrderIds]),['HR-C24-00000002']);
  assert.equal(await page.locator('.order-select:checked').count(),1);
  await first.click();
  assert.equal(await page.locator('.order-select:checked').count(),2);
  await page.evaluate(()=>{void runAutomaticShipping();
  });
  console.log('navigation: seeded');await page.waitForFunction(()=>registrationBusy);
  const generation=await page.evaluate(()=>actionGeneration);
  for(const route of ['settings','calendar','assistant','orders']){console.log('navigation: '+route);
   await page.locator(`[data-route="${route}"]`).first().evaluate(button=>button.click());
   assert.equal(await page.evaluate(()=>registrationBusy),true);
   assert.equal(await page.locator('#shipping-job-notice').isVisible(),true,JSON.stringify(await page.evaluate(()=>({mode:displayMode,gate:document.querySelector('#entry-screen').hidden,shell:document.querySelector('.preview-shell').hidden,notice:shippingJobNotice.outerHTML,main:getComputedStyle(document.getElementById('main-content')).display}))));
   assert.equal(await page.evaluate(()=>actionGeneration),generation);
  }
  await page.evaluate(()=>runHubAction('viewRegistered'));
  assert.equal(await page.evaluate(()=>actionGeneration),generation);
  assert.equal(await page.evaluate(()=>selectedScope),'ACTIVE');
  await page.locator('[data-route="settings"]').first().evaluate(button=>button.click());
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.send('moaon-hub:shipping-progress',{hubOrderId:'HR-C24-00000001',phase:'ISSUE',status:'PENDING'});});
  await app.evaluate(()=>globalThis.finishJob());
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await app.evaluate(()=>globalThis.jobCalls),1);
  assert.equal(await page.locator('[data-page="settings"]').isVisible(),true);
  assert.match(await page.locator('#shipping-job-notice').textContent(),/처리 종료/);
  await page.locator('#shipping-job-notice').getByRole('button',{name:'발급 진행 보기'}).click();
  assert.equal(await page.locator('#auto-shipping-results .auto-shipping-item').count(),2);
  assert.match(await page.locator('#auto-shipping-results').textContent(),/처리 대기/);
  await page.evaluate(()=>{
   selectedOrderIds.clear();
   applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:12,offset:0,checkedAt:new Date().toISOString(),orders:Array.from({length:12},(_,i)=>({hubOrderId:`HR-NV-${String(i+1).padStart(8,'0')}`,platform:'NAVER',productName:`네이버 안내 시험 상품 ${i+1} · 긴 상품명과 옵션 확인`,stage:'PREPARING',quantity:1,amount:1000,issueAndRegisterEligible:false,preflight:{codes:['NAVER_ROUTE']}}))});
   displayedOrders.forEach(o=>selectedOrderIds.add(o.hubOrderId));renderSelection();
  });
  assert.equal(await page.locator('#selection-reason-detail').isVisible(),false);
  assert.ok((await page.locator('#selection-block-reason').boundingBox()).height<90);
  await page.locator('#selection-reason-toggle').click();
  assert.equal(await page.locator('.selection-reason-item').count(),1);
  assert.ok((await page.locator('#selection-reason-detail').boundingBox()).height<=221);
  await page.screenshot({path:'D:/GPT/Temp/selection-notice-expanded.png'});
  await page.locator('#selection-reason-toggle').click();
  await page.screenshot({path:'D:/GPT/Temp/selection-notice-compact.png'});
  await page.locator('#selection-reason-close').click();
  assert.equal(await page.locator('#selection-block-reason').isVisible(),false);
  await page.locator('#selection-reason-reopen').click();
  assert.equal(await page.locator('#selection-block-reason').isVisible(),true);
  await app.evaluate(({ipcMain})=>{
   const page=(scope,cached=false)=>({status:'READY',cached,scope,channel:'ALL',offset:0,total:1,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',productName:scope==='ACTIVE'?'복원 주문':'대기 주문',stage:'PREPARING',quantity:1,amount:1000}]});
   for(const [name,handler] of [['view-registered',()=>page('REGISTER')],['view-active',()=>page('ACTIVE',true)],['check-order-freshness',()=>({status:'CHANGED',checkedAt:new Date().toISOString()})],['refresh',()=>({...page('ACTIVE'),total:2,orders:[...page('ACTIVE').orders,{...page('ACTIVE').orders[0],hubOrderId:'HR-C24-BBBBBBBB',productName:'새 주문'}]})]]){ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,handler);}
  });
  await page.evaluate(()=>{selectedOrderIds.clear();orderSearch.value='';closeOrderDetail();document.getElementById('main-content').scrollTop=140;});
  await page.evaluate(()=>runHubAction('viewRegistered'));
  await page.evaluate(()=>runHubAction('viewActive'));
  assert.match(await page.locator('#order-list').textContent(),/복원 주문/);
  await page.evaluate(()=>{selectedOrderIds.add('HR-C24-AAAAAAAA');renderSelection();});
  await page.evaluate(()=>checkVisibleOrderFreshness());
  assert.equal(await page.evaluate(()=>freshnessChanged),true);
  await page.evaluate(()=>{selectedOrderIds.clear();closeOrderDetail();document.getElementById('main-content').scrollTop=0;});
  await page.evaluate(()=>checkVisibleOrderFreshness());
  await page.waitForFunction(()=>displayedOrders.length===2);
  assert.equal(await page.evaluate(()=>freshnessChanged),false);
  await page.evaluate(()=>clearDisplayedOrders('connecting','주문을 불러오고 있어요.'));
  assert.equal(await page.locator('#order-empty').getAttribute('aria-busy'),'true');
  await page.screenshot({path:'D:/GPT/Temp/order-loading-animated.png'});
  console.log(JSON.stringify({status:'PASS',navigationDuringJob:true,resultRetained:true,duplicateCalls:false,realWrites:false}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

