'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
const unified=require('../../lib/orders/unified-orders'),adapter=require('../../lib/ui/phase28-adapters/orders'),{projectOrdersPayload}=require('../hub-connection.cjs');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/tracking-stages-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>returnToSample());await page.waitForTimeout(1000);
  await page.evaluate(()=>{checkVisibleOrderFreshness=async()=>{};refreshOverview=async()=>{};window.applyTrackingFixture=applyHubResult;applyHubResult=()=>{};document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;showRoute('orders');});
  for(const [code,scope,label] of [['ACCEPTED','REGISTER','배송대기중'],['IN_TRANSIT','IN_TRANSIT','배송중'],['DELIVERED','COMPLETED','배송완료']]){
   const id=unified.hubOrderId('CAFE24','UI-TRACKING');
   const center=unified.buildUnifiedOrders({asOf:new Date().toISOString(),cafe24Orders:[{order_id:'UI-TRACKING',order_date:new Date().toISOString(),raw_data:{tracking_no:'1234567890123'}}],cafe24OrderItems:[{order_id:'UI-TRACKING',external_item_id:'I',product_name:'배송 분류 자동 검증용 · 실제 주문 아님',quantity:1,raw_data:{order_status:'N30'}}],trackingStates:{[id]:{status:'SUCCESS',statusCode:code,trackingNo:'1234567890123'}}});
   const server=adapter.buildOrderPage(center.orders,[],{stage:scope});
   const projected=projectOrdersPayload({ok:true,partial:false,...server},new Date().toISOString(),{scope});
   await page.evaluate(result=>{closeOrderDetail();window.applyTrackingFixture({...result,channel:'ALL'});showRoute('orders');},projected);
   const row=page.locator('.order-row').first();await row.waitFor({state:'visible'});assert.equal(await page.locator('.order-row').count(),1);assert.match(await row.innerText(),new RegExp(label));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`D:/GPT/tmp/tracking-stage-${scope}.png`});
  }
  console.log('PASS: installed isolated UI renders carrier-based waiting, moving and delivered pages; no live writes');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
