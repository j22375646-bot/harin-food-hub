'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=process.argv.includes('--packaged');
 const app=await launchDesktop({root,executablePath:require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  page.on('console',m=>{if(m.type()==='error')console.log('renderer:',m.text());});
  page.on('requestfailed',r=>console.log('request failed',r.failure()?.errorText));
  await page.evaluate(()=>document.fonts.load('400 15px "Moaon Pretendard"','모아온'));
  assert.equal(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Moaon Pretendard'&&f.status==='loaded')),true,'bundled font must load without relying on an installed font');
  assert.equal(await page.getByLabel('현재 페이지 채널').count(),1,'channel tools must exist');
  await app.evaluate(({session})=>{
   session.defaultSession.protocol.handle('https',()=>new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}}));
   globalThis.toolReads=0;
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    globalThis.toolReads++;
    const base={platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,externalOrderId:'TEST',shippingHistoryStatus:'READY'};
    const orders=[{...base,hubOrderId:'HR-C24-00000001',productName:'낮은 금액',amount:1000,items:[{name:'차',option:'30T 1상자',quantity:1,imageUrl:'https://shop-phinf.pstatic.net/product/tea.png'}],giftRequired:true,gifts:[{giftName:'보리차',quantity:2}],listDeliveryBadge:{status:'RESERVED',source:'EPOST'}},
     {...base,hubOrderId:'HR-C24-00000002',productName:'미확인 금액',amount:null},
     {...base,hubOrderId:'HR-C24-00000003',productName:'높은 금액',amount:30000},
     {...base,hubOrderId:'NAVER-TEST',productName:'네이버 상품',platform:'NAVER',amount:20000}];
    return Response.json({ok:true,orders,total:4,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
  });
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+2');
  const visualRow=page.locator('.order-row').filter({hasText:'낮은 금액'});
  await visualRow.locator('img').waitFor({timeout:6000});
  await page.waitForFunction(()=>document.querySelector('.order-row img')?.naturalWidth>0);
  assert.equal(await visualRow.locator('.gift-badge').innerText(),'사은품 동봉');
  assert.equal(await visualRow.locator('.delivery-badge').innerText(),'예약');
  await visualRow.click();
  assert.match(await page.locator('.detail-body').innerText(),/보리차/);
  assert.match(await page.locator('.detail-body').innerText(),/2개 · 조회 시점/);
  await visualRow.locator('img').evaluate(img=>img.dispatchEvent(new Event('error')));
  assert.equal(await visualRow.locator('.product-thumbnail').innerText(),'이미지 확인');
  const reads=await app.evaluate(()=>globalThis.toolReads);
  await page.getByLabel('현재 페이지 채널').selectOption('CAFE24');
  assert.equal(await page.locator('.order-row').count(),3);
  await page.locator('details.order-more-filters > summary').click();
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
  await page.locator('details.order-more-filters > summary').click();
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
