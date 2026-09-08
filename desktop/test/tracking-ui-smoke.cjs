'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain})=>{
   globalThis.trackingReads=0;globalThis.trackingRefreshes=0;
   ipcMain.removeHandler('moaon-hub:read-tracking');ipcMain.handle('moaon-hub:read-tracking',(_event,id)=>{if(id!=='HR-C24-00000001')throw Error('Wrong order');globalThis.trackingReads++;return {status:'READY',state:{status:globalThis.trackingReads===1?'IN_TRANSIT':'DELIVERED',checkedAt:'2026-09-09T12:00:00.000Z'}};});
   ipcMain.removeHandler('moaon-hub:refresh-tracking');ipcMain.handle('moaon-hub:refresh-tracking',()=>{globalThis.trackingRefreshes++;return {status:'PENDING'};});
  });
  await page.evaluate(()=>applyHubResult({status:'READY',scope:'IN_TRANSIT',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'배송추적 시험',stage:'IN_TRANSIT',quantity:1,amount:30000,preflight:{status:'BLOCKED',route:'HUB',codes:['SHIPPED']},details:{invoice:{status:'REGISTERED',number:'1234567890123'},receiver:{name:'시험',address:'시험 주소',contact:'01000000000',postCode:'12345'}}}]}));
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  const region=page.getByRole('region',{name:'우체국 배송추적',exact:true});
  assert.equal(await region.count(),1,'registered invoice must expose tracking controls');
  assert.equal(await app.evaluate(()=>globalThis.trackingReads),0,'opening detail does not poll');
  await region.getByRole('button',{name:'저장 추적 조회',exact:true}).click();
  await region.getByText('배송중',{exact:true}).waitFor();
  await region.getByRole('button',{name:'배송상태 갱신 요청',exact:true}).click();
  await region.getByText('조회 요청 접수 · 완료 아님',{exact:true}).waitFor();
  assert.equal(await region.getByRole('button',{name:'주문 목록 다시 조회',exact:true}).isVisible(),false,'pending is not verified delivery');
  assert.equal(await app.evaluate(()=>globalThis.trackingRefreshes),1);
  assert.equal(await page.evaluate(()=>displayedOrders[0].stage),'IN_TRANSIT','queued request never advances order stage');
  await region.getByRole('button',{name:'저장 추적 조회',exact:true}).click();await region.getByText('배송완료',{exact:true}).waitFor();
  assert.equal(await region.getByRole('button',{name:'주문 목록 다시 조회',exact:true}).isVisible(),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));
  await page.evaluate(()=>{for(const id of ['auto-shipping-results','shipping-followup','server-shipping-history','registration-results']){const el=document.getElementById(id);el.hidden=false;if(el.tagName==='DETAILS')el.open=true;for(let i=0;i<8;i++){const p=document.createElement('p');p.textContent='검증 결과 기록';el.append(p);}}});
  assert.ok(await page.locator('#order-list').evaluate(el=>el.getBoundingClientRect().height)>=150,'expanded results must leave room for orders');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(__dirname,'../artifacts/p446-tracking.png')});
  await page.evaluate(()=>{closeOrderDetail();displayedOrders=Object.freeze(displayedOrders.map(order=>({...order,details:{...order.details,invoice:{...order.details.invoice,status:'ISSUED'}}})));renderOrders();});
  await page.locator('.order-row').first().click();assert.equal(await region.count(),0,'unregistered invoices must not offer unsupported tracking actions');
  await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await region.count(),0);
  console.log('PASS: explicit tracking read/refresh, truthful pending, no stage mutation, compact results, logout');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
