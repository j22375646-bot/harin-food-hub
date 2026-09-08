'use strict';
// Live read-only acceptance: no print jobs, export files or shipment writes.
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>typeof window.moaonHub.previewWorklist),'function');
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.35.0');
  await app.evaluate(({app})=>{globalThis.acceptancePrints=0;app.on('browser-window-created',(_event,win)=>{win.webContents.print=()=>{globalThis.acceptancePrints++;throw Error('Printing forbidden in acceptance');};});});
  const results=[];
  for(const type of ['packing','dispatch']){
   const result=await page.evaluate(async type=>{
    await runHubAction('viewCompleted');
    const ids=displayedOrders.slice(0,2).map(row=>row.hubOrderId);
    if(ids.length!==2)return {status:'INSUFFICIENT_ROWS',count:ids.length};
    return {status:(await window.moaonHub.previewWorklist(ids,type)).status,count:ids.length};
   },type);
   assert.equal(result.status,'PREVIEW_OPEN',type+' preview must open');
   const document=await app.evaluate(async({BrowserWindow})=>{
    const child=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL()==='about:blank');
    if(!child)return null;
    return {sandbox:child.webContents.getLastWebPreferences().sandbox,javascript:child.webContents.getLastWebPreferences().javascript,printCalls:globalThis.acceptancePrints,layout:await child.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`(()=>({rows:document.querySelectorAll('.work-row').length,checks:document.querySelectorAll('.order-check').length,pages:Array.from(document.querySelectorAll('.work-page'),page=>{const r=page.getBoundingClientRect(),footer=page.querySelector('footer').getBoundingClientRect();return {width:r.width,height:r.height,fit:page.scrollWidth<=page.clientWidth+1&&page.scrollHeight<=page.clientHeight+1&&Array.from(page.querySelectorAll('.work-row')).every(row=>row.getBoundingClientRect().bottom<=footer.top)};})}))()`}])};
   });
   assert.equal(document?.sandbox,true);assert.equal(document.javascript,false);assert.equal(document.printCalls,0);
   assert.equal(document.layout.rows,2);assert.equal(document.layout.checks,2);
   assert.ok(document.layout.pages.length>0&&document.layout.pages.every(row=>row.fit&&Math.abs(row.width-210*96/25.4)<1&&Math.abs(row.height-297*96/25.4)<1));
   results.push({type,...result});
  }
  console.log(JSON.stringify({status:'PASS',results,scope:'installed EXE, real order GET, A4 memory-only preview; no print/export/shipping writes'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
