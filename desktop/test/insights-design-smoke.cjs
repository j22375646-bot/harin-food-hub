'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{_electron}=require('playwright'),fs=require('fs'),os=require('os');
(async()=>{const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_INSIGHTS_DESIGN_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'moaon-insights-design-')),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="insights"]').count(),1);
 await page.evaluate(()=>{const notice=document.createElement('div');notice.textContent='자동 화면 검증 · 가상 분석 자료 · 운영 데이터 아님';notice.style.cssText='position:fixed;top:0;left:90px;z-index:9999;padding:6px 14px;background:#fff4ce;color:#3b2f00;font-size:14px;pointer-events:none';document.body.append(notice);});
 await app.evaluate(({session})=>{globalThis.insightsReads=0;globalThis.insightsError=false;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(url.endsWith('/insights')){globalThis.insightsReads++;return globalThis.insightsError?new Response('',{status:503}):Response.json({ok:true,writePolicy:'READ_ONLY',generatedAt:'2026-09-09T09:00:00Z',channel:{platform:'NAVER',name:'네이버',reportCount:1,revenue:0,profit:null,changeRate:null,cause:'비교 근거 부족',causeNote:'자료 확인 <img src=x>',action:'키워드 근거 검토',actionNote:'자동 변경 없음',currentPeriod:{start:'2026-09-01T00:00:00Z',end:'2026-09-07T00:00:00Z',createdAt:'2026-09-08T00:00:00Z'}},reports:[{id:'r1',title:'테스트 주간 보고서',detail:{sections:[{title:'결정',items:[{title:'판단 보류',body:'자료 검토 <img src=x>'}]},{title:'위험',items:[{title:'표본 부족',body:'구매 근거를 확인하세요.'}]}],truncated:true},periodStart:'2026-09-01T00:00:00Z',periodEnd:'2026-09-07T00:00:00Z',createdAt:'2026-09-08T00:00:00Z'}],caveats:['현재 수집 상태 확인 필요']});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.locator('[data-route="insights"]').click();
 await page.waitForFunction(()=>document.querySelector('#insights-reports').textContent.includes('테스트'));
 const revisit=await page.evaluate(()=>{const list=document.getElementById('insights-reports'),first=list.firstChild,o=new MutationObserver(()=>{});o.observe(list,{childList:true});const samples=[];for(let i=0;i<20;i++){showRoute('settings');const start=performance.now();showRoute('insights');samples.push(performance.now()-start);}const mutations=o.takeRecords().length;o.disconnect();samples.sort((a,b)=>a-b);return {route:'insights',mutations,sameNode:first===list.firstChild,medianMs:samples[10],p95Ms:samples[18]};});console.log('REVISIT '+JSON.stringify(revisit));if(process.env.MOAON_EXPECT_REUSE==='1'){assert.equal(revisit.mutations,0);assert.equal(revisit.sameNode,true);}
 assert.match(await page.locator('#insights-metrics').innerText(),/0원/);assert.match(await page.locator('#insights-metrics').innerText(),/판단 보류/);
 assert.equal(await page.locator('#insights-page img').count(),0);
 await page.evaluate(()=>{showRoute('orders');showRoute('insights');});assert.equal(await app.evaluate(()=>globalThis.insightsReads),1);
 const search=async text=>{await page.locator('#insights-search').fill(text);};await search('표본 부족');assert.equal(await page.locator('[data-insights-report]').count(),1);await search('없는자료');assert.equal(await page.locator('[data-insights-report]').count(),0);assert.equal(await page.locator('#insights-search-count').innerText(),'0 / 1개');await page.locator('#insights-search-reset').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'insights-search');assert.equal(await app.evaluate(()=>globalThis.insightsReads),1);
 const trigger=page.locator('[data-insights-report="r1"]');
 assert.equal(await trigger.count(),1);
 await trigger.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('#insights-detail').getAttribute('aria-hidden')==='false');if(process.env.MOAON_EXPECT_REUSE==='1'){assert.equal(await page.evaluate(()=>{const h=document.querySelector('#insights-detail-body').firstChild;showRoute('settings');showRoute('insights');return h===document.querySelector('#insights-detail-body').firstChild;}),true);}
 assert.equal(await page.locator('.insights-section-nav button').count(),2);assert.ok(await page.locator('.insights-section-nav button').first().evaluate(el=>el.getBoundingClientRect().width>=64));await page.locator('.insights-section-nav button').last().click();assert.equal(await page.evaluate(()=>document.activeElement.className),'insights-detail-section');
 assert.match(await page.locator('#insights-detail').innerText(),/표본 부족/);
 assert.match(await page.locator('#insights-detail').innerText(),/일부/);
 assert.equal(await page.locator('#insights-detail img').count(),0);
 assert.equal(await app.evaluate(()=>globalThis.insightsReads),1);
 await page.waitForTimeout(400);
 await search('매칭안되는조건');assert.equal(await page.locator('#insights-detail').getAttribute('aria-hidden'),'true');assert.equal(await page.locator('#insights-detail-body').innerText(),'');await page.locator('#insights-search-reset').click();await trigger.click();await page.waitForTimeout(400);
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
 for(const width of [1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);await page.waitForTimeout(250);if(!await page.locator('#insights-page').evaluate(el=>el.scrollWidth<=el.clientWidth)){console.log(await page.locator('#insights-page').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,wide:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>el.getBoundingClientRect().right).map(n=>[n.tagName,n.className,n.getBoundingClientRect().width]).slice(0,12)})));await page.screenshot({path:path.join(os.tmpdir(),'moaon-insights-overflow.png')});throw Error('overflow');}}}
 await page.locator('#insights-detail').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(os.tmpdir(),'moaon-insights-design.png')});
 const beforeExpiry=await app.evaluate(()=>globalThis.insightsReads);await page.evaluate(()=>{globalThis.originalRevisitNow=Date.now;const shifted=Date.now()+300001;Date.now=()=>shifted;window.moaonInsights.ensure();window.moaonInsights.ensure();});await page.waitForFunction(()=>document.getElementById('insights-page').getAttribute('aria-busy')==='false');assert.equal(await app.evaluate(()=>globalThis.insightsReads),beforeExpiry+1);await page.evaluate(()=>{Date.now=globalThis.originalRevisitNow;delete globalThis.originalRevisitNow;});
 await app.evaluate(()=>globalThis.insightsError=true);await page.locator('#insights-refresh').click();await page.waitForFunction(()=>document.querySelector('#insights-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#insights-reports').innerText(),/테스트/);
 assert.equal(await page.locator('#insights-detail-body').innerText(),'');
 assert.equal(await page.locator('.insights-load-state').getAttribute('data-state'),'error');assert.equal(await page.locator('#insights-search-count').innerText(),'조회 실패');
 await page.locator('.insights-load-state').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(os.tmpdir(),'moaon-insights-error.png')});
 await app.evaluate(({session})=>{globalThis.insightsError=false;const s=session.fromPartition('persist:moaon-harin-readonly'),fetch=s.fetch;s.fetch=async url=>{if(url.endsWith('/insights'))await new Promise(resolve=>globalThis.releaseInsights=resolve);return fetch(url);};});
 const beforeRetry=await app.evaluate(()=>globalThis.insightsReads);await page.locator('.insights-load-state button').click();await page.waitForFunction(()=>document.querySelector('.insights-load-state')?.dataset.state==='loading');
 assert.equal(await page.locator('#insights-refresh').isDisabled(),true);assert.equal(await page.locator('.insights-load-state button').count(),0);assert.equal(await page.locator('#insights-search-count').innerText(),'보고서 조회 중');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.insights-load-state').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>window.moaonInsights.ensure());await app.evaluate(()=>globalThis.releaseInsights());await page.waitForFunction(()=>document.querySelector('[data-insights-report="r1"]'));assert.equal(await app.evaluate(()=>globalThis.insightsReads),beforeRetry+1);assert.equal(await page.locator('.insights-load-state').count(),0);
 await page.evaluate(()=>runHubAction('disconnect'));assert.doesNotMatch(await page.locator('#insights-page').innerText(),/테스트/);
 const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:false,focused:false});
 console.log('PASS insights zero unknown report text safety cooldown error logout widths themes');
 }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
