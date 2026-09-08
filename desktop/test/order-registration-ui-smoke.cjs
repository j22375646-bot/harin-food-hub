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
    globalThis.registrationPosts=0;globalThis.registrationDialogs=0;globalThis.serverHistoryReads=0;globalThis.cancelRegistration=false;
    dialog.showMessageBox=async()=>{globalThis.registrationDialogs++;return {response:globalThis.cancelRegistration?0:1};};
    session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options)=>{
      if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
      if(url.includes('/api/shipping/actions?')){globalThis.serverHistoryReads++;return Response.json({ok:true,orders:[]});}
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
  await page.getByText('추가 작업',{exact:true}).click();
  await page.locator('#selection-review').click();
  assert.match(await page.locator('.detail-product').innerText(),/검증 상품 2/,'content review follows checked order rather than previous inspector');
  await page.getByLabel('현재 페이지 모두 선택').check();
  assert.equal(await page.locator('.order-select:checked').count(),5);
  assert.equal(await page.locator('#selection-register').isDisabled(),true,'mixed eligibility does not enable registration');
  await page.locator('.order-select').nth(4).uncheck();
  assert.equal(await page.locator('.order-select:checked').count(),4);
  await page.evaluate(()=>{shippingFollowup.set('HR-C24-00000001',{status:'CHECK_REQUIRED'});renderShippingFollowup();});
  await page.getByText('추가 작업',{exact:true}).click();
  await page.getByRole('button',{name:'발급된 송장 등록',exact:true}).click();
  await page.waitForFunction(()=>registrationBusy);
  assert.equal(await page.locator('#selection-register').isDisabled(),true);
  await page.evaluate(()=>void registerSelectedInvoices());
  await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.finishRegistration;i++)await new Promise(resolve=>setTimeout(resolve,10));globalThis.finishRegistration();});
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await app.evaluate(()=>globalThis.registrationPosts),1);
  assert.equal(await app.evaluate(()=>globalThis.registrationDialogs),1);
  const results=await page.locator('#registration-items').innerText();
  for(const text of ['쇼핑몰 등록 완료','처리 대기 · 등록 완료 아님','등록 실패','등록 여부 확인 필요'])assert.ok(results.includes(text),text);
  assert.equal(await page.locator('#shipping-followup .auto-shipping-item').count(),3,'pending, failed, and uncertain registrations stay in the session follow-up list');
  assert.equal(await page.locator('#shipping-followup').innerText().then(text=>text.includes('HR-C24-00000001')),false,'successful registration is removed from follow-up');
  assert.equal(await page.locator('[data-manual-history-refresh]').count(),1,'manual results expose one server-history action');
  const postsBeforeHistory=await app.evaluate(()=>globalThis.registrationPosts);
  await app.evaluate(({ipcMain})=>{
    ipcMain.removeHandler('moaon-hub:server-shipping-history');
    ipcMain.handle('moaon-hub:server-shipping-history',()=>{globalThis.serverHistoryReads++;return {status:'READY',orders:[{hubOrderId:'HR-C24-00000002',status:'PENDING'}]};});
  });
  await page.getByRole('button',{name:'서버 등록 이력 다시 확인',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#server-history-status').textContent!=='서버 기록 조회 중…');
  assert.equal(await app.evaluate(()=>globalThis.serverHistoryReads),1,'manual result action performs a server history read');
  assert.equal(await app.evaluate(()=>globalThis.registrationPosts),postsBeforeHistory,'server history action never repeats invoice registration');
  assert.equal(await page.locator('#server-shipping-history').getAttribute('open'),'','direct manual refresh opens the returned server history');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,800));
  await page.evaluate(()=>applyTheme('dark'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'manual result remains within a narrow desktop viewport');
  await page.screenshot({path:path.resolve(__dirname,'../../.superpowers/p445-results.png')});
  await page.evaluate(()=>applyTheme('light'));
  assert.equal(await page.locator('.order-select:checked').count(),0);
  assert.equal(await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).isDisabled(),true);
  await page.getByLabel('현재 페이지 채널').selectOption('NAVER');await page.waitForFunction(()=>displayMode==='live'&&selectedChannel==='NAVER');
  assert.equal(await page.locator('#registration-results').isVisible(),false);
  assert.equal(await page.locator('[data-manual-history-refresh]').count(),0,'navigation clears the old manual history action');
  assert.equal(await page.locator('#shipping-followup .auto-shipping-item').count(),3,'manual follow-up survives channel navigation');
  await app.evaluate(()=>{globalThis.delayChannel=true;});
  await page.evaluate(()=>void changeOrderChannel('COUPANG'));
  await page.evaluate(()=>changeOrderChannel('CAFE24'));
  await app.evaluate(()=>globalThis.finishChannel?.());
  assert.equal(await page.locator('#order-channel').inputValue(),'CAFE24');
  assert.equal(await page.locator('.order-row').count(),4,'registered order has left ACTIVE');
  const followupBeforeCancel=await page.locator('#shipping-followup').innerText();
  await app.evaluate(({ipcMain})=>{
    globalThis.cancellationIpc=0;
    ipcMain.removeHandler('moaon-hub:register-invoices');
    ipcMain.handle('moaon-hub:register-invoices',()=>{globalThis.cancellationIpc++;return {status:'REVIEW_CANCELLED',results:[]};});
  });
  await page.locator('.order-row').first().click();
  await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#registration-status').textContent.includes('취소했습니다'));
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await page.locator('#shipping-followup').innerText(),followupBeforeCancel,'cancelled review adds no follow-up item');
  assert.equal(await page.locator('[data-manual-history-refresh]').count(),0,'cancelled review leaves no stale or new history action');
  assert.equal(await app.evaluate(()=>globalThis.cancellationIpc),1,'cancelled renderer result is handled once');
  assert.equal(await app.evaluate(()=>globalThis.registrationPosts),postsBeforeHistory,'cancelled review sends no registration request');
  await app.evaluate(({ipcMain})=>{
    ipcMain.removeHandler('moaon-hub:register-invoices');
    ipcMain.handle('moaon-hub:register-invoices',async(_event,ids)=>{
      await new Promise(resolve=>{globalThis.finishRegistration=resolve;});
      return {status:'COMPLETED',results:ids.map(hubOrderId=>({hubOrderId,status:'REGISTERED'}))};
    });
  });
  await app.evaluate(()=>{globalThis.registrationBase=5;globalThis.registrationPosts=0;globalThis.finishRegistration=null;});
  await page.evaluate(()=>runHubAction('refresh'));
  const staleFollowupId=await page.evaluate(()=>{const id=orderId(displayedOrders[0]);shippingFollowup.set(id,{status:'CHECK_REQUIRED'});renderShippingFollowup();return id;});
  await page.locator('.order-row').first().click();
  await page.getByRole('button',{name:'이 주문 송장 등록',exact:true}).click();
  await app.evaluate(async()=>{for(let i=0;i<100&&!globalThis.finishRegistration;i++)await new Promise(resolve=>setTimeout(resolve,10));if(!globalThis.finishRegistration)throw Error('Registration not started');});
  await page.evaluate(()=>runHubAction('viewCompleted'));
  await app.evaluate(()=>globalThis.finishRegistration());
  await page.waitForFunction(()=>!registrationBusy);
  assert.equal(await page.locator('#registration-results').isVisible(),false,'late registration result must not enter another scope');
  assert.match(await page.locator('#shipping-followup').textContent(),new RegExp(staleFollowupId),'late registration success must not delete a current-session follow-up after scope change');
  assert.equal(await page.locator('.order-select:checked').count(),0);
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('#registration-results').isVisible(),false);
  console.log(JSON.stringify({status:'PASS',scope:'server channels, eligible bulk selection, native single/bulk registration, duplicate lock, four truthful results, stale channel/registration discard, logout'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
