'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session,app})=>{
   globalThis.labelEvents=[];
   app.on('browser-window-created',(_event,win)=>{
    win.webContents.on('did-navigate',(_e,url,code)=>globalThis.labelEvents.push({event:'navigate',url,code}));
    win.webContents.on('did-fail-load',(_e,code,description)=>globalThis.labelEvents.push({event:'failed',code,description}));
   });
   const remote=session.fromPartition('persist:moaon-harin-readonly',{cache:false});
   const before=remote.webRequest.onBeforeRequest.bind(remote.webRequest);
   remote.webRequest.onBeforeRequest=(filter,handler)=>before(filter,(details,callback)=>handler(details,result=>{globalThis.labelEvents.push({event:'policy',url:details.url,id:details.webContentsId,...result});callback(result);}));
   const orders=()=>{
    return Response.json({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId:'HR-C24-1234ABCD',externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'SHIPPING',productName:'인쇄 시험 상품',quantity:1,amount:30000,orderedAt:null,cancelled:false,cancellationRequested:false,invoiceNumber:'1234567890123',issuedInvoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'},shippingEligible:false,selectionEligible:false,shippingHistoryStatus:'READY',receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}}]});
   };
   remote.fetch=async()=>orders();
   remote.protocol.handle('https',request=>{
    globalThis.labelEvents.push({event:'protocol',url:request.url});
    if(request.method!=='GET')return new Response('',{status:403});
    if(request.url.startsWith('https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?'))return orders();
    if(request.url!=='https://harin-cafe24-sync.vercel.app/api/shipping/print?type=label&ids=HR-C24-1234ABCD')return new Response('',{status:403});
    return new Response('<!doctype html><html><head><meta charset="utf-8"></head><body><script>document.body.dataset.unsafe="ran"</script><div class="actions">hidden actions</div><article class="label"><section class="receiver"><h1>TEST</h1><strong>01012345678</strong><p>(12345) TEST</p></section><section class="barcode"><b>1234567890123</b></section><footer><span>HR-C24-1234ABCD</span></footer></article></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
   });
  });
  await page.evaluate(async()=>{await runHubAction('viewActive');await runHubAction('viewActive');});
  await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  await page.locator('details.detail-action-more > summary').click();
  await page.getByRole('button',{name:'기존 송장 미리보기·인쇄',exact:true}).click({timeout:3000});
  await page.getByText('미리보기 창을 열었습니다 · 인쇄는 창의 메뉴에서 선택하세요',{exact:true}).waitFor({timeout:18000}).catch(async error=>{console.log(JSON.stringify(await app.evaluate(()=>globalThis.labelEvents)));console.log(await page.locator('.review-actions').innerText());throw error;});
  const result=await app.evaluate(async({BrowserWindow})=>{
   const win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().includes('/api/shipping/print'));
   return {script:await win.webContents.executeJavaScriptInIsolatedWorld(999,[{code:'document.body.dataset.unsafe==="ran"'}]),sandbox:win.webContents.getLastWebPreferences().sandbox};
  });
  assert.deepEqual(result,{script:false,sandbox:true});
  await page.getByRole('button',{name:'오늘',exact:true}).click();
  await page.locator('[data-action="hub-disconnect"]:visible').first().click();
  await page.getByText('로그아웃했습니다. 다시 로그인할 수 있습니다.',{exact:true}).waitFor();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(win=>win.webContents.getURL().includes('/api/shipping/print')).length),0);
  console.log(JSON.stringify({status:'PASS',scope:'isolated Electron label preview, synthetic HTML; scripts blocked, logout closes preview; NO PRINT JOB'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
