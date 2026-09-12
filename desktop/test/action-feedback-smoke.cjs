'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_FEEDBACK_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/feedback-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
 await app.evaluate(({session})=>{
  const me='10000000-0000-4000-8000-000000000001';globalThis.feedbackFixture={quantity:1,fail:true,hold:false,me,members:[{id:me,name:'화면 검증 직원',title:'직원',color:'violet',notifications:false,revision:1}],tasks:[{id:'20000000-0000-4000-8000-000000000001',title:'화면 검증 · 출고 확인',notes:'',due_date:'2026-09-13',assigned_to:me,created_by:me,checklist:[],status:'OPEN',revision:1}]};
  session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{const f=globalThis.feedbackFixture;
   if(url.endsWith('/api/moaon/team')){
    if(options.method==='POST'){
     if(f.hold)await new Promise(r=>globalThis.releaseFeedback=r);
     if(f.fail)return Response.json({ok:false,code:'TEAM_CONFLICT'});
     const action=JSON.parse(options.body).action;f.tasks[0].status=action==='COMPLETE'?'DONE':'OPEN';f.tasks[0].revision++;return Response.json({ok:true,value:{saved:true}});
    }return Response.json({ok:true,value:{me:f.me,members:f.members,tasks:f.tasks,events:[]}});
   }
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
   return Response.json({ok:true,orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',stage:'PAID',productName:'가상 작두콩차',quantity:f.quantity,amount:15000}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
  };
 });
 await page.evaluate(()=>runHubAction('viewActive'));await page.evaluate(()=>showRoute('orders'));await page.locator('.order-row').waitFor();assert.equal(await page.locator('.order-change-badge').count(),0);
 const initialHeight=await page.locator('.order-row').evaluate(e=>e.getBoundingClientRect().height);
 await app.evaluate(()=>globalThis.feedbackFixture.quantity=2);await page.evaluate(()=>runHubAction('viewActive'));assert.equal(await page.locator('.order-change-badge').count(),1);assert.equal(await page.locator('.order-row').evaluate(e=>e.getBoundingClientRect().height),initialHeight);
 await page.screenshot({path:'D:/GPT/tmp/p4141-order-feedback.png'});
 await page.evaluate(()=>renderOrders());await page.waitForTimeout(30);assert.equal(await page.locator('.order-change-badge').count(),1,'badge survives repaint');assert.equal(await page.locator('.order-confirmed-change').count(),0,'filter repaint cannot repeat a consumed animation');
 await page.evaluate(()=>runHubAction('viewActive'));assert.equal(await page.locator('.order-change-badge').count(),0,'unchanged read stays quiet');
 await app.evaluate(()=>globalThis.feedbackFixture.quantity=3);await page.evaluate(()=>{freshnessChanged=true;return reloadChangedOrders();});await page.waitForTimeout(50);assert.equal(await page.locator('.order-change-badge').count(),1,'automatic freshness repaint keeps badge');assert.equal(await page.locator('.order-confirmed-change').count(),1,'automatic freshness refresh animates the final mounted row');
 await page.evaluate(()=>showRoute('calendar'));const checkbox=page.locator('#team-board .team-complete').first();await checkbox.waitFor();await checkbox.evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('#team-board .team-sync').textContent.includes('먼저 수정'));assert.equal(await page.locator('.action-feedback').count(),0,'failure has no success feedback');
 await app.evaluate(()=>{globalThis.feedbackFixture.fail=false;globalThis.feedbackFixture.hold=true;});await checkbox.evaluate(e=>e.click());await page.waitForTimeout(150);assert.equal(await page.locator('.action-feedback').count(),0,'pending has no success feedback');
 await app.evaluate(()=>{globalThis.feedbackFixture.hold=false;globalThis.releaseFeedback();});await page.locator('.action-feedback:popover-open').waitFor();assert.match(await page.locator('.action-feedback').innerText(),/업무 완료를 저장/);assert.equal(await checkbox.isChecked(),true);
 await page.waitForTimeout(250);await page.screenshot({path:'D:/GPT/tmp/p4141-team-feedback-light.png'});await page.evaluate(()=>applyTheme('dark'));await page.waitForTimeout(250);await page.screenshot({path:'D:/GPT/tmp/p4141-team-feedback-dark.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.action-feedback-check').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.getByRole('button',{name:'완료 안내 닫기'}).click();assert.equal(await page.locator('.action-feedback').count(),0);
 await checkbox.evaluate(e=>e.click());await page.waitForFunction(()=>!document.querySelector('#team-board .team-complete').disabled);assert.equal(await page.locator('.action-feedback').count(),0,'reopen is not completion');
 await checkbox.evaluate(e=>e.click());await page.locator('.action-feedback:popover-open').waitFor();await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.locator('.action-feedback').count(),0,'logout clears feedback');
 assert.deepEqual(errors,[]);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false);
 console.log('PASS isolated order change dedup/no reflow, failed/pending/success/reopen/logout team feedback, light/dark/reduced motion; synthetic server only');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
