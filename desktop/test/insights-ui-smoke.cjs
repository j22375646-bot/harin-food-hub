'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="insights"]').count(),1);
 await app.evaluate(({session})=>{globalThis.insightsReads=0;globalThis.insightsError=false;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(url.endsWith('/insights')){globalThis.insightsReads++;return globalThis.insightsError?new Response('',{status:503}):Response.json({ok:true,writePolicy:'READ_ONLY',generatedAt:'2026-09-09T09:00:00Z',channel:{platform:'NAVER',name:'네이버',reportCount:1,revenue:0,profit:null,changeRate:null,cause:'비교 근거 부족',causeNote:'자료 확인 <img src=x>',action:'키워드 근거 검토',actionNote:'자동 변경 없음',currentPeriod:{start:'2026-09-01T00:00:00Z',end:'2026-09-07T00:00:00Z',createdAt:'2026-09-08T00:00:00Z'}},reports:[{id:'r1',title:'테스트 주간 보고서',detail:{sections:[{title:'결정',items:[{title:'판단 보류',body:'자료 검토 <img src=x>'}]},{title:'위험',items:[{title:'표본 부족',body:'구매 근거를 확인하세요.'}]}],truncated:true},periodStart:'2026-09-01T00:00:00Z',periodEnd:'2026-09-07T00:00:00Z',createdAt:'2026-09-08T00:00:00Z'}],caveats:['현재 수집 상태 확인 필요']});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.locator('[data-route="insights"]').click();
 await page.waitForFunction(()=>document.querySelector('#insights-reports').textContent.includes('테스트'));
 assert.match(await page.locator('#insights-metrics').innerText(),/0원/);assert.match(await page.locator('#insights-metrics').innerText(),/판단 보류/);
 assert.equal(await page.locator('#insights-page img').count(),0);
 await page.evaluate(()=>{showRoute('orders');showRoute('insights');});assert.equal(await app.evaluate(()=>globalThis.insightsReads),1);
 const trigger=page.locator('[data-insights-report="r1"]');
 assert.equal(await trigger.count(),1);
 await trigger.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#insights-detail').getAttribute('aria-hidden')==='false');
 assert.match(await page.locator('#insights-detail').innerText(),/표본 부족/);
 assert.match(await page.locator('#insights-detail').innerText(),/일부/);
 assert.equal(await page.locator('#insights-detail img').count(),0);
 assert.equal(await app.evaluate(()=>globalThis.insightsReads),1);
 await page.waitForTimeout(400);
 const widths=await page.evaluate(async()=>{
  const widths=[];document.querySelector('#insights-detail-close').click();
  const start=performance.now();while(performance.now()-start<450){widths.push(document.querySelector('#insights-reports').getBoundingClientRect().width);await new Promise(requestAnimationFrame);}return widths;
 });
 assert.ok(new Set(widths.map(Math.round)).size>3,'list expands over multiple animation frames');
 assert.ok(await page.locator('#insights-workspace').evaluate(el=>el.getBoundingClientRect().height-document.querySelector('#insights-reports').getBoundingClientRect().height<2),'closed detail does not leave vertical whitespace');
 await trigger.click();
 await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator('#insights-detail').evaluate(el=>el.inert),true);
 await trigger.click();
 for(const width of [1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);await page.waitForTimeout(250);assert.equal(await page.locator('#insights-page').evaluate(el=>el.scrollWidth<=el.clientWidth),true);}}
 await page.locator('#insights-detail').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.resolve(__dirname,'../dist/p459b-insights.png')});
 await app.evaluate(()=>globalThis.insightsError=true);await page.locator('#insights-refresh').click();await page.waitForFunction(()=>document.querySelector('#insights-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#insights-reports').innerText(),/테스트/);
 assert.equal(await page.locator('#insights-detail-body').innerText(),'');
 await page.evaluate(()=>runHubAction('disconnect'));assert.doesNotMatch(await page.locator('#insights-page').innerText(),/테스트/);
 console.log('PASS insights zero unknown report text safety cooldown error logout widths themes');
 }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
