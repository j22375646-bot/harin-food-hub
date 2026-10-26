'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-order-read-incident-20261026';
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:60000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'slow-ui-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(45000);await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>!document.querySelector('#entry-screen').hidden||!!window.moaonHub);
  await page.evaluate(()=>runHubAction('viewActive'));
  await app.evaluate(({session})=>{
   const remote=session.fromPartition('persist:moaon-harin-readonly'),previous=remote.fetch;
   remote.fetch=async(url,options)=>{
    if(!url.includes('/businesses/')||!new URL(url).pathname.endsWith('/orders'))return previous(url,options);
    if(options.method!=='GET')throw Error('No real or synthetic shipping writes');
    await new Promise(resolve=>setTimeout(resolve,18000));
    return Response.json({ok:true,total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId:'HR-C24-00000001',externalOrderId:'ISOLATED-DELAY',platform:'CAFE24',fulfillment:'SELLER',productName:'18초 지연 주문 조회 · 격리 시험 자료',stage:'WAITING_FOR_CARRIER',quantity:1,amount:1000,invoiceNumber:'6890176974040'}]});
   };
  });
  const started=Date.now();await page.evaluate(()=>runHubAction('viewRegistered'));const state=await page.evaluate(()=>({status:connectionResult.status,scope:connectionResult.scope,rows:displayedOrders.length}));
  assert.equal(state.status,'READY');assert.equal(state.scope,'REGISTER');assert.equal(state.rows,1);assert.ok(Date.now()-started>=18000);
  await page.screenshot({path:path.join(output,'slow-installed.png')});
  const receipt={status:'PASS',...state,elapsedMs:Date.now()-started,realUserSession:false,realWrites:0};fs.writeFileSync(path.join(output,'slow-ui-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
