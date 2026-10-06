'use strict';
// Isolated IPC fixtures only. No customer issuance/registration is invoked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_PARALLEL_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/parallel-ui-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain,session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,o)=>{
    if(o.method!=='GET')throw Error('Live writes blocked in UI fixture');
    const orders=Array.from({length:12},(_,i)=>({hubOrderId:'HR-C24-'+i.toString(16).toUpperCase().padStart(8,'0'),externalOrderId:'TEST-'+i,platform:'CAFE24',fulfillment:'SELLER',stage:'PREPARING',productName:'[시험 자료] 동시 발급 '+(i+1),quantity:1,amount:30000,shippingEligible:true,selectionEligible:true,shippingHistoryStatus:'READY',invoiceNumber:'',issuedInvoiceNumber:'',cancelled:false,cancellationRequested:false,receiver:{name:'시험',address:'시험 주소',postCode:'12345',contact:'01012345678'}}));
    return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
   ipcMain.removeHandler('moaon-hub:issue-and-register');
   ipcMain.handle('moaon-hub:issue-and-register',async(event,ids)=>{
    globalThis.finishParallel=null;
    const wait=new Promise(resolve=>globalThis.finishParallel=resolve);
    for(const hubOrderId of ids.slice(0,2))event.sender.send('moaon-hub:shipping-progress',{hubOrderId,phase:'ISSUE',status:'RUNNING'});
    await wait;
    return {status:'PARTIAL',results:ids.map((hubOrderId,i)=>({hubOrderId,phase:'REGISTER',status:i===0?'CHECK_REQUIRED':'REGISTERED',invoiceNumber:i===0?undefined:String(1234567890123+i),trackingStatus:'PENDING'}))};
   });
  });
  await page.evaluate(async()=>{
   await runHubAction('viewActive');
   document.querySelector('#entry-screen').hidden=true;document.querySelector('.preview-shell').hidden=false;document.querySelector('.preview-shell').inert=false;showRoute('orders');
  });
  await page.locator('#order-select-page').click();await page.locator('#selection-auto-ship').click();
  await page.waitForFunction(()=>document.querySelectorAll('.shipment-live-row').length===2);
  assert.match(await page.locator('#auto-shipping-results').innerText(),/최대 2건 동시/);
  assert.equal(await page.locator('#selection-auto-ship').isDisabled(),true);
  await page.locator('#auto-shipping-results').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>{const panel=document.querySelector('#auto-shipping-results').getBoundingClientRect();return [...document.querySelectorAll('.shipment-live-row')].every(row=>{const box=row.getBoundingClientRect();return box.top>=panel.top&&box.bottom<=panel.bottom;});}),true,'both concurrent progress rows must be visible');
  await page.screenshot({path:'D:/GPT/tmp/parallel-shipping-running.png'});
  await app.evaluate(()=>globalThis.finishParallel());
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await page.locator('#auto-shipping-results .auto-shipping-item').count(),12);
  assert.match(await page.locator('#auto-shipping-results').innerText(),/결과 확인 필요.*재발급 금지/s);
  assert.equal(await page.locator('#auto-shipping-results .auto-shipping-item').filter({hasText:'등록 완료'}).count(),11);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#auto-shipping-results').scrollIntoViewIfNeeded();await page.screenshot({path:'D:/GPT/tmp/parallel-shipping-results.png'});
  console.log('PASS isolated Electron UI: two active rows, duplicate click disabled, 12 results retained with 11 successes and one check-required, no horizontal overflow. No live shipping calls.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
