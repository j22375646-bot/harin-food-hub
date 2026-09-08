'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Use --isolated');
 const root=path.resolve(__dirname,'..'), app=await launchDesktop({root,executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>typeof runHubAction==='function');
  await app.evaluate(({session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    const orders=Array.from({length:8},(_,i)=>({hubOrderId:'HR-C24-0000000'+i,platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:1,externalOrderId:'TEST'+i,shippingHistoryStatus:'READY',productName:i%2?'작두콩차 30T':'생강차 30T',amount:18000+i*1000,items:[{name:'차',option:'30T · 기본 옵션',quantity:1}]}));
    return Response.json({ok:true,orders,total:8,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
  });
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+2');
  for(const width of [1440,1040]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>applyTheme(theme),theme);
    await page.locator('.order-row').first().click();
    await page.waitForFunction(()=>!document.querySelector('.orders-layout').classList.contains('is-detail-closed'));
    await page.waitForTimeout(550);
    const geometry=await page.evaluate(()=>({top:document.querySelector('.order-row').getBoundingClientRect().top,rail:document.querySelector('.sidebar').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,list:document.querySelector('#order-list').clientHeight}));
    assert.ok(geometry.top<320,'first product must be visible without a web-style header/filter stack');
    assert.equal(geometry.rail,84);assert.equal(geometry.overflow,false);assert.ok(geometry.list>250);
    assert.ok(await page.locator('.detail-panel').evaluate(el=>el.getBoundingClientRect().width)>=280);
    await page.getByRole('button',{name:'주문 상세 닫기',exact:true}).click();
    assert.equal(await page.locator('.detail-panel').getAttribute('aria-hidden'),'true');
    assert.equal(await page.locator('.detail-panel').evaluate(el=>el.inert),true);
    await page.waitForTimeout(550);
    assert.ok(await page.locator('.detail-panel').evaluate(el=>el.getBoundingClientRect().left>=document.querySelector('.orders-layout').getBoundingClientRect().right-1),'X slides inspector outside the clipped workspace');
    await page.locator('.order-row').first().click();
    await page.waitForTimeout(550);
    assert.ok(await page.locator('.detail-panel').evaluate(el=>el.getBoundingClientRect().width)>=280,'selecting a row reopens the full inspector');
    await page.screenshot({path:path.join(root,'dist',`app-layout-${width}-${theme}.png`),animations:'disabled'});
   }
  }
  console.log('PASS: compact product-first layout, 84px rail, light/dark and 1040/1440 widths');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
