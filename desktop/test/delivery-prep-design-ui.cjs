'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');

(async()=>{
 const output=process.env.MOAON_DELIVERY_OUTPUT||'D:/GPT/Temp/moaon-delivery-design-224';
 const hidden=process.env.MOAON_TEST_HIDDEN==='1'||process.env.MOAON_VERIFY_HIDDEN==='1';
 fs.mkdirSync(output,{recursive:true});
 const started=performance.now();
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:hidden?'':'right',MOAON_TEST_HIDDEN:hidden?'1':'0'}});
 try{
  const page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(25000);
  await page.waitForURL('moaon://app/index.html',{waitUntil:'domcontentloaded',timeout:90000});
  const shellMs=Math.round(performance.now()-started);
  const scenarios=[
   ['HR-CP-00000001','COUPANG','쇼핑몰 대기 시험 주문','쿠팡',{status:'PENDING'},'쇼핑몰에서 배송정보를 조회 중이에요.'],
   ['HR-C24-00000002','CAFE24','배송정보 지연 시험 주문','Cafe24',{status:'CHECK_REQUIRED',reason:'LOOKUP_DELAYED'},'배송정보 응답이 늦어지고 있어요.'],
   ['HR-C24-00000003','CAFE24','쇼핑몰 주문 참조 정보 누락 시험 주문','Cafe24',{status:'CHECK_REQUIRED',reason:'ORDER_REFERENCE_MISSING'},'쇼핑몰 주문을 찾는 데 필요한 정보가 부족해요.'],
   ['HR-CP-00000004','COUPANG','받는 분 정보 누락 시험 주문','쿠팡',{status:'CHECK_REQUIRED',reason:'RECEIVER_INCOMPLETE'},'받는 분 정보에 빠진 항목이 있어요.'],
   ['HR-C24-00000005','CAFE24','배송정보 조회 실패 시험 주문','Cafe24',{status:'CHECK_REQUIRED',reason:'LOOKUP_FAILED'},'지금 배송정보를 불러오지 못했어요.'],
  ];
  const orders=scenarios.map(([hubOrderId,platform,productName])=>({hubOrderId,platform,productName,stage:'PREPARING',quantity:1,amount:1000}));
  const fixture={status:'READY',scope:'ACTIVE',channel:'ALL',total:orders.length,offset:0,checkedAt:new Date().toISOString(),scopeTotals:{ACTIVE:27,REGISTER:12,IN_TRANSIT:3,COMPLETED:0},orders};
  await app.evaluate(({ipcMain},{fixture,results})=>{
   globalThis.deliveryCalls=[];
   globalThis.deliveryRetryReady=false;
   const replace=(channel,handler)=>{ipcMain.removeHandler('moaon-hub:'+channel);ipcMain.handle('moaon-hub:'+channel,handler);};
   replace('read-delivery',(_event,id)=>{
    globalThis.deliveryCalls.push(id);
    if(globalThis.deliveryRetryReady&&id===fixture.orders[1].hubOrderId)return {status:'READY',receiver:{name:'시험',address:'시험 주소',contact:'01000000000',postCode:'12345'}};
    return results[id];
   });
   replace('recheck-page',()=>fixture);
  },{fixture,results:Object.fromEntries(scenarios.map(([id,,,,result])=>[id,result]))});
  await page.evaluate(()=>returnToSample());
  assert.equal(await page.locator('#order-list').getAttribute('aria-label'),'샘플 주문 목록');
  await page.evaluate(fixture=>{applyHubResult(fixture);showRoute('orders');clearTimeout(deliveryPreparationTimer);},fixture);
  const scopeTabs=page.locator('.order-scope-actions button');
  assert.deepEqual(await scopeTabs.locator('.scope-count').allTextContents(),['27건','12건','3건','0건']);
  const checkedAt=await page.evaluate(checkedAt=>formatTime(checkedAt),fixture.checkedAt);
  for(const tab of await scopeTabs.all())assert.equal(await tab.getAttribute('title'),'전체 채널 저장 주문 · '+checkedAt);
  await page.evaluate(scopeTotals=>acceptScopeTotals({...scopeTotals,ACTIVE:2},'2026-01-01T00:00:00.000Z'),fixture.scopeTotals);
  assert.equal(await scopeTabs.locator('.scope-count').first().textContent(),'27건');
  for(const tab of await scopeTabs.all())assert.equal(await tab.getAttribute('title'),'전체 채널 저장 주문 · '+checkedAt);
  await page.evaluate(scopeTotals=>{orderScopeTotals=null;acceptScopeTotals(scopeTotals);},fixture.scopeTotals);
  for(const tab of await scopeTabs.all())assert.equal(await tab.getAttribute('title'),'전체 채널 저장 주문 · 저장 건수 표시 중');
  await page.evaluate(fixture=>acceptScopeTotals(fixture.scopeTotals,fixture.checkedAt),fixture);
  assert.equal(await page.locator('#order-list').getAttribute('aria-label'),'저장 주문 목록');

  const panel=page.locator('#delivery-prep-status');
  const setWidth=width=>app.evaluate(({BrowserWindow},width)=>{
   const window=BrowserWindow.getAllWindows()[0];
   window.setMinimumSize(900,720);window.setSize(width,900);
  },width);
  const widths=[1440,1040,900],themes=['light','dark'];
  for(const width of widths)for(const theme of themes)for(const state of ['loading','complete']){
   await setWidth(width);
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(({theme,state})=>{
    document.documentElement.dataset.theme=theme;
    paintDeliveryPreparation(deliveryPreparationStatus(),state==='loading'?3:4,4,state==='loading'?2:4,state==='complete');
   },{theme,state});
   assert.equal(await panel.getAttribute('data-state'),state);
   assert.doesNotMatch(await panel.textContent(),/최대 3건|동시|조회 방식/);
   assert.equal(await panel.locator('progress').getAttribute('value'),state==='loading'?'3':'4');
   assert.equal(await panel.getAttribute('aria-busy'),String(state==='loading'));
   assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   assert.ok((await panel.boundingBox()).height<=64);
   assert.equal(await panel.locator('progress').evaluate(n=>getComputedStyle(n).position),'absolute');
   if(state==='loading')assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::before').animationName),'prep-orbit-breathe');
   if(state==='complete'){
    assert.equal(await panel.locator('svg path').count(),1);
    assert.equal(await panel.locator('svg path').evaluate(n=>getComputedStyle(n).animationIterationCount),'1');
    if(!hidden)await page.waitForTimeout(700);
   }
   if(!hidden)await panel.screenshot({path:path.join(output,theme+'-'+state+'-'+width+'.png')});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>paintDeliveryPreparation(deliveryPreparationStatus(),0,4,0));
  assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
  assert.equal(await panel.locator('.delivery-prep-icon').evaluate(n=>getComputedStyle(n,'::before').animationName),'none');
  await page.evaluate(()=>paintDeliveryPreparation(deliveryPreparationStatus(),4,4,4,true));
  assert.equal(await panel.locator('svg path').evaluate(n=>getComputedStyle(n).animationName),'none');

  await page.evaluate(()=>prepareSelectedDelivery(true));
  const issues=panel.locator('.delivery-prep-issue');
  assert.equal(await panel.getAttribute('data-state'),'attention');
  assert.equal(await panel.getAttribute('aria-busy'),'false');
  assert.equal(await panel.locator('progress').getAttribute('value'),String(scenarios.length));
  assert.equal(await issues.count(),scenarios.length);
  assert.deepEqual((await app.evaluate(()=>globalThis.deliveryCalls)).sort(),orders.map(order=>order.hubOrderId).sort());
  for(const width of widths)for(const theme of themes){
   await setWidth(width);
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
   assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   assert.ok(await issues.evaluateAll(rows=>rows.every(n=>n.scrollWidth<=n.clientWidth+1)));
   for(const [,,productName,channel,,reason] of scenarios){
    const issue=issues.filter({hasText:productName});
    assert.equal(await issue.locator('strong').textContent(),channel+' · '+productName);
    const message=issue.locator('.delivery-prep-caption');
    assert.equal(await message.textContent(),reason);
    assert.equal(await message.isVisible(),true);
    assert.equal(await issue.getByRole('button',{name:productName+' 배송정보 다시 조회'}).isEnabled(),true);
   }
   if(!hidden)await panel.screenshot({path:path.join(output,theme+'-attention-'+width+'.png')});
  }
  const retry=issues.getByRole('button',{name:orders[1].productName+' 배송정보 다시 조회'});
  await app.evaluate(()=>{globalThis.deliveryRetryReady=true;globalThis.deliveryCalls.length=0;});
  const retryStarted=performance.now();
  await retry.click();
  await page.waitForFunction(()=>document.querySelectorAll('.delivery-prep-issue').length===4);
  const retryMs=Math.round(performance.now()-retryStarted);
  assert.deepEqual(await app.evaluate(()=>globalThis.deliveryCalls),[orders[1].hubOrderId]);
  assert.equal(await retry.count(),0);
  assert.equal(await panel.locator('.delivery-prep-count').textContent(),'이번 조회 · 1 / 1건');
  assert.equal(await panel.locator('.delivery-prep-attention').textContent(),'확인 필요 4건');
  assert.equal(await page.locator('#order-list .order-row').count(),orders.length);
  await page.evaluate(()=>{selectedScope='REGISTER';scheduleDeliveryPreparation();});
  assert.equal(await panel.isVisible(),false);
  await page.evaluate(()=>document.dispatchEvent(new Event('moaon-session-changed')));
  assert.equal(await panel.textContent(),'');
  assert.equal(await panel.isVisible(),false);
  assert.equal(await page.evaluate(()=>deliveryPreparationIssues.size),0);
  console.log(JSON.stringify({status:'PASS',hidden,states:3,themes:themes.length,widths,finiteCompletionMotion:true,compactProgress:true,noOverflow:true,reducedMotion:true,scopeAndSessionReset:true,deliveryIssueReasons:scenarios.length,retryOneOrder:true,scopeCounts:true,shellMs,retryMs,realWrites:0}));
 }finally{
  const killer=setTimeout(()=>app.process().kill(),10000);
  try{await app.close();}finally{clearTimeout(killer);}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
