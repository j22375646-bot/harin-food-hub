'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:1,offset:0,hasMore:false,hasPrevious:false,checkedAt:new Date().toISOString(),orders:[{hubOrderId:'HR-NV-00000001',platform:'NAVER',productName:'키보드 시험',stage:'PAID',amount:10000,quantity:1,details:{},preflight:{status:'EXTERNAL',route:'NAVER',codes:['NAVER_ROUTE']}}]});});
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  await page.locator('.order-row').first().click();await page.locator('#order-select-all').check();
  const toggle=page.locator('#order-global-search-toggle');await toggle.click();
  await page.locator('#order-global-query').fill('유지할 검색어');
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#order-global-search-panel').evaluate(el=>el.hidden&&el.inert),true);
  assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('#order-global-query').inputValue(),'유지할 검색어');
  assert.equal(await page.locator('#order-detail').evaluate(el=>!el.inert&&el.getAttribute('aria-hidden')!=='true'),true);
  const filters=page.locator('.order-more-filters');await filters.locator('summary').click();await page.locator('#order-sort').focus();await page.keyboard.press('Escape');
  assert.equal(await filters.evaluate(el=>el.open),false);
  assert.equal(await filters.locator('summary').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('#order-detail').evaluate(el=>!el.inert&&el.getAttribute('aria-hidden')!=='true'),true);
  assert.equal(await page.locator('.order-select:checked').count(),1);
  await page.getByRole('button',{name:'주문 상세 닫기',exact:true}).focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#order-detail').getAttribute('aria-hidden'),'true');
  assert.equal(await page.locator('.order-row').first().evaluate(el=>document.activeElement===el),true);
  console.log('PASS: Escape closes focused search/filter before inspector, restores focus, preserves draft and selection; synthetic only');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
