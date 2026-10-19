'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 fs.mkdirSync('D:/GPT/Temp',{recursive:true});
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_WAITING_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/Temp/waiting-detail-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  console.log('Electron launched');
  const page=await app.firstWindow();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);await page.waitForLoadState('domcontentloaded');console.log('Window ready');
  await app.evaluate(({session})=>{
   globalThis.detailReads={pages:0,delivery:0,tracking:0};globalThis.trackingFail=false;
   session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,o)=>{
    if(o.method!=='GET')throw Error('No writes allowed');
    if(url.includes('/delivery-detail?')){globalThis.detailReads.delivery++;return Response.json({ok:true,receiver:{name:'시험',contact:'01012345678',address:'시험 주소',postCode:'12345'}});}
    if(url.endsWith('/api/shipping/tracking')){globalThis.detailReads.tracking++;return globalThis.trackingFail?new Response('',{status:503}):Response.json({ok:true,states:[{hubOrderId:'HR-C24-00000001',trackingNo:'1234567890123',status:'SUCCESS',statusCode:'WAITING',checkedAt:'2026-10-19T00:00:00Z'}]});}
    if(url.includes('/orders?')){
     globalThis.detailReads.pages++;
     if(globalThis.detailArmed)return new Response('',{status:409});
     return Response.json({ok:true,orders:[{hubOrderId:'HR-C24-00000001',externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'WAITING_FOR_CARRIER',productName:'[시험 자료] 배송대기 상세 확인',quantity:1,amount:1000,invoiceNumber:'1234567890123',issuedInvoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'},shippingEligible:false,cancelled:false,cancellationRequested:false,receiver:{}}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
    }
    return Response.json({ok:false},{status:503});
   };
  });
  console.log('Fixture installed');
  await page.evaluate(()=>{ensureTodayOverview=()=>{};businessLoaded=true;historyAutoLoaded=true;void runHubAction('viewRegistered');});
  await page.waitForFunction(()=>displayMode==='live',null,{timeout:20000});
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;document.querySelector('.preview-shell').hidden=false;document.querySelector('.preview-shell').inert=false;showRoute('orders');});
  await page.waitForTimeout(1500);
  await app.evaluate(()=>{globalThis.detailArmed=true;globalThis.detailReads={pages:0,delivery:0,tracking:0};});
  await page.locator('.order-row').first().click();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>displayMode),'live','opening a registered order must not clear the page');
  assert.equal(await page.locator('.order-row').count(),1);
  assert.equal(await page.evaluate(()=>selectedOrderId),'HR-C24-00000001');
  assert.match(await page.locator('.tracking-section').innerText(),/배송 이동 확인 전/);
  assert.match(await page.locator('.delivery-information').innerText(),/배송정보 조회 완료/);
  assert.deepEqual(await app.evaluate(()=>globalThis.detailReads),{pages:0,delivery:1,tracking:1});
  await app.evaluate(()=>{globalThis.trackingFail=true;});
  await page.getByRole('button',{name:'저장 추적 조회',exact:true}).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>displayMode),'live');
  assert.match(await page.locator('.delivery-badge').first().innerText(),/배송대기중/);
  assert.match(await page.locator('.tracking-section').innerText(),/추적 확인 필요/);
  await page.screenshot({path:'D:/GPT/Temp/waiting-detail-fixed.png'});
  console.log('PASS registered detail retains list, selection and waiting status; missing receiver loads without page recheck; tracking failure stays local; zero writes.');
 }finally{require('node:child_process').spawnSync('taskkill',['/PID',String(app.process().pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
})().catch(e=>{console.error(e);process.exitCode=1;});
