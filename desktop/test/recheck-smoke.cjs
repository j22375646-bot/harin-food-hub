'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
const override=process.argv.indexOf('--executable');
async function main(){
 const app=await launchDesktop({root,executablePath:override>=0?process.argv[override+1]:require('electron'),packaged:false,override});
 try {
  const page=await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session})=>{
   globalThis.recheckChanged=false;
   session.fromPartition('persist:moaon-harin-readonly',{cache:false}).fetch=async()=>globalThis.recheckChanged?new Response('',{status:409}):new Response(JSON.stringify({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId:'RECHECK-1',externalOrderId:'CHANNEL-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'하린식품 생강차 · 시험 상품',quantity:2,amount:36000,orderedAt:null,cancelled:false,cancellationRequested:false,invoiceNumber:'',issuedInvoiceNumber:'',shippingEligible:true,selectionEligible:true,receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'},items:[{name:'생강차',option:'30티백',quantity:2}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  await page.locator('[data-action="hub-connect"]:visible').first().click();
  await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();
  await page.locator('.order-row').first().click();
  assert.ok((await page.locator('#order-detail').innerText()).includes('송장 이력 조회 상태 확인 필요'));
  assert.equal(await page.getByRole('button',{name:'저장 주문 다시 확인',exact:true}).count(),1,'selected order must expose a reread action');
  await page.getByRole('button',{name:'저장 주문 다시 확인',exact:true}).click();
  await page.getByText('다시 확인 완료 · 저장 자료 기준',{exact:true}).waitFor();
  assert.ok((await page.locator('#order-detail').innerText()).includes('RECHECK-1'));
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const [width,height] of [[1040,720],[1920,1080],[1440,960]]) {
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).setSize(...size),[width,height]);
    await new Promise(resolve=>setTimeout(resolve,300));
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,body:document.querySelector('.detail-body').clientHeight,button:document.querySelector('.review-actions button').getBoundingClientRect().bottom,viewport:innerHeight}));
    assert.equal(layout.overflow,false);
    assert.ok(layout.body>40,'detail body remains scrollable');
    assert.ok(layout.button<=layout.viewport,'review action stays on screen');
   }
   await page.screenshot({path:path.join(require('node:os').tmpdir(),`moaon-p509-${theme}.png`)});
  }
  await app.evaluate(()=>{globalThis.recheckChanged=true;});
  await page.getByRole('button',{name:'저장 주문 다시 확인',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#order-list').children.length===0);
  assert.equal(await page.getByText('다시 확인 완료 · 저장 자료 기준',{exact:true}).count(),0,'changed snapshot must invalidate prior review');
  assert.equal(await page.locator('#order-detail').getByText('RECHECK-1',{exact:true}).count(),0);
  console.log(JSON.stringify({status:'PASS',scope:'synthetic saved-order reread, retained selection, changed snapshot invalidation; no writes'}));
 } finally {await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
