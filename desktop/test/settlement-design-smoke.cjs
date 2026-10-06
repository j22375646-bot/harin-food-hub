'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const fs=require('fs'),os=require('os'),{_electron}=require('playwright');
const {buildWorkspaceSettlementSummary}=require('../../lib/tenancy/workspace-settlement-summary.js');
const payload={ok:true,...buildWorkspaceSettlementSummary({generatedAt:'2026-09-09T09:00:00Z',unifiedSettlement:{period_start:'2026-08-10T09:00:00Z',period_end:'2026-09-09T09:00:00Z',channels:[{platform:'CAFE24',gross_sales:0,actual_payout:0,status:'ACTUAL'},{platform:'NAVER',actual_payout:2000,payout_complete:false,status:'ACTUAL'}],waterfall:{actual_payout:2000,actual_payout_complete:false,expected_payout:null,variance:-100,comparable_channels:1},schedules:[{platform:'NAVER',date:'2026-09-10',amount:100,status:'정산예정',type:'일별 정산'}]}})};
payload.channels.find(channel=>channel.platform==='NAVER').asOf='2026-09-08T09:00:00Z';
Object.assign(payload.channels[1],{advertising:560050.221192,advertisingStats:298005,advertisingCharged:600000,advertisingSource:'BIZMONEY_EXHAUST',expected:4000,fees:123,refunds:456,variance:-78,basis:'매출·비용 대조 근거',payoutBasis:'일부 지급 확인 <img src=x>'});
(async()=>{const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-settlement-design-'));const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_SETTLEMENT_DESIGN_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});try{
 const page=await app.firstWindow();page.on('pageerror',error=>console.log('PAGE_ERROR',error.message));await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="settlement"]').count(),1);
 await app.evaluate(({session},payload)=>{globalThis.settlementMode='ready';globalThis.settlementReads=0;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(new URL(url).pathname.endsWith('/settlement')){globalThis.settlementReads++;const p=structuredClone(payload);if(globalThis.negativeSettlement)p.channels[0].actual=-10;p.period.days=Number(new URL(url).searchParams.get('days')||30);return globalThis.settlementMode==='ready'?Response.json(p):new Response('',{status:503});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };},payload);
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
 await page.locator('[data-route="settlement"]').click();await page.waitForFunction(()=>document.querySelector('#settlement-status').textContent.includes('부분'),{},{timeout:5000}).catch(async error=>{console.log(await page.evaluate(()=>({mode:displayMode,status:document.querySelector('#settlement-status').textContent,api:typeof window.moaonHub.readSettlement})));throw error;});
 await page.evaluate(()=>{const p=document.createElement('p');p.textContent='정산 UI 검증 · 가상 금액 · 실제 입금 아님';document.querySelector('.settlement-heading').append(p);});
 const revisit=await page.evaluate(()=>{const list=document.getElementById('settlement-channels'),first=list.firstChild,o=new MutationObserver(()=>{});o.observe(list,{childList:true});const samples=[];for(let i=0;i<20;i++){showRoute('settings');const start=performance.now();showRoute('settlement');samples.push(performance.now()-start);}const mutations=o.takeRecords().length;o.disconnect();samples.sort((a,b)=>a-b);return {route:'settlement',mutations,sameNode:first===list.firstChild,medianMs:samples[10],p95Ms:samples[18]};});console.log('REVISIT '+JSON.stringify(revisit));if(process.env.MOAON_EXPECT_REUSE==='1'){assert.equal(revisit.mutations,0);assert.equal(revisit.sameNode,true);}
 assert.equal(await page.locator('#settlement-channels article').count(),4);assert.match(await page.locator('#settlement-summary').innerText(),/2,000원/);assert.match(await page.locator('#settlement-summary').innerText(),/확인 필요/);assert.match(await page.locator('#settlement-schedules').innerText(),/100원/);
 assert.equal(await page.locator('.settlement-comparison').count(),4);assert.equal(await page.locator('.settlement-compare-row[data-metric=actual]').first().locator('.settlement-compare-fill').getAttribute('width'),'0');assert.equal(await page.locator('.settlement-compare-row[data-metric=actual]').nth(1).locator('.settlement-compare-fill').getAttribute('width'),'50');assert.equal(await page.locator('.settlement-compare-row[data-metric=expected]').first().locator('svg').count(),0);await page.locator('.settlement-breakdown summary').first().click();assert.equal(await page.locator('.settlement-breakdown').first().evaluate(el=>el.open),true);if(process.env.MOAON_EXPECT_REUSE==='1'){await page.evaluate(()=>{showRoute('settings');showRoute('settlement');});assert.equal(await page.locator('.settlement-breakdown').first().evaluate(el=>el.open),true);}
 assert.match(await page.locator('#settlement-period').innerText(),/조회 시각/);
 assert.equal(await page.locator('#settlement-channels .settlement-asof').count(),4);
 assert.match(await page.locator('#settlement-channels .settlement-asof').first().innerText(),/자료 시각 확인 필요/);
 assert.match(await page.locator('#settlement-channels .settlement-asof').nth(1).innerText(),/자료 시각 2026.*9.*8/);
 await page.evaluate(()=>{showRoute('orders');showRoute('settlement');});assert.equal(await app.evaluate(()=>globalThis.settlementReads),1);
 assert.equal(await page.locator('#settlement-schedules button').count(),1);
 const schedule=page.locator('#settlement-schedules button').first();await schedule.focus();await page.keyboard.press('Enter');
 assert.match(await page.locator('#settlement-detail-title').innerText(),/네이버/);assert.match(await page.locator('#settlement-detail').innerText(),/560,050원/);assert.match(await page.locator('#settlement-detail').innerText(),/298,005원/);assert.doesNotMatch(await page.locator('#settlement-detail').innerText(),/560,050\.221/);
 assert.equal(await schedule.getAttribute('aria-expanded'),'true');
 assert.match(await page.locator('.settlement-selected-schedule').innerText(),/2026-09-10/);
 assert.match(await page.locator('.settlement-selected-schedule').innerText(),/100원/);
 assert.match(await page.locator('.settlement-selected-schedule').innerText(),/입금 완료를 뜻하지 않습니다/);
 assert.match(await page.locator('.settlement-guidance').innerText(),/전체/);
 assert.equal(await app.evaluate(()=>globalThis.settlementReads),1);
 await page.keyboard.press('Escape');assert.equal(await schedule.evaluate(el=>el===document.activeElement),true);
 assert.equal(await schedule.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('[data-settlement-channel]').count(),4);
 await page.locator('[data-settlement-channel="NAVER"]').click();
 assert.equal(await page.locator('.settlement-selected-schedule').count(),0);
 assert.equal(await page.locator('#settlement-detail').getAttribute('aria-hidden'),'false');
 assert.match(await page.locator('#settlement-detail').innerText(),/456원/);
 assert.match(await page.locator('#settlement-detail').innerText(),/123원/);
 assert.match(await page.locator('#settlement-detail').innerText(),/-78원/);
 assert.match(await page.locator('#settlement-detail').innerText(),/일부 지급 확인 <img src=x>/);
 assert.equal(await page.locator('#settlement-detail img').count(),0);
 assert.equal(await app.evaluate(()=>globalThis.settlementReads),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#settlement-detail').getAttribute('aria-hidden'),'true');
 assert.equal(await page.locator('[data-settlement-channel="NAVER"]').evaluate(el=>el===document.activeElement),true);
 await page.locator('[data-settlement-channel="CAFE24"]').click();assert.match(await page.locator('#settlement-detail').innerText(),/0원/);assert.doesNotMatch(await page.locator('#settlement-detail').innerText(),/456원/);
 for(const days of [7,90,30]){await page.locator('[data-settlement-days="'+days+'"]').click();await page.waitForFunction(days=>document.querySelector('#settlement-period').textContent.includes('최근 '+days+'일')&&document.querySelector('#settlement-page').getAttribute('aria-busy')==='false',days);assert.equal(await page.locator('[data-settlement-days="'+days+'"]').getAttribute('aria-pressed'),'true');}
 assert.equal(await page.locator('#settlement-detail').getAttribute('aria-hidden'),'true');
 for(const width of [1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#settlement-summary').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);await page.screenshot({path:'D:/GPT/tmp/p4136-settlement-'+width+'-'+theme+'.png'});}}
 // Shared-scale chart and scroll-following detail, including long recovery labels.
 assert.equal(await page.locator('.settlement-chart-row').count(),4);
 assert.equal(await page.locator('[data-chart-platform=CAFE24] .settlement-overview-fill').evaluate(e=>e.style.width),'0%');
 assert.equal(await page.locator('[data-chart-platform=NAVER] .settlement-overview-fill').evaluate(e=>e.style.width),'100%');
 assert.equal(await page.locator('[data-chart-platform=COUPANG] .settlement-overview-fill').count(),0);
 await page.locator('[data-settlement-metric=expected]').click();assert.equal(await page.locator('[data-settlement-metric=expected]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-settlement-metric=actual]').click();await page.locator('[data-chart-platform=NAVER]').click();await page.waitForTimeout(450);
 await page.evaluate(()=>document.getElementById('main-content').scrollTop=750);
 const sticky=await page.locator('#settlement-detail').evaluate(e=>({top:e.getBoundingClientRect().top,scroll:document.getElementById('main-content').getBoundingClientRect().top+parseFloat(getComputedStyle(document.getElementById('main-content')).paddingTop),position:getComputedStyle(e).position}));assert.equal(sticky.position,'sticky');assert.ok(sticky.top>=sticky.scroll&&sticky.top<sticky.scroll+35,JSON.stringify(sticky));
 const recovery=page.locator('.settlement-reconnect');await recovery.evaluate(e=>e.textContent='API 연결 설정 열기 · 연결 정보와 만료일을 확인하고 다시 연결합니다');
 await page.locator('.settlement-detail-inner').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(100);
 const fit=await recovery.evaluate(e=>{const r=e.getBoundingClientRect(),p=e.closest('.settlement-detail-inner').getBoundingClientRect();return {inside:r.left>=p.left&&r.right<=p.right&&r.bottom<=p.bottom,wrap:e.scrollWidth<=e.clientWidth,height:r.height};});assert.equal(fit.inside,true);assert.equal(fit.wrap,true);assert.ok(fit.height>=44);
 await recovery.click();assert.equal(await page.locator('#settings-panel-api-title').isVisible(),true);assert.equal(await page.locator('[data-settings-target=api-title]').getAttribute('aria-selected'),'true');await page.evaluate(()=>showRoute('settlement'));
 for(const width of [1040,1440]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);
  await page.locator('[data-settlement-channel="NAVER"]').click();await page.waitForTimeout(400);
  assert.equal(await page.locator('#settlement-detail').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
  const motion=await page.evaluate(async()=>{
   const main=document.querySelector('.settlement-main'),samples=[];document.querySelector('#settlement-detail-close').click();
   const start=performance.now();await new Promise(resolve=>{function step(){samples.push(main.getBoundingClientRect().width);if(performance.now()-start<450)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});return samples;
  });
  assert.ok(motion.at(-1)>motion[0]+100);assert.ok(new Set(motion.map(n=>Math.round(n))).size>3,'left area must expand over multiple frames');
  assert.equal(await page.locator('#settlement-detail').evaluate(el=>el.inert),true);
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-settlement-channel="NAVER"]').click();
 assert.equal(await page.locator('#settlement-workspace').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForTimeout(400);
 await page.screenshot({path:path.join(os.tmpdir(),'moaon-settlement-design-detail.png')});await page.locator('#settlement-detail-close').click();await page.evaluate(()=>applyTheme('light'));await page.waitForTimeout(450);await page.screenshot({path:path.join(os.tmpdir(),'moaon-settlement-design-light.png')});
 await app.evaluate(()=>globalThis.negativeSettlement=true);await page.locator('#settlement-refresh').click();await page.waitForFunction(()=>document.querySelector('#settlement-page').getAttribute('aria-busy')==='false');assert.match(await page.locator('.settlement-compare-row[data-metric=actual]').first().innerText(),/-10원/);assert.equal(await page.locator('.settlement-compare-row[data-metric=actual]').first().locator('svg').count(),0);
 const beforeExpiry=await app.evaluate(()=>globalThis.settlementReads);await page.evaluate(()=>{globalThis.originalRevisitNow=Date.now;const shifted=Date.now()+300001;Date.now=()=>shifted;window.moaonSettlement.ensure();window.moaonSettlement.ensure();});await page.waitForFunction(()=>document.getElementById('settlement-page').getAttribute('aria-busy')==='false');assert.equal(await app.evaluate(()=>globalThis.settlementReads),beforeExpiry+1);await page.evaluate(()=>{Date.now=globalThis.originalRevisitNow;delete globalThis.originalRevisitNow;});
 await app.evaluate(()=>globalThis.settlementMode='error');await page.locator('#settlement-refresh').click();await page.waitForFunction(()=>document.querySelector('#settlement-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#settlement-summary').innerText(),/2,000원/);
 assert.doesNotMatch(await page.locator('#settlement-period').innerText(),/조회 시각/);
 assert.equal(await page.locator('#settlement-detail-body').innerText(),'');
 assert.equal(await page.locator('#settlement-detail').getAttribute('aria-hidden'),'true');
 await page.evaluate(()=>runHubAction('disconnect'));assert.doesNotMatch(await page.locator('#settlement-page').innerText(),/2,000원/);
 const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:false,focused:false});
 console.log('PASS settlement cards, partial/null, schedule, cooldown, error, logout, two widths/themes');
 }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
