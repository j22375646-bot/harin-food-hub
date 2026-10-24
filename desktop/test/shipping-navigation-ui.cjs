'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const { _electron }=require('playwright'),fs=require('node:fs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'isolated-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/Temp/shipping-navigation-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  console.log('navigation: launched');const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.waitForLoadState('domcontentloaded',{timeout:120000});
  console.log('navigation: loaded');await page.evaluate(()=>runHubAction('disconnect'));console.log('navigation: disconnected');
  await app.evaluate(({ipcMain,session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   globalThis.jobCalls=0;
   ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',(_event,ids)=>({status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items:ids.map(hubOrderId=>({hubOrderId,platform:'CAFE24',phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null}))}}));
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
  assert.equal(await page.locator('.order-shipping-progress:not([hidden])').count(),2,'Each selected order must own an inline badge');
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
  await app.evaluate(({BrowserWindow})=>{
   BrowserWindow.getAllWindows()[0].webContents.send('moaon-hub:shipping-progress',{hubOrderId:'HR-C24-00000001',phase:'ISSUE',status:'RUNNING'});
   BrowserWindow.getAllWindows()[0].webContents.send('moaon-hub:shipping-progress',{hubOrderId:'HR-C24-00000002',phase:'REGISTER',status:'PENDING'});
  });
  await page.locator('#shipping-job-notice').getByRole('button',{name:'발급 진행 보기'}).click();
  assert.equal(await page.locator('#shipping-progress-board').count(),0);
  assert.equal(await page.locator('.order-shipping-progress[open]').count(),1);
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=REGISTERED]').count(),0);
  const inline=page.locator('.order-shipping-progress[data-progress-state=RUNNING]');
  assert.match(await inline.locator('summary').textContent(),/우체국 송장 발급 중/);
  assert.equal(await inline.getAttribute('data-tone'),'active');
  const selectedBefore=await page.evaluate(()=>[...selectedOrderIds]);
  await inline.locator('summary').click();
  assert.deepEqual(await page.evaluate(()=>[...selectedOrderIds]),selectedBefore);
  assert.equal(await inline.locator('button').evaluate(button=>Boolean(button.closest('button.order-row'))),false);
  await page.evaluate(()=>{globalThis.progressOriginalNow=Date.now;Date.now=()=>progressOriginalNow()+46000;});
  await page.waitForFunction(()=>document.querySelector('.order-shipping-progress[data-progress-state=RUNNING] .shipping-progress-reason')?.textContent.includes('새 상태'));
  assert.equal(await inline.getAttribute('data-tone'),'attention');
  assert.match(await inline.locator('summary').textContent(),/응답 확인 필요/);
  assert.equal(await inline.locator('summary>i').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.screenshot({path:'D:/GPT/Temp/inline-shipping-active.png'});
  assert.match(await page.locator('#shipping-job-notice').textContent(),/등록 완료 0건/);
  await page.screenshot({path:'D:/GPT/Temp/shipping-progress-active.png'});
  await page.evaluate(()=>{Date.now=progressOriginalNow;delete globalThis.progressOriginalNow;});
  await page.locator('[data-route="settings"]').first().evaluate(button=>button.click());
  await app.evaluate(()=>globalThis.finishJob());
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await app.evaluate(()=>globalThis.jobCalls),1);
  assert.equal(await page.locator('[data-page="settings"]').isVisible(),true);
  assert.match(await page.locator('#shipping-job-notice').textContent(),/이번 확인 종료/);
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=PENDING]').count(),2);
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=REGISTERED]').count(),0);
  await page.locator('#shipping-job-notice').getByRole('button',{name:'발급 진행 보기'}).click();
  assert.equal(await page.locator('#auto-shipping-results').isVisible(),false);
  await page.evaluate(()=>window.moaonShippingProgress.poll());
  assert.match(await page.locator('.order-shipping-progress').first().textContent(),/상태 조회 확인 필요/);
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=PENDING]').count(),2,'Unknown server records retain the last local phase');
  assert.match(await page.locator('.order-shipping-progress').first().locator('summary').textContent(),/Cafe24/);
  await page.evaluate(()=>renderOrders());
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=PENDING]').count(),2,'Row reconstruction retains progress');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const badge=page.locator('.order-shipping-progress').first();
   assert.ok((await badge.boundingBox()).height<44,'Collapsed badge stays compact');
   await badge.locator('summary').click();
   const before=await page.evaluate(()=>[...selectedOrderIds]);
   await badge.getByRole('button',{name:'주문 상세 확인'}).click();
   assert.deepEqual(await page.evaluate(()=>[...selectedOrderIds]),before);
   await badge.locator('summary').click();
   await page.screenshot({path:`D:/GPT/Temp/inline-shipping-${theme}.png`});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  // The following assertions isolate Main event colours from the missing-record fixture above.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:shipping-progress-read');ipcMain.handle('moaon-hub:shipping-progress-read',()=>({status:'BUSY'}));});
  await page.evaluate(()=>{
   window.moaonShippingProgress.start(displayedOrders.map(order=>({id:order.hubOrderId,platform:order.platform})),text=>setShippingJobNotice(text,true));
   window.moaonShippingProgress.update({hubOrderId:'HR-C24-00000001',phase:'REGISTER',status:'RUNNING'});
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.order-shipping-progress[data-progress-state=RUNNING] summary>i').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>window.moaonShippingProgress.finish({status:'PARTIAL',results:[{hubOrderId:'HR-C24-00000001',phase:'REGISTER',status:'REGISTERED'},{hubOrderId:'HR-C24-00000002',phase:'ISSUE',status:'FAILED'}]}));
  assert.equal(await page.locator('.order-shipping-progress[data-tone=complete]').count(),1);
  assert.equal(await page.locator('.order-shipping-progress[data-tone=error]').count(),1);
  assert.match(await page.locator('.order-shipping-progress[data-tone=complete] summary').textContent(),/Cafe24 송장 등록 완료/);
  assert.match(await page.locator('.order-shipping-progress[data-tone=error] summary').textContent(),/우체국 송장 발급 실패/);
  await page.waitForFunction(()=>{
   const details=document.querySelector('.order-shipping-progress[data-tone=complete]'),probe=document.createElement('span');
   probe.style.color='var(--mint)';details.append(probe);
   const expected=getComputedStyle(probe).color;probe.remove();
   return getComputedStyle(details.querySelector('summary')).color===expected;
  });
  await page.screenshot({path:'D:/GPT/Temp/inline-shipping-mixed.png'});
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
   for(const [name,handler] of [['view-registered',()=>page('REGISTER')],['view-active',()=>page('ACTIVE',true)],['check-order-freshness',()=>({status:'CHANGED',scopeTotals:{ACTIVE:2,REGISTER:1,IN_TRANSIT:3,COMPLETED:4},checkedAt:new Date().toISOString()})],['refresh',()=>({...page('ACTIVE'),total:2,orders:[...page('ACTIVE').orders,{...page('ACTIVE').orders[0],hubOrderId:'HR-C24-BBBBBBBB',productName:'새 주문'}]})]]){ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,handler);}
  });
  await page.evaluate(()=>{selectedOrderIds.clear();orderSearch.value='';closeOrderDetail();document.getElementById('main-content').scrollTop=140;});
  await page.evaluate(()=>runHubAction('viewRegistered'));
  await page.evaluate(()=>runHubAction('viewActive'));
  assert.match(await page.locator('#order-list').textContent(),/복원 주문/);
  await page.evaluate(()=>{selectedOrderIds.add('HR-C24-AAAAAAAA');renderSelection();});
  await page.evaluate(()=>checkVisibleOrderFreshness());
  assert.equal(await page.evaluate(()=>freshnessChanged),true);
  assert.match(await page.locator('[data-action=hub-viewInTransit]').textContent(),/3건/);
  await page.evaluate(()=>{selectedOrderIds.clear();closeOrderDetail();document.getElementById('main-content').scrollTop=0;});
  await page.evaluate(()=>checkVisibleOrderFreshness());
  await page.waitForFunction(()=>displayedOrders.length===2);
  assert.equal(await page.evaluate(()=>freshnessChanged),false);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:refresh');ipcMain.handle('moaon-hub:refresh',()=>new Promise(resolve=>{globalThis.finishRefresh=resolve;}));});
  const beforeRefresh=await page.evaluate(()=>{selectedOrderIds.add('HR-C24-AAAAAAAA');orderSearch.value='복원';orderSort.value='DEFAULT';renderOrders();return displayedOrders.map(o=>o.hubOrderId);});
  await page.evaluate(()=>{void runHubAction('refresh');});
  await page.waitForFunction(()=>scopeTransitionBusy);
  assert.deepEqual(await page.evaluate(()=>displayedOrders.map(o=>o.hubOrderId)),beforeRefresh);
  await app.evaluate(()=>globalThis.finishRefresh({status:'UNAVAILABLE'}));
  await page.waitForFunction(()=>!scopeTransitionBusy);
  assert.deepEqual(await page.evaluate(()=>displayedOrders.map(o=>o.hubOrderId)),beforeRefresh);
  assert.equal(await page.evaluate(()=>selectedOrderIds.has('HR-C24-AAAAAAAA')),true);
  assert.equal(await page.evaluate(()=>orderSearch.value),'복원');
  assert.equal(await page.locator('#selection-auto-ship').isDisabled(),true);
  assert.equal(await page.evaluate(()=>orderReadUnverified),true);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:refresh');ipcMain.handle('moaon-hub:refresh',()=>({status:'READY',scope:'ACTIVE',channel:'ALL',offset:0,total:1,orders:[{hubOrderId:'HR-C24-AAAAAAAA',platform:'CAFE24',productName:'복원 주문',stage:'PREPARING',quantity:1,amount:2000}],checkedAt:new Date().toISOString()}));});
  await page.evaluate(()=>runHubAction('refresh'));
  assert.equal(await page.evaluate(()=>orderReadUnverified),false);
  assert.equal(await page.evaluate(()=>selectedOrderIds.has('HR-C24-AAAAAAAA')),true);
  assert.equal(await page.evaluate(()=>orderSearch.value),'복원');
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;orderSearch.value='';renderOrders();},theme);
   const style=await page.locator('#shipping-job-notice button').first().evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,border:s.borderStyle,font:s.fontSize};});
   assert.equal(style.radius,'11px');assert.equal(style.border,'solid');assert.equal(style.font,'14px');
   await page.screenshot({path:`D:/GPT/Temp/order-buttons-${theme}.png`});
  }
  await page.evaluate(()=>clearDisplayedOrders('connecting','주문을 불러오고 있어요.'));
  assert.equal(await page.locator('#order-empty').getAttribute('aria-busy'),'true');
  await page.screenshot({path:'D:/GPT/Temp/order-loading-animated.png'});
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:refresh');ipcMain.handle('moaon-hub:refresh',()=>({status:'LOGIN_REQUIRED'}));});
  await page.evaluate(()=>runHubAction('refresh'));
  assert.equal(await page.evaluate(()=>displayedOrders.length),0);
  assert.equal(await page.locator('.order-shipping-progress:not([hidden])').count(),0);
  console.log(JSON.stringify({status:'PASS',navigationDuringJob:true,resultRetained:true,duplicateCalls:false,realWrites:false}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

