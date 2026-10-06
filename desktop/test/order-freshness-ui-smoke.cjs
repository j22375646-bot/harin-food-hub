'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
const SNAP='0123456789abcdef'.repeat(4);
const row={hubOrderId:'HR-C24-1234ABCD',platform:'CAFE24',fulfillment:'SELLER',externalOrderId:'C1',productName:'작두콩차',quantity:1,amount:12000,orderedAt:'2026-09-09T00:00:00Z',items:[{name:'차',option:'1상자',quantity:1}],gifts:['스푼'],receiver:{name:'시험',contact:'01012345678',postCode:'12345',address:'서울',addressDetail:'1층'},invoiceNumber:'',issuedInvoiceNumber:'',invoice:null,stage:'PAID',cancelled:false,cancellationRequested:false,shippingHistoryStatus:'READY',shippingEligible:true,selectionEligible:true};
const payload={ok:true,orders:[row],total:1,offset:0,nextOffset:null,snapshot:SNAP,partial:false};
async function main(){
 const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
 const app=await launchDesktop({root,executablePath:packaged?path.join(root,'dist/win-unpacked/MoaonPreview.exe'):require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session},value)=>{globalThis.freshPayload=value;globalThis.freshGets=0;globalThis.freshMode='same';session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});if(url.includes("/orders?"))globalThis.freshGets++;if(globalThis.freshMode==='changed')return new Response('',{status:409});if(globalThis.freshMode==='partial')return Response.json({...globalThis.freshPayload,partial:true});if(globalThis.freshMode==='pending')return new Promise(resolve=>{globalThis.finishFreshReload=()=>resolve(Response.json(globalThis.freshPayload));});return Response.json(globalThis.freshPayload);};},payload);
  const loaded=await page.evaluate(async()=>{++actionGeneration;await window.moaonHub.disconnect();const result=await window.moaonHub.viewActive();applyHubResult(result);showRoute('orders');return result;});if(loaded.status!=='READY')throw Error(`load ${JSON.stringify(loaded)}`);
  await page.waitForTimeout(100);let realProbe;for(let i=0;i<10;i++){realProbe=await page.evaluate(()=>window.moaonHub.checkOrderFreshness());if(realProbe.status!=='BUSY')break;await page.waitForTimeout(50);}assert.equal(realProbe.status,'CURRENT');await page.evaluate(()=>checkVisibleOrderFreshness());
  const initialState=await page.evaluate(()=>({mode:displayMode,route:document.querySelector('[data-page="orders"]').className,status:document.querySelector('#order-freshness').dataset.status,text:document.querySelector('#order-freshness-status').textContent,errors:window.__errors}));assert.equal(initialState.status,'CURRENT',JSON.stringify(initialState));
  const rendered=await page.evaluate(()=>({orders:displayedOrders.length,html:document.querySelector('#order-list').textContent,error:document.querySelector('#order-empty').textContent}));if(await page.locator('.order-row').count()!==1)throw Error(`render ${JSON.stringify(rendered)}`);await page.locator('.order-row').click();await page.locator('.order-select').check();const selected=await page.evaluate(()=>({id:selectedOrderId,ids:[...selectedOrderIds]}));
  await app.evaluate(()=>{globalThis.freshMode='changed';globalThis.freshTimeOffset=61_000;globalThis.RealDate=Date;globalThis.Date=class extends globalThis.RealDate{constructor(...args){super(...(args.length?args:[globalThis.RealDate.now()+globalThis.freshTimeOffset]));}static now(){return globalThis.RealDate.now()+globalThis.freshTimeOffset;}};});
  await page.evaluate(()=>checkVisibleOrderFreshness());await page.locator('#order-freshness-reload').waitFor();
  assert.deepEqual(await page.evaluate(()=>({id:selectedOrderId,ids:[...selectedOrderIds]})),selected);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setSize(1040,720));const screenshot=path.join(root,'artifacts','order-freshness-changed.png');await page.screenshot({path:screenshot});
  await page.evaluate(()=>showRoute('today'));await page.waitForTimeout(200);const beforeOther=await app.evaluate(()=>globalThis.freshGets);await page.evaluate(()=>checkVisibleOrderFreshness());assert.equal(await app.evaluate(()=>globalThis.freshGets),beforeOther);
  await page.evaluate(()=>{showRoute('orders');Object.defineProperty(document,'hidden',{configurable:true,value:true});});await app.evaluate(()=>{globalThis.freshTimeOffset+=61_000;});const beforeHidden=await app.evaluate(()=>globalThis.freshGets);await page.evaluate(()=>checkVisibleOrderFreshness());assert.equal(await app.evaluate(()=>globalThis.freshGets),beforeHidden);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  const busy=await page.evaluate(()=>{registrationBusy=true;renderSelection();const before={generation:actionGeneration,selected:[...selectedOrderIds]};document.querySelector('#order-freshness-reload').click();return {...before,after:actionGeneration,disabled:document.querySelector('#order-freshness-reload').disabled};});assert.equal(busy.after,busy.generation);assert.deepEqual(busy.selected,selected.ids);assert.equal(busy.disabled,true);
  await page.evaluate(()=>{registrationBusy=false;renderSelection();document.documentElement.dataset.theme='dark';});const dark=await page.locator('#order-freshness').evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));assert.notEqual(dark.color,dark.background);await page.emulateMedia({reducedMotion:'reduce'});assert.match(await page.locator('.page-title-accent').first().evaluate(node=>getComputedStyle(node,'::after').animationDuration),/0\.01ms|0s/);
  await app.evaluate(()=>{globalThis.freshMode='partial';});await page.locator('#order-freshness-reload').click();assert.equal(await page.locator('#order-freshness').getAttribute('data-status'),'UNAVAILABLE');assert.equal(await page.locator('#order-freshness-reload').isVisible(),true);
  await app.evaluate(()=>{globalThis.freshMode='pending';});await page.locator('#order-freshness-reload').click();await page.waitForFunction(()=>freshnessReloadBusy);
  const locked=await page.evaluate(()=>{const before={generation:actionGeneration,filters:{...serverFilters}};document.querySelector('#order-gift-only').click();return {...before,afterGeneration:actionGeneration,afterFilters:{...serverFilters},filterDisabled:document.querySelector('#order-gift-only').disabled,selectDisabled:document.querySelector('.order-select')?.disabled};});assert.equal(locked.afterGeneration,locked.generation);assert.deepEqual(locked.afterFilters,locked.filters);assert.equal(locked.filterDisabled,true);assert.equal(locked.selectDisabled,true);
  await app.evaluate(()=>globalThis.finishFreshReload());await page.waitForFunction(()=>!freshnessReloadBusy&&document.querySelector('#order-freshness').dataset.status==='CURRENT');assert.equal(await page.locator('#order-gift-only').isEnabled(),true);assert.equal(await page.locator('.order-select').isEnabled(),true);
  assert.equal(await page.evaluate(()=>selectedOrderIds.size),0);assert.equal(await page.locator('.order-row').count(),1);
  // An idle list must apply newly collected orders without a manual reload.
  // Five checkout orders contain six product-order lines, not nine units.
  await app.evaluate(()=>{
    const base=globalThis.freshPayload.orders[0];
    globalThis.freshPayload={...globalThis.freshPayload,total:5,orders:Array.from({length:5},(_,i)=>({...base,hubOrderId:`HR-NV-0000000${i+1}`,platform:'NAVER',items:i===2?[{name:'차 A',quantity:2},{name:'차 B',quantity:2}]:[{name:'차',quantity:1}]}))};
    globalThis.freshMode='same';globalThis.freshTimeOffset+=61_000;
  });
  await page.evaluate(()=>{closeOrderDetail();document.activeElement?.blur();return checkVisibleOrderFreshness();});
  assert.equal(await page.locator('.order-row').count(),5,'Idle list should automatically replace its stale snapshot');
  assert.match(await page.locator('#order-result-count').textContent(),/상품주문 6건/);
  assert.match(await page.locator('#order-list').textContent(),/차 B · 2개/);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setSize(1040,720));
  const box=await page.locator('#order-freshness').boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(box&&box.x>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
  await page.screenshot({path:path.join(root,'artifacts','order-freshness-auto-refreshed.png')});
  console.log(JSON.stringify({status:'PASS',packaged,screenshot,scope:'real Main/preload/IPC/UI; order GET mocked; selection, explicit reload, route suppression, 1040x720; no writes'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
