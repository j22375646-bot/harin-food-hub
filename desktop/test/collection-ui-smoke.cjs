'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.collections=0;globalThis.collectionChecks=0;
   ipcMain.removeHandler('moaon-hub:collect-orders');ipcMain.handle('moaon-hub:collect-orders',()=>{globalThis.collections++;return new Promise(resolve=>globalThis.finishCollection=resolve);});
   ipcMain.removeHandler('moaon-hub:check-order-collection');ipcMain.handle('moaon-hub:check-order-collection',()=>{globalThis.collectionChecks++;return {status:'SUCCESS',canCheck:true,canCollect:true,verifiedTerminal:true,channels:Object.fromEntries(['cafe24','naver','coupang'].map(k=>[k,{status:'SUCCESS',observedAt:'2026-09-09T00:00:00Z'}]))};});
  });
  const show=()=>page.evaluate(()=>applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,partial:false,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'수집 검증 주문',stage:'PAID',quantity:1,amount:30000,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{receiver:{}}}]}));
  await show();await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  const strip=page.locator('#order-collection');assert.equal(await strip.count(),1);
  await page.evaluate(()=>{selectedOrderIds.add('HR-C24-00000001');renderSelection();});
  await page.locator('#collect-orders').click();assert.equal(await page.locator('#collect-orders').isDisabled(),true);
  await app.evaluate(()=>globalThis.finishCollection({status:'PENDING',canCheck:true,canCollect:false,verifiedTerminal:false,channels:{cafe24:{status:'SUCCESS',observedAt:'2026-09-09T00:00:00Z'},naver:{status:'PENDING',observedAt:null},coupang:{status:'RUNNING',observedAt:null}}}));
  await page.locator('#check-order-collection').waitFor();await page.waitForFunction(()=>!document.querySelector('#check-order-collection').disabled);
  assert.equal(await page.locator('#collection-reload').isVisible(),false);assert.equal(await page.evaluate(()=>selectedOrderIds.has('HR-C24-00000001')),true);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.collection-controls strong').evaluate(el=>el.getBoundingClientRect().x>=document.querySelector('.orders-layout').getBoundingClientRect().x),true,'clicking collection must not scroll the workspace sideways');
  await page.screenshot({path:path.join(__dirname,'../artifacts/p448-collection-light.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:path.join(__dirname,'../artifacts/p448-collection-dark.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.locator('#check-order-collection').click();await page.locator('#collection-reload').waitFor();assert.equal(await app.evaluate(()=>globalThis.collections),1);assert.equal(await app.evaluate(()=>globalThis.collectionChecks),1);
  await page.evaluate(()=>{registrationBusy=true;renderSelection();});assert.equal(await page.locator('#collect-orders').isDisabled(),true);
  await page.evaluate(()=>{registrationBusy=false;renderSelection();});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
  await page.locator('.order-row').first().click();await page.waitForTimeout(350);
  assert.ok(await page.locator('#order-list').evaluate(el=>el.getBoundingClientRect().height)>=150,'minimum window with selected order and detail must retain useful list height');
  await page.evaluate(()=>{for(const id of ['auto-shipping-results','shipping-followup','server-shipping-history','registration-results']){const el=document.getElementById(id);el.hidden=false;if(el.tagName==='DETAILS')el.open=true;for(let i=0;i<8;i++){const p=document.createElement('p');p.textContent='최소 창 작업 결과';el.append(p);}}});
  assert.ok(await page.locator('#order-list').evaluate(el=>el.getBoundingClientRect().height)>=150,'expanded results must not collapse the minimum-window order list');
  for(const selector of ['#collect-orders','#check-order-collection','#collection-reload','#selection-clear','#server-history-load','#shipping-history-load']){
   await page.locator(selector).scrollIntoViewIfNeeded();
   assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&Boolean(hit&&(hit===el||el.contains(hit)));}),true,`${selector} remains reachable at the minimum window`);
  }
  await page.locator('#collect-orders').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'../artifacts/p448-collection-minimum.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#collect-orders').click();await page.evaluate(()=>runHubAction('disconnect'));await app.evaluate(()=>globalThis.finishCollection({status:'SUCCESS',canCollect:true,channels:{}}));await show();assert.equal(await page.locator('#collection-channels').textContent(),'');
  console.log('PASS: native collection clicks, pending, explicit reload, selection retained, busy gate, logout and width');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
