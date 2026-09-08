'use strict';
// Installed real-profile GET-only acceptance. Never log order/customer fields.
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>typeof window.moaonHub.setOrderFilters),'function','Installed app must expose server order filters');
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.36.0');
  await app.evaluate(({session})=>{
   const current=session.fromPartition('persist:moaon-harin-readonly'),original=current.fetch.bind(current);
   globalThis.filterReads=[];
   current.fetch=async(url,options={})=>{
    if((options.method||'GET').toUpperCase()!=='GET')throw Error('Writes forbidden in acceptance');
    const parsed=new URL(url);
    const response=await original(url,options);
    if(parsed.pathname.endsWith('/orders')){
     const body=await response.clone().json();
     globalThis.filterReads.push({stage:parsed.searchParams.get('stage'),channel:parsed.searchParams.get('platform'),delay:parsed.searchParams.get('delayOnly'),gift:parsed.searchParams.get('giftOnly'),offset:parsed.searchParams.get('offset')||'0',allDelayed:Array.isArray(body.orders)&&body.orders.every(order=>order.timingBadge?.type==='DELAYED')});
    }
    return response;
   };
  });
  await page.evaluate(()=>runHubAction('viewCompleted'));
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  await page.locator('.order-more-filters > summary').click();
  const results=[];
  for(const [selector,checked,delay,gift] of [
   ['#order-delay-only',true,true,false],['#order-gift-only',true,true,true],
   ['#order-delay-only',false,false,true],['#order-gift-only',false,false,false],
  ]){
   await page.locator(selector).setChecked(checked);
   await page.waitForFunction(()=>displayMode!=='connecting',{},{timeout:30000});
   const result=await page.evaluate(()=>({status:connectionResult?.status,offset:connectionResult?.offset,total:connectionResult?.total,selected:selectedOrderIds.size,detailOpen:document.querySelector('#order-detail').getAttribute('aria-hidden'),allGift:displayedOrders.every(order=>order.visual?.gifts?.length>0)}));
   assert.equal(result.status,'READY');assert.equal(result.offset,0);assert.equal(result.selected,0);
   if(gift)assert.equal(result.allGift,true,'Gift filter must not return non-gift rows');
   const request=await app.evaluate(()=>globalThis.filterReads.at(-1));
   assert.equal(request.delay==='true',delay);assert.equal(request.gift==='true',gift);assert.equal(request.offset,'0');
   if(delay)assert.equal(request.allDelayed,true,'Server delay filter must return delayed rows only');
   results.push({delay,gift,total:result.total,status:result.status});
  }
  await page.locator('#order-channel').selectOption('COUPANG');
  await page.waitForFunction(()=>displayMode!=='connecting',{},{timeout:30000});
  await page.locator('#order-gift-only').check();
  await page.waitForFunction(()=>displayMode!=='connecting',{},{timeout:30000});
  const before=await app.evaluate(()=>globalThis.filterReads.length);
  await page.locator('.order-more-filters > summary').click();
  await page.locator('#order-tools-reset').click();
  await page.waitForFunction(()=>displayMode!=='connecting',{},{timeout:30000});
  assert.equal(await app.evaluate(()=>globalThis.filterReads.length),before+1,'Reset must request once');
  assert.equal(await page.locator('#order-delay-only').isChecked(),false);
  assert.equal(await page.locator('#order-gift-only').isChecked(),false);
  assert.equal(await page.locator('#order-channel').inputValue(),'ALL');
  const resetRequest=await app.evaluate(()=>globalThis.filterReads.at(-1));
  assert.equal(resetRequest.channel,'ALL');assert.notEqual(resetRequest.delay,'true');assert.notEqual(resetRequest.gift,'true');
  assert.equal(await page.evaluate(()=>connectionResult?.status),'READY');
  console.log(JSON.stringify({status:'PASS',results,resetReads:1,scope:'installed EXE, real filtered order GET and UI controls; no shipping writes/print/PII artifacts'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
