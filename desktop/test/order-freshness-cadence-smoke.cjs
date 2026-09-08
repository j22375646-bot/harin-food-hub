'use strict';
// Exercise the renderer's real registered interval, not its callback directly.
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),resumeOnly=process.argv.includes('--resume-only');
 const app=await launchDesktop({root,packaged,override:-1,executablePath:require('electron')});
 try{
  const page=await app.firstWindow();
  await app.evaluate(({session})=>{
   globalThis.cadenceGets=0;
   session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{
    assertRead(options);
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    if(new URL(url).searchParams.has('snapshot'))globalThis.cadenceGets++;
    return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
   function assertRead(options){if((options.method||'GET')!=='GET')throw Error('Writes forbidden');}
  });
  await page.waitForLoadState('domcontentloaded');
  // Native lifecycle assertions require the real ready-to-show transition.
  const shownDeadline=Date.now()+5000;
  while(!await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).isVisible())&&Date.now()<shownDeadline)await page.waitForTimeout(50);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).isVisible()),true,'App is shown before minimize/restore');
  await page.evaluate(async()=>{
   ++actionGeneration;await window.moaonHub.disconnect();
   applyHubResult(await window.moaonHub.viewActive());showRoute('orders');
  });
  await page.waitForFunction(()=>document.querySelector('#order-freshness').dataset.status==='CURRENT');
  // Let startup business/overview reads settle before counting observer reads.
  await page.waitForFunction(()=>!document.querySelector('#business-list-refresh').disabled);
  const initial=await app.evaluate(()=>globalThis.cadenceGets);
  let expected=initial;
  if(!resumeOnly){
  // The startup immediate probe can be less than one minute before the first
  // interval. Allow two actual ticks; Main must still emit only one GET.
  await page.waitForTimeout(60_000);
  await page.waitForTimeout(60_000);
  await page.waitForFunction(()=>document.querySelector('#order-freshness').dataset.status==='CURRENT');
  assert.equal(await app.evaluate(()=>globalThis.cadenceGets),initial+1,'Actual 60 second interval dispatches one GET');
  console.log('PASS: actual interval dispatches one rate-limited observer GET');
  await page.evaluate(()=>showRoute('today'));
  await page.waitForTimeout(60_000);
  assert.equal(await app.evaluate(()=>globalThis.cadenceGets),initial+1,'Other route suppresses interval');
  console.log('PASS: other route suppresses actual interval');
  expected=initial+1;
  }else{
   await app.evaluate(()=>{const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NativeDate.now()+61_000]));}static now(){return NativeDate.now()+61_000;}};});
  }
  await page.evaluate(()=>showRoute('orders'));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).minimize());
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).isMinimized()),true);
  // Count dispatches during minimization, not a pre-minimize focus request.
  expected=await app.evaluate(()=>globalThis.cadenceGets);
  await page.waitForTimeout(resumeOnly?1000:60_000);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).isMinimized()),true,'Window remains minimized until explicit restore');
  assert.equal(await app.evaluate(()=>globalThis.cadenceGets),expected,'Minimized page suppresses GET');
  console.log(resumeOnly?'PASS: native minimized restore fixture':'PASS: native minimized window suppresses actual interval');
  if(resumeOnly)await app.evaluate(()=>{const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[NativeDate.now()+61_000]));}static now(){return NativeDate.now()+61_000;}};});
  else await page.waitForTimeout(1000);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).restore());
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).focus());
  const deadline=Date.now()+5000;
  while(await app.evaluate(()=>globalThis.cadenceGets)===expected&&Date.now()<deadline)await page.waitForTimeout(50);
  const resumedReads=await app.evaluate(()=>globalThis.cadenceGets);
  if(resumedReads!==expected+1){
   const native=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow());return {minimized:w.isMinimized(),focused:w.isFocused(),visible:w.isVisible()};});
   const renderer=await page.evaluate(()=>({hidden:document.hidden,mode:displayMode,visible:ordersAreVisible(),status:document.querySelector('#order-freshness').dataset.status}));
   throw Error(`Restore observer missing: ${JSON.stringify({expected:expected+1,actual:resumedReads,native,renderer})}`);
  }
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await app.evaluate(()=>globalThis.cadenceGets),expected+1,'Resume obeys Main rate cap');
  console.log(JSON.stringify({status:'PASS',packaged,resumeOnly,scope:resumeOnly?'native restore focus + Main rate cap; fake Main clock':'real registered 60-second renderer interval + Main/preload; network GET mocked, native minimize and other-route gates, resume cap; no writes'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
