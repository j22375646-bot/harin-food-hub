'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Requires --isolated');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>typeof runSelectedDocument),'function');
  await app.evaluate(async({session,dialog})=>{
   globalThis.documentWrites=[];globalThis.documentDialogMode='save';globalThis.documentChanged=false;
   const originalWrite=process.getBuiltinModule('fs/promises').writeFile;
   process.getBuiltinModule('fs/promises').writeFile=async(...args)=>args[0]==='synthetic.csv'?globalThis.documentWrites.push(args):originalWrite(...args);
   dialog.showSaveDialog=async()=>{if(globalThis.documentDialogMode==='wait')await new Promise(resolve=>{globalThis.finishDocumentDialog=resolve;});return {canceled:globalThis.documentDialogMode==='cancel',filePath:'synthetic.csv'};};
   dialog.showMessageBox=async()=>({response:0});
   session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options)=>{
    assertNoWrite(options);
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    const orders=Array.from({length:3},(_,i)=>({hubOrderId:`HR-${i===2?'NV':'C24'}-0000000${i+1}`,platform:i===2?'NAVER':'CAFE24',fulfillment:'SELLER',externalOrderId:`TEST-${i}`,stage:'SHIPPING',quantity:1,amount:null,productName:globalThis.documentChanged?'CHANGED':`검증 상품 ${i+1}`,cancelled:false,cancellationRequested:false,invoice:i===2?null:{status:'REGISTERED',number:`123456789012${i}`},receiver:{name:'TEST',address:'TEST ROAD',contact:'01012345678',postCode:'12345'}}));
    return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
   function assertNoWrite(options){if(options?.method!=='GET')throw Error('Unexpected network write');}
  });
  await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewRegistered');showRoute('orders');});
  await page.locator('.order-select').nth(0).check();await page.locator('.order-select').nth(1).check();await page.locator('.order-row').first().click();
  await page.getByText('추가 작업',{exact:true}).click();
  assert.equal(await page.locator('#selection-labels').isEnabled(),true);
  await page.locator('#selection-labels').click();await page.waitForFunction(()=>!registrationBusy);
  assert.match(await page.locator('#registration-status').textContent(),/미리보기를 열었습니다/);
  assert.equal(await page.locator('.order-select:checked').count(),2);
  const batch=await app.evaluate(async({BrowserWindow})=>{
   const child=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='about:blank');
   if(!child)return null;
   const rows=await child.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`Array.from(document.querySelectorAll('article.label'),label=>({id:label.querySelector('footer span').textContent,height:label.getBoundingClientRect().height,width:label.getBoundingClientRect().width}))`}]);
   return {rows,js:child.webContents.getLastWebPreferences().javascript};
  });
  assert.equal(batch.js,false);assert.equal(batch.rows.length,2);assert.equal(batch.rows[1].id,'HR-C24-00000002');assert.ok(batch.rows.every(row=>row.height<=568&&row.width<=379));
  await page.locator('.order-select').nth(2).check();await page.getByText('추가 작업',{exact:true}).click();
  assert.equal(await page.locator('#selection-labels').isDisabled(),true);assert.match(await page.locator('#selection-document-hint').textContent(),/제외 1건/);assert.equal(await page.locator('#selection-csv').isEnabled(),true);
  await page.locator('#selection-csv').click();await page.waitForFunction(()=>!registrationBusy);assert.match(await page.locator('#registration-status').textContent(),/CSV.*저장했습니다/);
  assert.equal(await app.evaluate(()=>globalThis.documentWrites.length),1);assert.equal(await page.locator('.order-select:checked').count(),3);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('moaon:')).setSize(1040,720));
  await page.getByText('추가 작업',{exact:true}).click();
  for(const selector of ['#selection-csv','#selection-labels','#collect-orders']){
   const box=await page.locator(selector).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1040&&box.y+box.height<=720,selector);
  }
  await app.evaluate(()=>{globalThis.documentDialogMode='wait';});
  if(!await page.locator('#selection-csv').isVisible())await page.getByText('추가 작업',{exact:true}).click();
  await page.locator('#selection-csv').click();await page.waitForFunction(()=>registrationBusy);
  assert.equal(await page.locator('#selection-labels').isDisabled(),true);assert.equal(await page.locator('#collect-orders').isDisabled(),true);
  await page.evaluate(()=>void runSelectedDocument('csv'));
  await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.finishDocumentDialog;i++)await new Promise(resolve=>setTimeout(resolve,10));if(!globalThis.finishDocumentDialog)throw Error('Missing dialog');});
  await page.evaluate(()=>runHubAction('disconnect'));await app.evaluate(()=>globalThis.finishDocumentDialog());await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await app.evaluate(()=>globalThis.documentWrites.length),1);assert.equal(await page.locator('#registration-results').isVisible(),false);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  console.log(JSON.stringify({status:'PASS',packaged:process.argv.includes('--packaged'),scope:'real Main/preload/IPC/UI batch 2 labels, physical page fit, selected CSV mocked filesystem, eligibility, busy, logout, 1040x720; no print or live writes'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
