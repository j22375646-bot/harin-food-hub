'use strict';
// Read-only installed acceptance. Never clicks print or export; no PII logged.
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.36.0');
  // Defence in depth: this acceptance never dispatches a print job.
  await app.evaluate(({app})=>{globalThis.acceptancePrints=0;globalThis.acceptancePreview=[];app.on('browser-window-created',(_event,win)=>{win.webContents.print=()=>{globalThis.acceptancePrints++;throw Error('Printing forbidden in acceptance');};const inspect=win.webContents.executeJavaScriptInIsolatedWorld.bind(win.webContents);win.webContents.executeJavaScriptInIsolatedWorld=async(...args)=>{const value=await inspect(...args);if(Array.isArray(value)&&value.some(row=>typeof row?.fit==='boolean'))globalThis.acceptancePreview.push(value.map(row=>({fit:row.fit})));return value;};});});
  const result=await page.evaluate(async()=>{
   let unique=[];
   for(const action of ['viewInTransit','viewCompleted']){
    await runHubAction(action);
    const rows=displayedOrders.filter(row=>['CAFE24','COUPANG'].includes(row.platform)&&row.preflight?.route==='HUB'&&row.details?.invoice?.status==='REGISTERED'&&row.details.cancelled===false&&row.details.cancellationRequested===false);
    unique=rows.filter((row,index)=>rows.findIndex(other=>other.details.invoice.number===row.details.invoice.number)===index).slice(0,2);
    if(unique.length===2)break;
   }
   if(unique.length<2)return {status:'INSUFFICIENT_REGISTERED_ROWS',count:unique.length};
   const opened=await window.moaonHub.previewLabels(unique.map(row=>row.hubOrderId));
   return {status:opened.status,count:unique.length,diagnostics:opened.status==='PREVIEW_OPEN'?undefined:unique.map(row=>({channel:row.platform,productLength:row.productName?.length,addressLength:(row.details?.receiver?.address||'').length+(row.details?.receiver?.addressDetail||'').length,messageLength:row.details?.receiver?.message?.length,quantityValid:Number.isSafeInteger(row.quantity)&&row.quantity>0,namePresent:!!row.details?.receiver?.name,addressPresent:!!row.details?.receiver?.address,postCodeValid:/^\d{5}$/.test(row.details?.receiver?.postCode||''),contactValid:/^\d{9,12}$/.test((row.details?.receiver?.contact||'').replace(/[\s-]/g,'')),invoiceValid:/^\d{13}$/.test(row.details?.invoice?.number||'')}))};
  });
  if(result.status!=='PREVIEW_OPEN'){
   console.log(JSON.stringify({status:'NOT_VERIFIED',result,pageFit:await app.evaluate(()=>globalThis.acceptancePreview),scope:'registered live batch preview could not be opened; no writes or printing'}));process.exitCode=2;return;
  }
  const document=await app.evaluate(async({BrowserWindow})=>{
   const child=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL()==='about:blank');
   if(!child)return null;
   return {count:await child.webContents.executeJavaScriptInIsolatedWorld(999,[{code:'document.querySelectorAll("article.label").length'}]),sandbox:child.webContents.getLastWebPreferences().sandbox,javascript:child.webContents.getLastWebPreferences().javascript,printCalls:globalThis.acceptancePrints};
  });
  assert.deepEqual(document,{count:2,sandbox:true,javascript:false,printCalls:0});
  console.log(JSON.stringify({status:'PASS',count:2,scope:'installed EXE, live stored orders, memory-only batch preview; no export, print or shipping writes'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
