'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-auto-sync-217';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 let page;try{
  page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>console.log('renderer-error: '+e.message));await page.waitForLoadState('domcontentloaded');await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.autoFixture={version:1,mode:'CHANGED',refresh:'PENDING',reads:0,refreshes:0};
   const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
   replace('read-order-collection',()=>({status:'SUCCESS',phase:'FINISHED',changeVersion:globalThis.autoFixture.version,canCollect:true,canCheck:false,verifiedTerminal:true,channels:Object.fromEntries(['cafe24','naver','coupang'].map(k=>[k,{status:'SUCCESS',observedAt:new Date().toISOString()}]))}));
   replace('check-order-freshness',()=>{globalThis.autoFixture.reads++;return {status:globalThis.autoFixture.mode,checkedAt:new Date().toISOString()};});
   replace('refresh',async()=>{globalThis.autoFixture.refreshes++;if(globalThis.autoFixture.refresh==='FAIL')return {status:'UNAVAILABLE',orders:[]};await new Promise(r=>setTimeout(r,800));globalThis.autoFixture.mode='CURRENT';globalThis.autoFixture.returned=true;return globalThis.autoFixture.page;});
  });
  await page.evaluate(()=>{
   const order=n=>({hubOrderId:'HR-C24-'+String(n).padStart(8,'0'),platform:'CAFE24',productName:n===1?'기존 주문 · 격리 시험':'새 주문 · 격리 시험',stage:'PAID',quantity:1,amount:10000,details:{receiver:{name:'검증',address:'시험 주소',contact:'01000000000',postCode:'12345'}}});
   window.syncFixturePage={status:'READY',scope:'ACTIVE',channel:'ALL',offset:0,total:1,orders:[order(1)],checkedAt:new Date().toISOString()};window.newSyncOrder=order(2);
   applyHubResult(syncFixturePage);showRoute('orders');clearTimeout(deliveryPreparationTimer);window.pollOnce=pollCollection;pollCollection=async()=>{};document.activeElement?.blur();selectedOrderIds.add(orderId(displayedOrders[0]));registrationBusy=true;renderSelection();
  });
  await page.evaluate(()=>pollOnce());assert.equal((await app.evaluate(()=>globalThis.autoFixture)).refreshes,0);assert.equal(await page.evaluate(()=>collectionFlow),'DEFERRED');
  await page.evaluate(()=>{registrationBusy=false;return pollOnce();});assert.equal((await app.evaluate(()=>globalThis.autoFixture)).refreshes,0,'A selected order must defer automatic replacement');
  const next=await page.evaluate(()=>({...syncFixturePage,total:2,orders:[newSyncOrder,...syncFixturePage.orders]}));
  await app.evaluate((_electron,value)=>globalThis.autoFixture.page=value,next);
  await page.evaluate(()=>{selectedOrderIds.clear();renderSelection();void pollOnce();});await page.waitForFunction(()=>freshnessReloadBusy);
  assert.equal(await page.locator('.order-row').count(),1,'Current orders remain visible while the fresh page is loading');
  await page.waitForFunction(()=>!freshnessReloadBusy);await page.evaluate(()=>pollOnce());await page.waitForFunction(()=>collectionAppliedVersion===1&&!collectionSyncBusy);assert.equal(await page.locator('.order-row').count(),2);assert.match(await page.locator('#order-freshness-status').textContent(),/새 주문 1건 자동 반영/);
  await app.evaluate(()=>{globalThis.autoFixture.version=2;globalThis.autoFixture.mode='BUSY';});await page.evaluate(()=>pollOnce());assert.equal(await page.evaluate(()=>collectionAppliedVersion),1,'BUSY cannot be accepted as applied merely because the prior page was current');
  await app.evaluate(()=>globalThis.autoFixture.mode='CURRENT');await page.evaluate(()=>pollOnce());assert.equal(await page.evaluate(()=>collectionAppliedVersion),2);
  await app.evaluate(()=>{globalThis.autoFixture.version=3;globalThis.autoFixture.mode='CHANGED';globalThis.autoFixture.refresh='FAIL';});await page.evaluate(()=>pollOnce());assert.equal(await page.locator('.order-row').count(),2);assert.equal(await page.evaluate(()=>collectionFlow),'ERROR');assert.equal(await page.evaluate(()=>collectionAppliedVersion),2);
  await app.evaluate(()=>globalThis.autoFixture.refresh='PENDING');await page.evaluate(()=>{void pollOnce();});await page.waitForFunction(()=>freshnessReloadBusy);await page.waitForFunction(()=>collectionAppliedVersion===3&&!collectionSyncBusy);
  assert.equal(await page.locator('#order-global-query').isDisabled(),false,'Search controls unlock after automatic application');await page.locator('#order-global-search-toggle').click();
  for(const theme of ['light','dark'])for(const width of [1440,1040,900]){
   await app.evaluate(({BrowserWindow},width)=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(800,720);w.setSize(width,900);},width);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const selector of ['#order-global-query','#order-global-start','#order-global-end','#order-channel']){
    await page.locator(selector).focus();const style=await page.locator(selector).evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),p=n.closest('form')?.getBoundingClientRect();return {outline:s.outlineStyle,border:s.borderTopWidth,shadow:s.boxShadow,inside:!p||r.left>=p.left-1&&r.right<=p.right+1};});assert.equal(style.outline,'none');assert.equal(style.border,'1px');assert.equal(style.shadow,'none');assert.equal(style.inside,true,selector+JSON.stringify(style));
   }
   assert.equal(await page.locator('#order-global-search-panel').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.match(await page.locator('.collection-chip').first().evaluate(n=>getComputedStyle(n,'::before').content),/✓/);
   await page.locator('#order-global-query').focus();await page.locator('.global-order-search').screenshot({path:path.join(output,theme+'-search-'+width+'.png')});
  }
  await page.evaluate(()=>{const note=document.getElementById('shipping-progress-sync');note.hidden=false;note.textContent='송장 상태 · 15시 30분 서버 확인';});
  const meta=await page.locator('.freshness-meta').evaluate(n=>{const a=n.querySelector('time'),b=n.querySelector('#shipping-progress-sync'),x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return {fontA:getComputedStyle(a).fontSize,fontB:getComputedStyle(b).fontSize,center:Math.abs(x.y+x.height/2-y.y-y.height/2),gap:y.left-x.right};});assert.equal(meta.fontA,meta.fontB);assert.ok(meta.center<=1&&meta.gap>=10,JSON.stringify(meta));
  await page.locator('#order-freshness').screenshot({path:path.join(output,'collection.png')});
  await page.evaluate(()=>{freshnessChanged=true;renderFreshness('CHANGED');});const outer=await page.locator('#order-freshness').evaluate(n=>({border:getComputedStyle(n).borderTopWidth,shadow:getComputedStyle(n).boxShadow,bg:getComputedStyle(n).backgroundColor}));assert.equal(outer.border,'0px');assert.equal(outer.shadow,'none');assert.equal(outer.bg,'rgba(0, 0, 0, 0)');
  await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.evaluate(()=>collectionPendingVersion),0);assert.equal(await page.evaluate(()=>collectionAppliedVersion),0);
  console.log(JSON.stringify({status:'PASS',chain:'collected → change check → automatic apply',busyAndSelectionDeferred:true,existingListRetainedWhileLoading:true,busyNotFalseSuccess:true,errorRetry:true,thinInsideFocus:true,noOverflow:true,themes:2,widths:[1440,1040,900],realOrderWrites:0,output}));
 }catch(e){console.log(JSON.stringify(await app.evaluate(()=>({reads:globalThis.autoFixture?.reads,refreshes:globalThis.autoFixture?.refreshes,returned:globalThis.autoFixture?.returned,hasPage:!!globalThis.autoFixture?.page,mode:globalThis.autoFixture?.mode})).catch(()=>({mainUnavailable:true}))));if(page)console.log(JSON.stringify(await page.evaluate(()=>({flow:collectionFlow,pending:collectionPendingVersion,applied:collectionAppliedVersion,syncBusy:collectionSyncBusy,loadBusy:freshnessReloadBusy,changed:freshnessChanged,unverified:orderReadUnverified,mode:displayMode,status:document.getElementById('order-freshness').dataset.status,orders:displayedOrders.length,generation:collectionGeneration,active:document.activeElement?.tagName})).catch(()=>({unavailable:true}))));throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
