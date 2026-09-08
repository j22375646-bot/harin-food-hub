'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'배송정보 시험',stage:'PREPARING',amount:30000,quantity:1,issueAndRegisterEligible:true,registrationEligible:false,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{items:[],receiver:{name:'시험 고객',contact:'01000000000',postCode:'12345',address:'가상시 시험로 1',addressDetail:'101호',message:'<img src=x onerror=alert(1)>'}}}]}));
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  const delivery=page.getByRole('region',{name:'배송정보',exact:true});
  assert.match(await delivery.innerText(),/시험 고객/);assert.match(await delivery.innerText(),/가상시 시험로 1/);assert.match(await delivery.innerText(),/101호/);assert.match(await delivery.innerText(),/01000000000/);
  assert.equal(await delivery.locator('img').count(),0);
  await page.locator('#order-select-all').check();
  assert.equal(await page.locator('#selection-auto-ship').isVisible(),true);
  assert.equal(await page.locator('#selection-register').isVisible(),false);
  await page.getByText('추가 작업',{exact:true}).click();assert.equal(await page.locator('#selection-register').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#selection-register').isVisible(),false);
  await page.getByText('추가 작업',{exact:true}).click();await page.locator('#selection-review').click();
  assert.equal(await page.locator('#selection-register').isVisible(),false);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(__dirname,'../artifacts/p436-delivery.png')});
  await app.evaluate(({ipcMain})=>{globalThis.deliveryCalls=0;ipcMain.removeHandler('moaon-hub:read-delivery');ipcMain.handle('moaon-hub:read-delivery',()=>++globalThis.deliveryCalls===1?{status:'PENDING'}:{status:'READY',receiver:{name:'쿠팡 시험',address:'조회 주소',contact:'05012345678',postCode:'12345'}});});
  await page.evaluate(()=>{displayedOrders=Object.freeze(displayedOrders.map(order=>({...order,platform:'COUPANG',issueAndRegisterEligible:false,preflight:{status:'CHECK_REQUIRED',route:'HUB',codes:['DELIVERY_INFO']},details:{...order.details,receiver:{}}})));closeOrderDetail();renderOrders();});
  await page.locator('.order-row').first().click();
  const retry=page.getByRole('button',{name:'배송정보 다시 확인',exact:true});await retry.waitFor();
  await retry.click();await page.getByText('쿠팡 시험',{exact:true}).waitFor();
  assert.equal(await retry.isVisible(),false);assert.match(await delivery.innerText(),/05012345678/);
  assert.equal(await page.evaluate(()=>displayedOrders[0].issueAndRegisterEligible),false,'display-only detail cannot grant issuance permission');
  const recheck=page.getByRole('button',{name:'발급 조건 다시 확인',exact:true});
  assert.equal(await recheck.count(),1,'delivery success offers explicit server revalidation');
  const refreshed=await page.evaluate(()=>({...connectionResult,orders:displayedOrders.map(order=>({...order,issueAndRegisterEligible:true,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{...order.details,receiver:{name:'서버 확인 수취인',address:'서버 확인 주소',contact:'05012345678',postCode:'12345'}}}))}));
  await app.evaluate(({ipcMain},payload)=>{globalThis.recheckCalls=0;ipcMain.removeHandler('moaon-hub:recheck-page');ipcMain.handle('moaon-hub:recheck-page',()=>{globalThis.recheckCalls++;return payload;});},refreshed);
  await recheck.click();await page.getByText('서버 확인 수취인',{exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.recheckCalls),1);
  assert.equal(await page.locator('#order-detail').getByRole('button',{name:'자동 발급·등록',exact:true}).isEnabled(),true);
  for(const missing of ['contact','postCode']){
    await app.evaluate(({ipcMain})=>{globalThis.missingReads=0;ipcMain.removeHandler('moaon-hub:read-delivery');ipcMain.handle('moaon-hub:read-delivery',()=>{globalThis.missingReads++;return {status:'READY',receiver:{name:'부분 조회',address:'시험 주소',contact:'',postCode:''}};});});
    await page.evaluate(missing=>{displayedOrders=Object.freeze(displayedOrders.map(order=>({...order,issueAndRegisterEligible:false,details:{...order.details,receiver:{name:'시험',address:'시험 주소',contact:'01000000000',postCode:'12345',[missing]:' '}}})));closeOrderDetail();renderOrders();},missing);
    await page.locator('.order-row').first().click();
    await page.waitForTimeout(200);
    assert.equal(await app.evaluate(()=>globalThis.missingReads),1,`${missing} missing alone must trigger a read`);
    assert.equal(await retry.isVisible(),true,'partial READY response retains retry');
    assert.match(await delivery.innerText(),/필수 배송정보.*누락/);
    assert.equal(await recheck.count(),0,'incomplete read must not offer a success-only recheck action');
    const box=await retry.boundingBox();assert.ok(box.height>=32,'retry has an app-sized click target');
    assert.ok(await retry.evaluate(el=>parseFloat(getComputedStyle(el).borderRadius))>=8,'retry shares rounded app controls');
  }
  for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);await retry.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,`../artifacts/p454-delivery-${theme}.png`)});}
  await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.getByRole('region',{name:'배송정보',exact:true}).count(),0);
  console.log('PASS: delivery fields/text safety, compact primary action, secondary disclosure, small window, logout clearing');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
