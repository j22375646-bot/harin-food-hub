'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-empty-design-213';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>window.moaonHub.refresh());await page.emulateMedia({reducedMotion:'reduce'});
  const card=page.locator('#order-empty');
  for(const theme of ['light','dark'])for(const [scope,label] of [['ACTIVE','송장 발급 전'],['REGISTER','배송대기중'],['IN_TRANSIT','배송중'],['COMPLETED','완료·취소']]){
   await page.evaluate(({scope,theme})=>{document.documentElement.dataset.theme=theme;applyHubResult({status:'READY',scope,channel:'ALL',total:0,offset:0,checkedAt:new Date().toISOString(),orders:[]});showRoute('orders');},{scope,theme});
   assert.equal(await card.isVisible(),true);assert.equal(await card.getAttribute('data-empty-state'),'empty');assert.match(await card.locator('.order-empty-scope').textContent(),new RegExp(label));assert.equal(await card.locator('svg').count(),1);assert.equal(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   await card.screenshot({path:path.join(output,theme+'-'+scope+'.png')});
  }
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'REGISTER',channel:'ALL',total:1,offset:0,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'격리 시험 주문',stage:'PREPARING',quantity:1,amount:1000}]});document.querySelector('#order-search').value='no-match';document.querySelector('#order-search').dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await card.getAttribute('data-empty-state'),'filtered');await card.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();assert.equal(await card.isVisible(),false);assert.equal(await page.locator('.order-row').count(),1);
  await page.evaluate(()=>applyHubResult({status:'UNAVAILABLE'}));assert.equal(await card.getAttribute('data-empty-state'),'unavailable');assert.doesNotMatch(await card.textContent(),/0건|주문이 없/);
  console.log(JSON.stringify({status:'PASS',scopes:4,themes:2,icons:true,filterResetWorks:true,unavailableNotEmpty:true,noOverflow:true,realWrites:0}));
 }catch(e){console.error(e);throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
