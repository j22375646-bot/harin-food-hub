'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{_electron}=require('playwright'),fs=require('fs'),os=require('os');
(async()=>{const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_MONTH_DESIGN_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'moaon-month-design-')),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="calendar"]').count(),1);
 await app.evaluate(({session})=>{globalThis.monthReads=0;globalThis.monthFail=false;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
if(url.includes('/calendar/entries')){const q=new URL(url).searchParams,from=q.get('from'),to=q.get('to');if(from!==to)globalThis.monthReads++;return globalThis.monthFail?new Response('',{status:503}):Response.json({ok:true,range:{from,to},holidayReady:true,holidays:[{date:from,name:'시험 공휴일'}],entries:[{id:'event',title:'월간 발주 확인',body:'본문 첫 줄\\n<img src=x>',type:'EVENT',date:from,endDate:to,time:'10:00',status:'OPEN'},{id:'done',title:'완료된 확인',body:'완료 시험',type:'MEMO',date:from,endDate:to,time:'09:00',status:'DONE'}]});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.locator('[data-route="calendar"]').click();
 await page.waitForFunction(()=>document.querySelector('#month-entries').textContent.includes('월간 발주'));
 await page.locator('[data-calendar-day]').first().click();assert.equal(await app.evaluate(()=>globalThis.monthReads),1);
 await page.locator('[data-month-state=DONE]').click();assert.equal(await page.locator('#month-entries button').count(),1);assert.match(await page.locator('#month-entries').innerText(),/완료된 확인/);assert.match(await page.locator('[data-calendar-day]').first().getAttribute('aria-label'),/일정 1개/);await page.locator('[data-month-state=OPEN]').click();assert.equal(await page.locator('#month-entries button').count(),1);assert.equal(await app.evaluate(()=>globalThis.monthReads),1);await page.locator('#month-today').click();assert.equal(await app.evaluate(()=>globalThis.monthReads),1);
 await page.locator('#month-entries button').click();assert.match(await page.locator('#month-detail').innerText(),/10:00/);
 assert.match(await page.locator('#month-detail').innerText(),/본문 첫 줄/);assert.equal(await page.locator('#month-detail img').count(),0);
 assert.match(await page.locator('#month-page').innerText(),/시험 공휴일/);
 await page.locator('#month-next').click();await page.waitForFunction(()=>globalThis.moaonMonth!=null);await page.waitForFunction(()=>!document.querySelector('#month-next').disabled);assert.equal(await app.evaluate(()=>globalThis.monthReads),2);
 for(const width of [680,1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForTimeout(200);assert.equal(await page.locator('#month-page').evaluate(el=>el.scrollWidth<=el.clientWidth),true);}
 await page.screenshot({path:path.join(os.tmpdir(),'moaon-month-design.png')});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:path.join(os.tmpdir(),'moaon-month-design-dark.png')});
 await app.evaluate(()=>globalThis.monthFail=true);await page.locator('#month-refresh').click();await page.waitForFunction(()=>document.querySelector('#month-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#month-page').innerText(),/월간 발주/);
 await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.locator('#month-detail').innerText(),'');
 const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:true,focused:false});
 console.log('PASS monthly calendar navigation selection no extra GET error logout widths');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
