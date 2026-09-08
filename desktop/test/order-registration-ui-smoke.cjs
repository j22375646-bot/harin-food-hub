'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Requires --isolated');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.evaluate(()=>typeof changeOrderChannel),'function');
  assert.equal(await page.evaluate(()=>typeof registerSelectedInvoices),'function');
  await app.evaluate(({session,dialog})=>{
    globalThis.registrationPosts=0;globalThis.registrationDialogs=0;
    dialog.showMessageBox=async()=>{globalThis.registrationDialogs++;return {response:1};};
    session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options)=>{
      if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
      if(options.method==='POST'){
        if(!url.endsWith('/api/shipping/actions'))throw Error('Unexpected write');
        globalThis.registrationPosts++;
        await new Promise(resolve=>{globalThis.finishRegistration=resolve;});
        const requested=JSON.parse(options.body).orders;
        return Response.json({ok:true,results:requested.map((row,i)=>({hubOrderId:row.hubOrderId,ok:i!==2,status:['SUCCESS','QUEUED','FAILED','UNKNOWN'][i]}))});
      }
      const channel=new URL(url).searchParams.get('platform');
      if(channel==='COUPANG'&&globalThis.delayChannel)await new Promise(resolve=>{globalThis.finishChannel=resolve;});
      const orders=channel==='NAVER'||channel==='COUPANG'?[]:Array.from({length:5},(_,i)=>({hubOrderId:`HR-C24-${(i+1+(globalThis.registrationBase||0)).toString(16).toUpperCase().padStart(8,'0')}`,platform:'CAFE24',fulfillment:'SELLER',externalOrderId:`WEB-${i}`,stage:'PAID',quantity:1,amount:null,productName:`검증 상품 ${i+1}`,shippingEligible:i<4,shippingHistoryStatus:'READY',cancelled:false,cancellationRequested:false,invoice:{status:globalThis.registrationPosts&&i===0?'REGISTERED':'ISSUED',number:`123456789012${i}`}}));
      const scope=new URL(url).searchParams.get('stage');
      const visible=scope==='REGISTER'?orders.filter(order=>order.invoice.status==='REGISTERED'):orders.filter(order=>order.invoice.status!=='REGISTERED');
      return Response.json({ok:true,orders:visible,total:visible.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
    };
  });
  await page.evaluate(async()=>{await runHubAction('disconnect');await runHubAction('viewActive');showRoute('orders');});
  assert.equal(await page.locator('.order-select:not(:disabled)').count(),5,'selection also supports content review of ineligible orders');
  await page.getByLabel('현재 페이지 채널').selectOption('COUPANG');
  await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='COUPANG');
  assert.equal(await page.locator('.order-row').count(),0);
  assert.deepEqual(await page.locator('#order-channel option').evaluateAll(options=>options.map(option=>option.value)),['ALL','CAFE24','NAVER','COUPANG']);
  await page.getByLabel('현재 페이지 채널').selectOption('ALL');await page.waitForFunction(()=>displayMode==='live'&&displayedOrders.length===5);
  await page.locator('.order-row').first().click();
  assert.equal(await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).isVisible(),true);
  await page.locator('.order-select').nth(1).check();
  await page.locator('#selection-review').click();
  assert.match(await page.locator('.detail-product').innerText(),/검증 상품 2/,'content review follows checked order rather than previous inspector');
  await page.getByLabel('현재 페이지 모두 선택').check();
  assert.equal(await page.locator('.order-select:checked').count(),5);
  assert.equal(await page.locator('#selection-register').isDisabled(),true,'mixed eligibility does not enable registration');
  await page.locator('.order-select').nth(4).uncheck();
  assert.equal(await page.locator('.order-select:checked').count(),4);
  await page.getByRole('button',{name:'선택 송장 등록',exact:true}).click();
  await page.waitForFunction(()=>registrationBusy);
  assert.equal(await page.getByRole('button',{name:'선택 송장 등록',exact:true}).isDisabled(),true);
  await page.evaluate(()=>void registerSelectedInvoices());
  await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.finishRegistration;i++)await new Promise(resolve=>setTimeout(resolve,10));globalThis.finishRegistration();});
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await app.evaluate(()=>globalThis.registrationPosts),1);
  assert.equal(await app.evaluate(()=>globalThis.registrationDialogs),1);
  const results=await page.locator('#registration-items').innerText();
  for(const text of ['쇼핑몰 등록 완료','처리 대기 · 등록 완료 아님','등록 실패','등록 여부 확인 필요'])assert.ok(results.includes(text),text);
  assert.equal(await page.locator('.order-select:checked').count(),0);
  assert.equal(await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).isDisabled(),true);
  await page.getByLabel('현재 페이지 채널').selectOption('NAVER');await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='NAVER');
  assert.equal(await page.locator('#registration-results').isVisible(),false);
  await app.evaluate(()=>{globalThis.delayChannel=true;});
  await page.evaluate(()=>void changeOrderChannel('COUPANG'));
  await page.evaluate(()=>changeOrderChannel('CAFE24'));
  await app.evaluate(()=>globalThis.finishChannel?.());
  assert.equal(await page.locator('#order-channel').inputValue(),'CAFE24');
  assert.equal(await page.locator('.order-row').count(),4,'registered order has left ACTIVE');
  await app.evaluate(()=>{globalThis.registrationBase=5;globalThis.registrationPosts=0;globalThis.finishRegistration=null;});
  await page.evaluate(()=>runHubAction('refresh'));
  await page.locator('.order-row').first().click();
  await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).click();
  await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.finishRegistration;i++)await new Promise(resolve=>setTimeout(resolve,10));if(!globalThis.finishRegistration)throw Error('Registration not started');});
  await page.evaluate(()=>runHubAction('viewCompleted'));
  await app.evaluate(()=>globalThis.finishRegistration());
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await page.locator('#registration-results').isVisible(),false,'late registration result must not enter another scope');
  assert.equal(await page.locator('.order-select:checked').count(),0);
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('#registration-results').isVisible(),false);
  console.log(JSON.stringify({status:'PASS',scope:'server channels, eligible bulk selection, native single/bulk registration, duplicate lock, four truthful results, stale channel/registration discard, logout'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
