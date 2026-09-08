'use strict';
// Real-profile read-only acceptance, no logging of order/customer fields.
const assert=require('node:assert/strict');
const path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>typeof window.moaonHub.checkOrderFreshness),'function','Installed app must expose freshness observer');
  assert.equal(await app.evaluate(({app})=>app.getVersion()),require('../package.json').version);
  await page.waitForFunction(()=>!document.querySelector('#business-list-refresh')?.disabled,{},{timeout:20000});
  await app.evaluate(({session})=>{
   const current=session.fromPartition('persist:moaon-harin-readonly'),original=current.fetch.bind(current);
   globalThis.freshnessReads=0;
   current.fetch=async(url,options={})=>{
    if((options.method||'GET').toUpperCase()!=='GET')throw Error('Writes forbidden in acceptance');
    const parsed=new URL(url);
    if(parsed.pathname.endsWith('/orders'))globalThis.freshnessReads++;
    return original(url,options);
   };
  });
  const checked=await page.evaluate(async()=>{
   const before=JSON.stringify({orders:displayedOrders,scope:selectedScope,channel:selectedChannel,filters:serverFilters,selected:[...selectedOrderIds],detail:selectedOrderId,result:connectionResult});
   const first=await window.moaonHub.checkOrderFreshness();
   const again=await Promise.all([window.moaonHub.checkOrderFreshness(),window.moaonHub.checkOrderFreshness()]);
   const after=JSON.stringify({orders:displayedOrders,scope:selectedScope,channel:selectedChannel,filters:serverFilters,selected:[...selectedOrderIds],detail:selectedOrderId,result:connectionResult});
   return {status:first.status,repeated:again.map(item=>item.status),preserved:before===after,metadataOnly:[first,...again].every(item=>!('orders' in item)&&!('snapshot' in item)&&!('receiver' in item))};
  });
  assert.ok(['CURRENT','CHANGED'].includes(checked.status),'Live observer must confirm unchanged or changed state');
  assert.equal(checked.preserved,true);assert.equal(checked.metadataOnly,true);
  const reads=await app.evaluate(()=>globalThis.freshnessReads);
  assert.equal(reads,1,'Observer must perform one real GET and suppress repeated requests');
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  await page.locator('#order-freshness').waitFor();
  const layout=await page.locator('#order-freshness').evaluate(el=>{
   const r=el.getBoundingClientRect();return {fit:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight,overflow:el.scrollWidth>el.clientWidth+1};
  });
  assert.equal(layout.fit,true);assert.equal(layout.overflow,false);
  console.log(JSON.stringify({status:'PASS',observer:checked.status,repeated:checked.repeated,reads,preserved:true,metadataOnly:true,layout,scope:'installed EXE real GET observer; no order edits, issue, registration or printing'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
