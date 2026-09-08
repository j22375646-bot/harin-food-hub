'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw new Error('This smoke requires --isolated');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.locator('#orders-title').textContent(),'주문 작업실');
  await app.evaluate(({session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>Response.json(url.endsWith('/api/moaon/businesses')?{ok:true,businesses:[]}:{ok:true,orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'검증 상품',quantity:1,amount:null,externalOrderId:'ORIGINAL-1',shippingHistoryStatus:'READY'}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
  });
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+2');
  assert.equal(await page.locator('.order-more-filters').getAttribute('open'),null);
  assert.deepEqual(await page.locator('.order-table-heading > span').allTextContents(),['상품 · 옵션','채널','결제금액','상태']);
  assert.equal(await page.locator('#order-selection').isVisible(),false);
  await page.locator('.order-row').click();
  assert.match(await page.locator('#order-selection').innerText(),/1건 선택/);
  assert.match(await page.locator('.detail-facts').innerText(),/확인 필요/);
  assert.match(await page.locator('.detail-facts').innerText(),/수취 정보\n웹 허브에서 확인/);
  assert.equal(await page.locator('.detail-more').getAttribute('open'),null);
  assert.equal(await page.locator('.preflight-summary').isVisible(),true);
  assert.equal(await page.locator('.preflight-reasons').getAttribute('open'),null);
  await page.locator('.preflight-reasons summary').click();
  assert.match(await page.locator('.preflight-reasons').innerText(),/배송정보 누락|송장 이력|취소 여부/);
  assert.match(await page.locator('.preflight-reasons').innerText(),/수취 정보와 최신 주문·송장 이력은 웹 허브에서 확인/);
  await page.locator('.preflight-reasons summary').click();
  assert.equal(await page.locator('.detail-action-more').getAttribute('open'),null);
  assert.equal(await page.getByRole('button',{name:'우체국 송장 발급',exact:true}).isVisible(),true);
  await page.locator('.detail-action-more summary').click();
  assert.equal(await page.getByRole('button',{name:'발급 상태 확인',exact:true}).isVisible(),true);
  await page.locator('.detail-action-more summary').click();
  await page.locator('.detail-more summary').click();
  assert.match(await page.locator('.detail-more').innerText(),/ORIGINAL-1/);
  await page.locator('#selection-review').click();
  assert.equal(await page.locator('#order-detail').isVisible(),true);
  await page.locator('#selection-clear').click();
  assert.equal(await page.locator('#order-selection').isVisible(),false);
  assert.equal(await page.locator('.order-row[aria-pressed=true]').count(),0);
  await page.locator('.order-more-filters summary').click();
  assert.equal(await page.getByLabel('현재 페이지 정렬').isVisible(),true);
  console.log(JSON.stringify({status:'PASS',scope:'app heading, collapsed filters/details, truthful amount, visible warning, single selection'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
