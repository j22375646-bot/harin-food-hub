'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated mode required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>typeof runHubAction==='function');
  await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
   return Response.json({ok:true,orders:[1,2,3].map(i=>({hubOrderId:'HR-NV-0000000'+i,platform:'NAVER',fulfillment:'SELLER',stage:'PAID',productName:'검증 상품 '+i,quantity:1,amount:10000,externalOrderId:'TEST'+i})),total:3,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
  };});
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+2');
  assert.deepEqual(await page.locator('#order-channel option').evaluateAll(items=>items.map(x=>x.value)),['ALL','CAFE24','NAVER','COUPANG']);
  await page.locator('.order-select').nth(0).check();await page.locator('.order-select').nth(1).check();
  assert.match(await page.locator('#order-selection').innerText(),/2건 선택/);
  await page.locator('#order-select-all').check();assert.match(await page.locator('#order-selection').innerText(),/3건 선택/);
  await page.locator('.order-row').first().click();await page.getByLabel('주문 상세 닫기').click();
  assert.equal(await page.locator('.orders-layout').evaluate(el=>el.classList.contains('is-detail-closed')),true);
  assert.equal(await page.locator('.order-select:checked').count(),3,'closing inspector must not discard checked batch');
  await page.locator('#selection-clear').click();assert.equal(await page.locator('.order-select:checked').count(),0);
  await page.locator('.order-select').first().check();await page.locator('#order-search').fill('없는 상품');
  assert.equal(await page.locator('#order-selection').isVisible(),false,'hidden orders must not remain selected');
  console.log('PASS: fixed channel choices, multi-select/all/clear, inspector independent, filter invalidation; no writes');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
