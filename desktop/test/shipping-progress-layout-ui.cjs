'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],timeout:180000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/Temp/shipping-details-ui-'),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(25000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({ipcMain,session})=>{
   session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   globalThis.readMode='READY';globalThis.holdProgress=true;globalThis.writes=0;globalThis.reloads=0;const now=Date.now();
   globalThis.progressItems=['RUNNING','PENDING','PENDING','FAILED','REGISTERED','RUNNING'].map((status,i)=>({hubOrderId:'HR-C24-'+String(i+1).padStart(8,'0'),platform:'CAFE24',phase:'REGISTER',status,requestId:'12345678-1234-4234-8234-12345678901'+i,createdAt:new Date(now-90000).toISOString(),updatedAt:new Date(now-(i===5?0:60000)).toISOString(),nextAttemptAt:[1,3].includes(i)?new Date(now+120000).toISOString():i===2?new Date(now-5000).toISOString():null}));
   const replace=(name,fn)=>{ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);};
   replace('read-overview',()=>({status:'READY',scopes:{}}));replace('refresh',()=>{globalThis.reloads++;return {status:'UNAVAILABLE'};});
   replace('issue-and-register',()=>{globalThis.writes++;throw Error('Writes forbidden');});
   replace('shipping-progress-read',async(_e,ids)=>{if(globalThis.holdProgress)await new Promise(r=>globalThis.releaseProgress=r);return globalThis.readMode==='READY'?{status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items:globalThis.progressItems.filter(v=>ids.includes(v.hubOrderId))}}:{status:globalThis.readMode};});
  });
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:6,offset:0,checkedAt:new Date().toISOString(),orders:Array.from({length:6},(_,i)=>({hubOrderId:'HR-C24-'+String(i+1).padStart(8,'0'),platform:'CAFE24',productName:'격리 시험 자료 · '+['단계 정체','자동 재시도 예정','예정 시각 경과','실패 기록','등록 완료','실행 중'][i],stage:'PREPARING',visual:{timing:{type:'TODAY',label:'당일출고',detail:'격리 시험 자료'}},quantity:1,amount:1000,details:i===3?{invoice:{status:'ISSUED',number:'6890176974040'}}:{}}))});showRoute('orders');});
  await page.waitForFunction(()=>[...document.querySelectorAll('.shipping-progress-label')].some(n=>n.textContent.includes('확인 중')));
  await page.waitForFunction(()=>false,{},{timeout:200}).catch(()=>{});
  await app.evaluate(()=>{holdProgress=false;releaseProgress?.();});
  await page.waitForFunction(()=>window.moaonShippingProgress.snapshot().length===6);

  const badges=page.locator('.order-shipping-progress:not([hidden])');assert.equal(await badges.count(),6);
  assert.equal(await badges.first().locator('button.shipping-progress-badge').count(),1,'progress is a separate button, not an expanding row');
  assert.equal(await badges.first().locator('..').locator('.shipping-timing-badge').count(),1,'timing and progress share the same sibling rail');
  const centers=await badges.first().evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.querySelector('.shipping-timing-badge').getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2);});assert.ok(centers<=1,'timing and progress are centered on one line');
  const heightBefore=await badges.first().locator('..').boundingBox();
  await badges.first().locator('button.shipping-progress-badge').click();
  assert.equal(await badges.first().locator('.shipping-progress-detail').evaluate(n=>n.matches(':popover-open')),true);
  assert.equal((await badges.first().locator('..').boundingBox()).height,heightBefore.height,'opening progress must not increase row height');
  await page.keyboard.press('Escape');
  assert.equal(await badges.first().locator('.shipping-progress-detail').evaluate(n=>n.matches(':popover-open')),false);
  await badges.first().locator('.shipping-progress-badge').click();
  await page.locator('.orders-page h2, .orders-page h1').first().click();
  assert.equal(await badges.first().locator('.shipping-progress-detail').evaluate(n=>n.matches(':popover-open')),false,'outside click dismisses the small popup');
  assert.match(await badges.nth(1).locator('.shipping-progress-badge').textContent(),/자동 재시도 대기/);assert.match(await badges.nth(2).locator('.shipping-progress-badge').textContent(),/재시도 실행 확인 필요/);
  assert.equal(await badges.nth(3).getAttribute('data-tone'),'error');assert.equal(await badges.nth(4).getAttribute('data-tone'),'complete');assert.equal(await badges.nth(5).getAttribute('data-tone'),'active');
  assert.equal(await badges.nth(0).locator('.shipping-progress-badge>i').evaluate(n=>getComputedStyle(n).animationName),'none');assert.notEqual(await badges.nth(5).locator('.shipping-progress-badge>i').evaluate(n=>getComputedStyle(n).animationName),'none');
  await badges.nth(3).locator('.shipping-progress-badge').click();assert.match(await badges.nth(3).locator('.shipping-progress-invoice').textContent(),/저장된 송장 있음/);assert.match(await badges.nth(3).locator('.shipping-progress-reason').textContent(),/세부 원인.*확인 필요/);
  const before=await page.evaluate(()=>{selectedOrderIds.add('HR-C24-00000004');return {changed:window.moaonShippingProgress.snapshot()[3].changedAt};});
  await app.evaluate(()=>globalThis.readMode='TIMEOUT');await badges.nth(3).getByRole('button',{name:'상태 다시 확인'}).click();
  await page.waitForFunction(()=>document.querySelector('.order-shipping-progress[data-order-id="HR-C24-00000004"] .shipping-progress-reason').textContent.includes('조회 응답 시간'));
  assert.equal(await badges.nth(3).getAttribute('data-progress-state'),'FAILED');assert.equal(await page.evaluate(()=>window.moaonShippingProgress.snapshot()[3].changedAt),before.changed);
  await app.evaluate(()=>globalThis.readMode='READY');await badges.nth(3).getByRole('button',{name:'상태 다시 확인'}).click();await page.waitForFunction(()=>!window.moaonShippingProgress.snapshot()[3].syncError);
  assert.equal(await badges.nth(3).getAttribute('data-tone'),'error');assert.equal(await page.evaluate(()=>selectedOrderIds.has('HR-C24-00000004')),true);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await badges.nth(3).scrollIntoViewIfNeeded();assert.ok((await badges.nth(3).locator('.shipping-progress-detail').boundingBox()).height<=341);
   assert.equal(await badges.nth(3).locator('.shipping-progress-detail').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
   await page.screenshot({path:'D:/GPT/Temp/shipping-details-'+theme+'.png'});
  }
  await page.keyboard.press('Escape');
  await page.locator('.order-row').nth(3).click();
  for(const width of [1060,1440])for(const collapsed of [false,true])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:980});await page.evaluate(({collapsed,theme})=>{document.querySelector('.preview-shell').classList.toggle('is-sidebar-collapsed',collapsed);document.documentElement.dataset.theme=theme;},{collapsed,theme});await page.waitForTimeout(180);
   const fits=await page.evaluate(()=>[...document.querySelectorAll('.order-item')].every(row=>{const r=row.getBoundingClientRect();return [...row.querySelectorAll('.order-status-rail .shipping-timing-badge,.order-status-rail .shipping-progress-badge')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom+1;});}));assert.equal(fits,true,'all badges remain inside their complete row');
   const contrast=await page.locator('.order-row[aria-pressed=true] .order-invoice').evaluate(n=>{const row=n.closest('.order-item');return {background:getComputedStyle(n).backgroundColor,selected:getComputedStyle(row,'::before').backgroundColor,border:getComputedStyle(n).borderTopWidth,bottom:getComputedStyle(row,'::before').bottom};});assert.notEqual(contrast.background,contrast.selected);assert.equal(contrast.border,'1px');assert.equal(contrast.bottom,'1px');
   await page.screenshot({path:`D:/GPT/Temp/order-layout-${width}-${collapsed}-${theme}.png`});
  }
  assert.equal(await app.evaluate(()=>globalThis.reloads),0);assert.equal(await app.evaluate(()=>globalThis.writes),0);
  console.log(JSON.stringify({status:'PASS',scenarios:6,readOnlyRecheck:true,retainsPhase:true,themes:2,realWrites:0,orderReloads:0}));
 }finally{await app.evaluate(()=>{holdProgress=false;releaseProgress?.();}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
