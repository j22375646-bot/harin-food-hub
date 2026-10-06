'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron}=require('playwright');
const unified=require('../../lib/orders/unified-orders.js');
const adapter=require('../../lib/ui/phase28-adapters/orders.js');
(async()=>{
 const center=unified.buildUnifiedOrders({asOf:'2026-09-21T12:00:00Z',
  cafe24Orders:['OLD','DONE','WAIT'].map((id,i)=>({order_id:id,order_date:i?'2026-09-20T00:00:00Z':'2026-06-01T00:00:00Z',raw_data:{tracking_no:'123456789012'+i}})),
  cafe24OrderItems:['OLD','DONE','WAIT'].map((id,i)=>({order_id:id,product_name:'시험 주문 '+id,quantity:1,raw_data:{order_status:i===2?'N22':'N40'}}))});
 const pages=Object.fromEntries(['ACTIVE','REGISTER','IN_TRANSIT','COMPLETED'].map(stage=>[stage,{ok:true,...adapter.buildOrderPage(center.orders,[],{stage}),partial:false}]));
 const runtimeRoot=process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..');
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtimeRoot,MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/completed-ui-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try {
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session,BrowserWindow},pages)=>{
   BrowserWindow.getAllWindows()[0].setTitle('모아온 완료 이력 검증 · 시험 자료');
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>Response.json(url.endsWith('/businesses')?{ok:true,businesses:[]}:pages[new URL(url).searchParams.get('stage')]||pages.ACTIVE);
  },pages);
  await page.evaluate(()=>runHubAction('viewRegistered'));await page.evaluate(()=>showRoute('orders'));
  assert.equal(await page.locator('.order-row').count(),1);
  assert.match(await page.locator('.order-row').innerText(),/WAIT/);
  assert.doesNotMatch(await page.locator('.order-row').innerText(),/OLD|DONE/);
  await page.screenshot({path:'D:/GPT/tmp/completed-history-waiting.png'});
  await page.evaluate(()=>runHubAction('viewCompleted'));
  assert.equal(await page.locator('.order-row').count(),1);
  assert.match(await page.locator('.order-row').innerText(),/DONE/);
  assert.doesNotMatch(await page.locator('.order-row').innerText(),/예약/);
  await page.screenshot({path:'D:/GPT/tmp/completed-history-done.png'});
  console.log(JSON.stringify({status:'PASS',runtimeRoot,scope:'isolated fixture / waiting 1, recent completed 1, historical completed excluded; no order writes'}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
