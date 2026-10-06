'use strict';
// Real installed app + existing signed-in profile. GET only, no customer content output.
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  assert.equal(await app.evaluate(({app})=>app.getVersion()),require('../package.json').version);
  assert.equal(await page.evaluate(()=>typeof window.moaonHub.applyOrderSearch),'function');
  await app.evaluate(({session,dialog})=>{
   const current=session.fromPartition('persist:moaon-harin-readonly'),original=current.fetch.bind(current);
   globalThis.searchAcceptance={reads:0,queries:0,version:0,xlsx:0,bytes:0,dialogs:0};
   current.fetch=async(url,options={})=>{
    if((options.method||'GET').toUpperCase()!=='GET')throw Error('Writes forbidden in acceptance');
    const response=await original(url,options),parsed=new URL(url);
    if(parsed.pathname.endsWith('/orders')){
     globalThis.searchAcceptance.reads++;
     if(parsed.searchParams.has('query'))globalThis.searchAcceptance.queries++;
     if(response.headers.get('content-type')?.includes('spreadsheetml')){
      const bytes=new Uint8Array(await response.clone().arrayBuffer());
      if(bytes[0]!==80||bytes[1]!==75)throw Error('XLSX is not ZIP');
      globalThis.searchAcceptance.xlsx++;globalThis.searchAcceptance.bytes=bytes.length;
     }else if(response.ok){
      const body=await response.clone().json();
      globalThis.searchAcceptance.version=body.searchContractVersion||0;
     }
    }
    return response;
   };
   // Exercise download through Main, but never save operational data during acceptance.
   dialog.showSaveDialog=async()=>{globalThis.searchAcceptance.dialogs++;return {canceled:true};};
  });
  await page.evaluate(()=>runHubAction('viewCompleted'));
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  assert.equal(await page.evaluate(()=>connectionResult?.status),'READY');
  const baseTotal=await page.evaluate(()=>connectionResult.total);
  assert.ok(baseTotal>0,'Need a real stored completed order for positive search');
  await page.locator('#order-global-search-toggle').click();
  await page.locator('#order-global-query').evaluate(el=>{el.value=displayedOrders[0].hubOrderId;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#order-global-apply').click();
  await page.waitForFunction(()=>displayMode!=='connecting'&&!document.querySelector('#order-global-apply').disabled,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>connectionResult?.status),'READY');
  assert.equal(await page.evaluate(()=>connectionResult.total),1,'Order id search must narrow whole query');
  assert.equal(await app.evaluate(()=>globalThis.searchAcceptance.version),1);
  const beforeExport=await app.evaluate(()=>globalThis.searchAcceptance.xlsx);
  await page.locator('#order-global-export').click();
  await page.waitForFunction(()=>!document.querySelector('#order-global-export').disabled,{},{timeout:30000});
  const exported=await app.evaluate(()=>({...globalThis.searchAcceptance}));
  assert.equal(exported.xlsx,beforeExport+1);assert.equal(exported.dialogs,1);assert.ok(exported.bytes>0);
  await page.locator('#order-global-query').fill('');
  await page.locator('#order-global-start').fill('2099-01-01');
  await page.locator('#order-global-end').fill('2099-01-02');
  await page.locator('#order-global-apply').click();
  await page.waitForFunction(()=>displayMode!=='connecting'&&!document.querySelector('#order-global-apply').disabled,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>connectionResult?.status),'READY');assert.equal(await page.evaluate(()=>connectionResult.total),0);
  const beforeReset=await app.evaluate(()=>globalThis.searchAcceptance.reads);
  await page.locator('#order-global-reset').click();
  await page.waitForFunction(()=>displayMode!=='connecting'&&!document.querySelector('#order-global-reset').disabled,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>connectionResult?.status),'READY');assert.equal(await page.evaluate(()=>connectionResult.total),baseTotal);
  assert.equal(await app.evaluate(()=>globalThis.searchAcceptance.reads),beforeReset+1);
  await page.locator('#order-global-search-toggle').click();
  assert.equal(await page.locator('#order-global-search-panel').evaluate(el=>el.inert),true);
  console.log(JSON.stringify({status:'PASS',version:require('../package.json').version,baseTotal,positiveSearch:1,futureRange:0,xlsxBytes:exported.bytes,saveCancelled:true,resetReads:1,scope:'installed EXE, real authenticated GET, native save cancelled; no shipping writes, file save or PII output'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
