'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
 const app=await launchDesktop({root,executablePath:packaged?path.join(root,'dist/win-unpacked/MoaonPreview.exe'):require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>!window.getParentWindow()).setSize(1040,720));
  await app.evaluate(({session})=>{globalThis.filterUrls=[];session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{globalThis.filterUrls.push(url);return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});};});
  await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewActive');showRoute('orders');});
  await page.locator('details.order-more-filters > summary').click();
  const group=page.locator('#order-server-filters');assert.equal(await group.count(),1);
  await group.getByRole('checkbox',{name:'배송 지연만'}).check();
  await page.waitForFunction(()=>document.querySelector('#order-result-count').textContent.includes('배송 지연만'));
  assert.ok((await app.evaluate(()=>globalThis.filterUrls)).some(url=>url.includes('delayOnly=true&giftOnly=false')));
  const beforeBusyRequests=(await app.evaluate(()=>globalThis.filterUrls)).length;
  const busy=await page.evaluate(()=>{selectedOrderIds.add('KEEP');registrationBusy=true;renderSelection();const before={generation:actionGeneration,selected:[...selectedOrderIds]};document.querySelector('#order-tools-reset').click();return {...before,afterGeneration:actionGeneration,afterSelected:[...selectedOrderIds],resetDisabled:document.querySelector('#order-tools-reset').disabled,filterDisabled:document.querySelector('#order-delay-only').disabled};});
  assert.equal((await app.evaluate(()=>globalThis.filterUrls)).length,beforeBusyRequests);assert.equal(busy.afterGeneration,busy.generation);assert.deepEqual(busy.afterSelected,busy.selected);assert.equal(busy.resetDisabled,true);assert.equal(busy.filterDisabled,true);
  await page.evaluate(()=>{registrationBusy=false;renderSelection();overviewValues={ACTIVE:{status:'READY',total:100,checkedAt:'2026-09-09T00:00:00Z'}};applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',filters:{delayOnly:true,giftOnly:false},orders:[],total:3,offset:0,hasPrevious:false,hasMore:false,checkedAt:'2026-09-09T01:00:00Z',partial:false,message:'filtered'});});
  assert.equal(await page.evaluate(()=>overviewValues.ACTIVE.total),100,'filtered total must not replace unfiltered overview');
  await page.screenshot({path:path.join(root,'artifacts','order-server-filters.png')});
  const box=await group.boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,JSON.stringify({box,viewport}));
  await page.locator('details.order-more-filters > summary').click();await page.locator('#order-tools-reset').click();
  await page.waitForFunction(()=>!document.querySelector('#order-delay-only').checked&&!document.querySelector('#order-result-count').textContent.includes('배송 지연만'));
  assert.equal((await app.evaluate(()=>globalThis.filterUrls)).at(-1).includes('delayOnly='),false);
  assert.equal(await page.locator('#order-delay-only').isChecked(),false);
  console.log(JSON.stringify({status:'PASS',packaged,scope:'real Main/preload/IPC/UI; network GET mocked; no writes'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
