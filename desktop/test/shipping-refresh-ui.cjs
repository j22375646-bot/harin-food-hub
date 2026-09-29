'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),override:-1});
 try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await page.evaluate(()=>returnToSample());await page.waitForTimeout(500);
 const receiver={name:'조회 시험',address:'가상 주소',contact:'05012345678',postCode:'12345'};
 const order={hubOrderId:'HR-CP-1234ABCD',platform:'COUPANG',productName:'배송 조회 검증 · 실제 주문 아님',stage:'PAID',amount:10000,quantity:1,issueAndRegisterEligible:false,registrationEligible:false,preflight:{status:'CHECK_REQUIRED',route:'HUB',codes:['DELIVERY_INFO']},details:{items:[],receiver:{}}};
 const result={status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,checkedAt:new Date().toISOString(),orders:[order]};
 await app.evaluate(({ipcMain},{result,receiver})=>{
  ipcMain.removeHandler('moaon-hub:read-delivery');ipcMain.handle('moaon-hub:read-delivery',()=>({status:'READY',receiver}));
  globalThis.shippingRechecks=0;
  ipcMain.removeHandler('moaon-hub:recheck-page');ipcMain.handle('moaon-hub:recheck-page',()=>{globalThis.shippingRechecks++;return {...result,orders:result.orders.map(o=>({...o,issueAndRegisterEligible:true,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{...o.details,receiver}}))};});
 },{result,receiver});
 // Unrelated background CS/auth reads use an isolated, signed-out session.
 // Keep the real order renderer and recheck flow; only feed its order fixtures.
 await page.evaluate(()=>{const original=applyHubResult;applyHubResult=result=>{if(result?.status==='READY')return original(result);};});
 await page.evaluate(result=>{checkVisibleOrderFreshness=async()=>{};refreshOverview=async()=>{};businessLoaded=true;historyAutoLoaded=true;applyHubResult(result);showRoute('orders');showOrderDetail(displayedOrders[0]);},result);
 const automatic=page.locator('#order-detail').getByRole('button',{name:'자동 발급·등록',exact:true});
 await automatic.waitFor({timeout:7000});assert.equal(await automatic.isEnabled(),true,'server revalidation must unlock the eligible order after delivery lookup');
 assert.equal(await app.evaluate(()=>globalThis.shippingRechecks),1);
 await page.screenshot({path:'D:/GPT/tmp/shipping-refresh-ui.png'});
 // Even complete receiver information must not override a server refusal.
 await app.evaluate(({ipcMain},{result,receiver})=>{ipcMain.removeHandler('moaon-hub:recheck-page');ipcMain.handle('moaon-hub:recheck-page',()=>{globalThis.shippingRechecks++;return {...result,orders:result.orders.map(o=>({...o,preflight:{status:'CHECK_REQUIRED',route:'HUB',codes:['CANCELLED']},details:{...o.details,receiver}}))};});},{result,receiver});
 await page.evaluate(result=>{applyHubResult(result);showOrderDetail(displayedOrders[0]);},result);
 await page.waitForFunction(()=>displayedOrders[0]?.preflight?.codes.includes('CANCELLED'));
 assert.ok(await automatic.count()===0||!(await automatic.isEnabled()),'server safety block remains authoritative');
 assert.equal(await app.evaluate(()=>globalThis.shippingRechecks),2,'one recheck per detail load, never a loop');
 console.log('PASS: delivery lookup automatically revalidates server eligibility; no shipment executed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
