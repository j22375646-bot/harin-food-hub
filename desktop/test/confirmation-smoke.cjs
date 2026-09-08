'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session,dialog})=>{
   globalThis.confirmCalls=0;globalThis.confirmReads=0;
   dialog.showMessageBox=async(_parent,options)=>{globalThis.confirmCalls++;if(options.defaultId!==0)throw Error('unsafe default');return {response:1};};
   session.fromPartition('persist:moaon-harin-readonly',{cache:false}).fetch=async(_url,options)=>{
    if(options.method!=='GET')throw Error('write forbidden');globalThis.confirmReads++;
    return new Response(JSON.stringify({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId:'HR-C24-1234ABCD',externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',productName:'시험 상품',quantity:1,amount:30000,orderedAt:null,cancelled:false,cancellationRequested:false,invoiceNumber:'',issuedInvoiceNumber:'',shippingEligible:true,selectionEligible:true,shippingHistoryStatus:'READY',receiver:{name:'TEST',address:'TEST',postCode:'12345',contact:'01012345678'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
   };
  });
  await page.locator('[data-action="hub-connect"]:visible').first().click();
  await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
  await page.getByRole('button',{name:'주문·배송',exact:true}).click();await page.locator('.order-row').first().click();
  await page.getByRole('button',{name:'출고 내용 확인 (발급 안 함)',exact:true}).click({timeout:3000});
  await page.getByText('내용 확인 완료 · 송장 발급 안 함',{exact:true}).waitFor();
  const counts=await app.evaluate(()=>({dialogs:globalThis.confirmCalls,reads:globalThis.confirmReads}));
  assert.equal(counts.dialogs,1);assert.equal(counts.reads,3);
  console.log(JSON.stringify({status:'PASS',scope:'real Electron IPC/UI, synthetic read data and simulated dialog answer; no writes'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
