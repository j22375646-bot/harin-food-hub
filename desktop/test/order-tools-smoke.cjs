'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=process.argv.includes('--packaged');
 const app=await launchDesktop({root,executablePath:require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.getByLabel('현재 페이지 채널').count(),1,'channel tools must exist');
  await app.evaluate(({session})=>{
   globalThis.toolReads=0;
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    globalThis.toolReads++;
    const base={platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,externalOrderId:'TEST',shippingHistoryStatus:'READY'};
    const orders=[{...base,hubOrderId:'HR-C24-00000001',productName:'낮은 금액',amount:1000},
     {...base,hubOrderId:'HR-C24-00000002',productName:'미확인 금액',amount:null},
     {...base,hubOrderId:'HR-C24-00000003',productName:'높은 금액',amount:30000},
     {...base,hubOrderId:'NAVER-TEST',productName:'네이버 상품',platform:'NAVER',amount:20000}];
    return Response.json({ok:true,orders,total:4,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
  });
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+2');
  const reads=await app.evaluate(()=>globalThis.toolReads);
  await page.getByLabel('현재 페이지 채널').selectOption('CAFE24');
  assert.equal(await page.locator('.order-row').count(),3);
  await page.getByLabel('현재 페이지 정렬').selectOption('AMOUNT_DESC');
  assert.match(await page.locator('.order-row').first().innerText(),/높은 금액/);
  assert.match(await page.locator('.order-row').last().innerText(),/미확인 금액/);
  await page.locator('.order-row').first().click();
  await page.keyboard.press('Alt+ArrowDown');
  assert.match(await page.locator('#order-detail').innerText(),/낮은 금액/);
  await page.getByLabel('현재 페이지 정렬').selectOption('AMOUNT_ASC');
  assert.match(await page.locator('.order-row').first().innerText(),/낮은 금액/);
  assert.match(await page.locator('.order-row').last().innerText(),/미확인 금액/);
  await page.getByLabel('현재 페이지 채널').selectOption('NAVER');
  assert.equal(await page.getByRole('heading',{name:'주문 상세',exact:true}).count(),0);
  await page.locator('#order-search').fill('없는 주문');
  assert.equal(await page.locator('.order-row').count(),0);
  await page.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();
  assert.equal(await page.locator('.order-row').count(),4);
  assert.equal(await page.getByLabel('현재 페이지 정렬').inputValue(),'DEFAULT');
  assert.equal(await app.evaluate(()=>globalThis.toolReads),reads,'local tools must not trigger collection or API requests');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok(await page.locator('#order-list').evaluate(el=>el.clientHeight)>90);
   await page.screenshot({path:path.join(root,'artifacts',`order-tools-${theme}.png`)});
  }
  await page.getByLabel('현재 페이지 채널').selectOption('NAVER');
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('.order-row').count(),0);
  assert.equal(await page.getByLabel('현재 페이지 채널').inputValue(),'ALL');
  console.log(JSON.stringify({status:'PASS',packaged,scope:'channel, sorting, unknown amount, detail shortcut, reset, no extra reads, dark/light, disconnect'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
