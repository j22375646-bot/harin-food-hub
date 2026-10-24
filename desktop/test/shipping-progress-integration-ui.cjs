'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
const profile=fs.mkdtempSync('D:/GPT/Temp/shipping-final-integration-');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 for(const pass of [0,1]){
  const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'isolated-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:profile,MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
  try{
   const page=await app.firstWindow();page.setDefaultTimeout(25000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>runHubAction('disconnect'));
   assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot().length),0,'Fresh process must not restore stale renderer memory');
   await app.evaluate(({session})=>{
    globalThis.fixture={mode:'READY',orders:0,feeds:0,writes:0,scopeKey:'a'.repeat(64),held:null,deniedWrites:[],at:Date.now()};
    globalThis.rawFixture=Array.from({length:20},(_,i)=>{const platform=i%2?'COUPANG':'CAFE24';return {hubOrderId:'HR-'+(i%2?'CP':'C24')+'-'+(i+1).toString(16).toUpperCase().padStart(8,'0'),platform,externalOrderId:'ISOLATED-'+i,...(i%2?{shipmentId:String(100000+i)}:{}),fulfillment:'SELLER',productName:'격리 시험 자료 '+i+' · '+('긴 상품명과 포장 안내 '.repeat(12)),items:[{name:'시험 상품',option:'용량 선택 · '+('긴 옵션 '.repeat(20)),quantity:1}],stage:'PREPARING',quantity:1,amount:1000,selectionEligible:true,shippingEligible:true,shippingHistoryStatus:'READY',cancelled:false,cancellationRequested:false,invoiceNumber:'',issuedInvoiceNumber:'',receiver:{name:'격리',contact:'01000000000',postCode:'12345',address:'격리 시험 주소'}};});
    const makeFeed=targets=>({ok:true,contract:1,tenantId:'a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',scopeKey:fixture.scopeKey,checkedAt:new Date().toISOString(),partial:false,items:targets.map((target,i)=>{const id=target.split(':')[0],raw=rawFixture.find(v=>v.hubOrderId===id);if(!raw||raw.platform==='COUPANG'&&target.split(':')[1]!==raw.shipmentId)throw Error('Bad Main identity');const status=['RUNNING','PENDING','FAILED','REGISTERED','SUCCESS','CANCELLED'][i%6];return {hubOrderId:id,platform:raw.platform,phase:status==='SUCCESS'?'ISSUE':'REGISTER',status,requestId:'12345678-1234-4234-8234-'+String(i).padStart(12,'0'),createdAt:new Date(fixture.at-90000).toISOString(),updatedAt:new Date(fixture.at-(status==='RUNNING'?1000:60000)).toISOString(),nextAttemptAt:status==='PENDING'?new Date(fixture.at+90000).toISOString():null,privatePayload:'MUST_NOT_ENTER_RENDERER'};})});
    session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{
     if(new URL(url).pathname==='/api/moaon/team')return Response.json({ok:false},{status:503}); // Isolate unrelated team bootstrap; never forward it.
     if(options.method&&options.method!=='GET'){fixture.writes++;fixture.deniedWrites.push(new URL(url).pathname);throw Error('All writes forbidden in integration fixture');}
     const u=new URL(url);
     if(u.pathname.endsWith('/shipping-progress')){
      fixture.feeds++;const targets=u.searchParams.get('targets').split(',');if(targets.length!==20||new Set(targets).size!==20)throw Error('Expected bounded twenty');
      const body=makeFeed(targets);
      if(fixture.mode==='HELD')return new Promise(resolve=>{fixture.held=()=>resolve(Response.json(body));});
      if(fixture.mode==='EXPIRED')return Response.json({ok:false},{status:401});
      if(fixture.mode==='PARTIAL')body.items.pop();return Response.json(body);
     }
     if(u.pathname.endsWith('/orders')){fixture.orders++;return Response.json({ok:true,orders:rawFixture,total:20,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});}
     return Response.json({ok:false},{status:503});
    };
   });
   console.log('integration boot '+pass);
   await page.evaluate(()=>runHubAction('refresh'));await page.evaluate(()=>showRoute('orders'));
   await page.waitForFunction(()=>window.moaonShippingProgress.snapshot().length===20,{timeout:15000});
   const badges=page.locator('.order-shipping-progress:not([hidden])');assert.equal(await badges.count(),20);assert.equal(await page.evaluate(()=>displayedOrders.length),20);
   const states=await badges.evaluateAll(nodes=>nodes.reduce((r,n)=>(r[n.dataset.progressState]=(r[n.dataset.progressState]||0)+1,r),{}));assert.deepEqual(states,{RUNNING:4,PENDING:4,FAILED:3,REGISTERED:3,SUCCESS:3,CANCELLED:3});
   assert.equal(await page.evaluate(()=>JSON.stringify(window.moaonShippingProgress.snapshot()).includes('MUST_NOT_ENTER_RENDERER')),false);
   const orderReads=await app.evaluate(()=>fixture.orders);
   await page.evaluate(()=>{selectedOrderIds.add(displayedOrders[0].hubOrderId);selectedOrderIds.add(displayedOrders[19].hubOrderId);orderSearch.value='격리';renderOrders();renderSelection();showRoute('settings');showRoute('orders');});
   assert.equal(await page.evaluate(()=>selectedOrderIds.size),2);assert.equal(await page.evaluate(()=>orderSearch.value),'격리');assert.equal(await app.evaluate(()=>fixture.orders),orderReads,'Status and route changes must not reload orders');
   for(const width of [1060,1440]){
    await page.setViewportSize({width,height:980});
    for(const theme of ['light','dark']){
     await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const last=badges.last();await last.locator('summary').click();await last.locator('.shipping-progress-detail').scrollIntoViewIfNeeded();
     assert.equal(await last.locator('.shipping-progress-detail').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
     assert.equal(await last.locator('summary').evaluate(n=>n.getBoundingClientRect().right<=innerWidth+1),true);
     await page.screenshot({path:`D:/GPT/Temp/shipping-final-${pass}-${width}-${theme}.png`});await last.locator('summary').click();
    }
   }
   if(!pass){
    for(const mode of ['cancel','reject']){
     const before=await page.evaluate(()=>window.moaonShippingProgress.snapshot()[1]);
     await app.evaluate(({ipcMain},mode)=>{ipcMain.removeHandler('moaon-hub:continue-shipping');ipcMain.handle('moaon-hub:continue-shipping',()=>{if(mode==='reject')throw Error('Isolated reply failure');return {status:'REVIEW_CANCELLED',results:[]};});},mode);
     await badges.nth(1).locator('summary').click();await badges.nth(1).getByRole('button',{name:'기존 작업 확인·이어가기'}).click();await page.waitForFunction(()=>!registrationBusy);
     const after=await page.evaluate(()=>window.moaonShippingProgress.snapshot().find(r=>r.id===displayedOrders[1].hubOrderId));assert.equal(after.status,before.status);assert.equal(after.phase,before.phase);assert.equal(after.changedAt,before.changedAt);
    }
    const before=await page.evaluate(()=>window.moaonShippingProgress.snapshot().map(r=>[r.id,r.status,r.changedAt]));
    await app.evaluate(()=>fixture.mode='PARTIAL');await page.waitForTimeout(2100);await page.evaluate(()=>window.moaonShippingProgress.poll());
    assert.deepEqual(await page.evaluate(()=>window.moaonShippingProgress.snapshot().map(r=>[r.id,r.status,r.changedAt])),before);assert.match(await page.locator('#shipping-progress-sync').textContent(),/확인 필요/);
    await app.evaluate(()=>fixture.mode='EXPIRED');await page.waitForTimeout(2100);await page.evaluate(()=>window.moaonShippingProgress.poll());await page.waitForFunction(()=>displayedOrders.length===0);
    assert.equal(await badges.count(),0);assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot().length),0);
    await app.evaluate(()=>fixture.mode='READY');await page.evaluate(()=>runHubAction('refresh'));await page.evaluate(()=>showRoute('orders'));await page.waitForFunction(()=>window.moaonShippingProgress.snapshot().length===20);
    await app.evaluate(()=>fixture.mode='HELD');await page.waitForTimeout(2100);await page.evaluate(()=>{globalThis.heldStatusPoll=window.moaonShippingProgress.poll();});
    for(let attempt=0;attempt<100;attempt++){if(await app.evaluate(()=>typeof fixture.held==='function'))break;await page.waitForTimeout(50);}
    assert.equal(await app.evaluate(()=>typeof fixture.held==='function'),true,'Main must have an actual in-flight read');
    await page.evaluate(()=>runHubAction('disconnect'));await app.evaluate(()=>fixture.held());await page.evaluate(()=>globalThis.heldStatusPoll);
    assert.equal(await page.evaluate(()=>displayedOrders.length),0);assert.equal(await badges.count(),0);assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot().length),0);
    await app.evaluate(()=>fixture.mode='READY');await page.evaluate(()=>runHubAction('refresh'));await page.evaluate(()=>showRoute('orders'));await page.waitForFunction(()=>window.moaonShippingProgress.snapshot().length===20);
    await app.evaluate(()=>fixture.scopeKey='b'.repeat(64));await page.waitForTimeout(2100);await page.evaluate(()=>window.moaonShippingProgress.poll());await page.waitForFunction(()=>displayedOrders.length===0);assert.equal(await badges.count(),0);
   }
   assert.equal(await app.evaluate(()=>fixture.writes),0,JSON.stringify(await app.evaluate(()=>fixture.deniedWrites)));
  }finally{await app.close();}
 }
 console.log(JSON.stringify({status:'PASS',mixedOrders:20,freshProcesses:2,realMainTransport:true,partialResponseRetained:true,sessionExpiryCleared:true,lateResponseDiscarded:true,widths:[1060,1440],themes:2,realWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
