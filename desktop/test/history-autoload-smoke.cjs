'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.historyReads=0;
   for(const name of ['server-shipping-history','restore-shipping-history']){
    ipcMain.removeHandler('moaon-hub:'+name);
    ipcMain.handle('moaon-hub:'+name,async()=>{globalThis.historyReads++;return {status:globalThis.failHistory?'UNAVAILABLE':'READY',orders:[]};});
   }
  });
  const seed=()=>page.evaluate(()=>applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',orders:[],total:0}));
  await seed();await page.waitForTimeout(150);
  assert.equal(await app.evaluate(()=>globalThis.historyReads),2,'connection restores both histories automatically');
  await seed();await page.waitForTimeout(100);
  assert.equal(await app.evaluate(()=>globalThis.historyReads),2,'rerender does not repeat reads');
  assert.equal(await page.locator('#server-history-load').isVisible(),false);
  assert.equal(await page.locator('#shipping-history-load').isVisible(),false);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
  await page.evaluate(()=>{document.querySelector('#global-mode-badge').textContent='확인';document.querySelector('#global-connection-status').textContent='저장된 송장 발급 전 주문 첫 페이지를 조회하고 있습니다. 긴 상태 안내도 끝까지 표시합니다.';});
  const fit=await page.evaluate(()=>{const badge=document.querySelector('#global-mode-badge'),text=document.querySelector('#global-connection-status');return {badgeWrap:getComputedStyle(badge).whiteSpace,overflow:text.scrollWidth>text.clientWidth,ellipsis:getComputedStyle(text).textOverflow};});
  assert.equal(fit.badgeWrap,'nowrap');assert.equal(fit.overflow,false);assert.notEqual(fit.ellipsis,'ellipsis');
  await app.evaluate(()=>{globalThis.failHistory=true;});
  await page.evaluate(()=>applyHubResult({status:'LOGIN_REQUIRED'}));await seed();
  await page.waitForTimeout(150);
  assert.equal(await app.evaluate(()=>globalThis.historyReads),4,'new login retries histories');
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  assert.equal(await page.locator('#server-history-load').isVisible(),true,'failed read exposes retry');
  await app.evaluate(()=>{globalThis.failHistory=false;});
  await page.locator('#server-history-load').click();await page.waitForTimeout(100);
  assert.equal(await page.locator('#server-history-load').isVisible(),false,'successful retry clears recovery control');
  await app.evaluate(({ipcMain})=>{
   ipcMain.removeHandler('moaon-hub:server-shipping-history');
   ipcMain.handle('moaon-hub:server-shipping-history',()=>new Promise(resolve=>{globalThis.finishHistory=()=>resolve({status:'READY',orders:[{hubOrderId:'HR-C24-12345678',status:'REGISTERED'}]});}));
  });
  await page.evaluate(()=>applyHubResult({status:'LOGIN_REQUIRED'}));await seed();
  await page.waitForTimeout(100);
  await page.evaluate(()=>{actionGeneration++;});
  await app.evaluate(()=>globalThis.finishHistory());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#server-shipping-history').isVisible(),true,'order navigation must not discard session history');
  assert.match(await page.locator('#server-shipping-history').textContent(),/12345678/);
  await page.evaluate(()=>applyHubResult({status:'LOGIN_REQUIRED'}));await seed();await page.waitForTimeout(100);
  await page.evaluate(()=>applyHubResult({status:'LOGIN_REQUIRED'}));
  await app.evaluate(()=>globalThis.finishHistory());await page.waitForTimeout(100);
  assert.equal(await page.locator('#server-shipping-history').isVisible(),false,'logout discards late history');
  console.log('PASS: automatic history reads, navigation retention, retry and banner layout');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
