'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',productName:'배송정보 시험',stage:'PREPARING',amount:30000,quantity:1,issueAndRegisterEligible:true,registrationEligible:false,preflight:{status:'REVIEW_ONLY',route:'HUB',codes:[]},details:{items:[],receiver:{name:'시험 고객',contact:'01000000000',postCode:'12345',address:'가상시 시험로 1',addressDetail:'101호',message:'<img src=x onerror=alert(1)>'}}}]}));
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  const delivery=page.getByRole('region',{name:'배송정보',exact:true});
  assert.match(await delivery.innerText(),/시험 고객/);assert.match(await delivery.innerText(),/가상시 시험로 1/);assert.match(await delivery.innerText(),/101호/);assert.match(await delivery.innerText(),/01000000000/);
  assert.equal(await delivery.locator('img').count(),0);
  await page.locator('#order-select-all').check();
  assert.equal(await page.locator('#selection-auto-ship').isVisible(),true);
  assert.equal(await page.locator('#selection-register').isVisible(),false);
  await page.getByText('추가 작업',{exact:true}).click();assert.equal(await page.locator('#selection-register').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#selection-register').isVisible(),false);
  await page.getByText('추가 작업',{exact:true}).click();await page.locator('#selection-review').click();
  assert.equal(await page.locator('#selection-register').isVisible(),false);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(__dirname,'../artifacts/p436-delivery.png')});
  await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.getByText('시험 고객',{exact:true}).count(),0);
  console.log('PASS: delivery fields/text safety, compact primary action, secondary disclosure, small window, logout clearing');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
