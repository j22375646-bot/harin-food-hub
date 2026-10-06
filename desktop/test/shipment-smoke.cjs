'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Shipment smoke requires an isolated profile');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session,dialog})=>{
   globalThis.shipmentCalls={post:0,poll:0,dialog:0};
   dialog.showMessageBox=async(_parent,options)=>{if(options.defaultId!==0||options.buttons[1]!=='실제 송장 발급')throw Error('Wrong confirmation');globalThis.shipmentCalls.dialog++;return {response:1};};
   session.fromPartition('persist:moaon-harin-readonly',{cache:false}).fetch=async(url,options)=>{
    const hubOrderId='HR-C24-1234ABCD',id='a2345678-1234-4234-8234-123456789012';
    if(url.includes('/api/epost/issue')){
     if(options.method==='POST'){globalThis.shipmentCalls.post++;return Response.json({ok:true,results:[{ok:true,hubOrderId,request:{id,status:'PENDING'}}]},{status:202});}
     globalThis.shipmentCalls.poll++;return Response.json({ok:true,request:{id,hubOrderId,status:'SUCCESS'},result:{trackingNo:'1234567890123'}});
    }
    if(options.method!=='GET')throw Error('Unexpected request');
    const issued=globalThis.shipmentCalls.poll>0;
    if(issued&&globalThis.orderMoved&&new URL(url).searchParams.get('stage')!=='REGISTER')return Response.json({ok:true,offset:0,total:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[]});
    return Response.json({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId,externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'시험 상품',quantity:1,amount:30000,orderedAt:null,cancelled:false,cancellationRequested:false,invoiceNumber:issued?'1234567890123':'',issuedInvoiceNumber:issued?'1234567890123':'',invoice:issued?{status:'REGISTERED',number:'1234567890123'}:undefined,shippingEligible:!issued,selectionEligible:!issued,shippingHistoryStatus:'READY',receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}}]});
   };
  });
  // Cancel startup authentication before using the isolated API fixture.
  // The login-first shell intentionally hides the old sample connect button.
  await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewActive');});
  await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  assert.equal(await page.getByRole('button',{name:'우체국 송장 발급',exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'우체국 송장 발급',exact:true}).click({timeout:3000});
  await page.getByText('발급 완료 · 주문 목록을 새로 확인하세요',{exact:true}).waitFor({timeout:10000});
  assert.deepEqual(await app.evaluate(()=>globalThis.shipmentCalls),{post:1,poll:1,dialog:1});
  assert.equal(await page.getByRole('button',{name:'우체국 송장 발급',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'발급 상태 확인',exact:true}).click();
  await page.getByText('발급 완료 · 주문 목록을 새로 확인하세요',{exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.shipmentCalls.post),1,'Rechecking a completed job must not submit another shipment');
  if(process.argv.includes('--moved'))await app.evaluate(()=>{globalThis.orderMoved=true;});
  await page.getByRole('button',{name:'발급 결과 주문 다시 조회',exact:true}).click({timeout:3000});
  if(process.argv.includes('--moved')){
   await page.getByRole('button',{name:'송장 등록 후 목록 열기',exact:true}).click({timeout:3000});
   await page.locator('.order-row').first().click();
  }
  await page.getByRole('button',{name:'기존 송장 미리보기·인쇄',exact:true}).waitFor({timeout:5000});
  assert.equal(await app.evaluate(()=>globalThis.shipmentCalls.post),1);
  await page.screenshot({path:path.join(__dirname,'..','dist','shipment-smoke.png'),fullPage:true,animations:'disabled'});
  console.log(JSON.stringify({status:'PASS',scope:'isolated Electron UI/IPC/durable journal, simulated dialog and API only; NO LIVE SHIPMENT'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
