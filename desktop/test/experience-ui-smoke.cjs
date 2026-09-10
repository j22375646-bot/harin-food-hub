'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const os=require('node:os'),{_electron}=require('playwright');const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=Boolean(process.env.MOAON_EXPERIENCE_TEST_RUNTIME);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-experience-'));const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_EXPERIENCE_TEST_RUNTIME||root,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>document.getElementById('entry-status').textContent&&!document.getElementById('entry-status').textContent.includes('확인하고 있습니다'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({session})=>{globalThis.overviewRegisterReads=0;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
   if(globalThis.slowOverview)await new Promise(r=>setTimeout(r,300));const scope=new URL(url).searchParams.get('stage');
   if(scope==='REGISTER')globalThis.overviewRegisterReads++;
   if(scope==='IN_TRANSIT')return new Response('',{status:503});
   const total=scope==='REGISTER'?0:1;
   return Response.json({ok:true,orders:total?[{hubOrderId:'HR-C24-00000001',productName:'가명 상품',platform:'CAFE24',stage:'PAID'}]:[],total,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:scope==='COMPLETED'});
  };});
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.evaluate(()=>showRoute('today'));
  const card=scope=>page.locator(`#overview-cards [data-scope="${scope}"]`);
  await page.waitForFunction(()=>!document.querySelector('#overview-refresh').disabled);
  assert.match(await card('REGISTER').innerText(),/0건/,'today must load all scopes without pressing refresh');
  await page.waitForFunction(()=>!document.querySelector('#overview-refresh').disabled);
  assert.match(await card('REGISTER').innerText(),/0건/);assert.match(await card('IN_TRANSIT').innerText(),/확인 필요/);
  assert.match(await card('COMPLETED').innerText(),/부분 확인/);
  assert.match(await page.locator('#overview-priority').textContent(),/확인이 필요/);
  assert.equal(await page.locator('.overview-bar').count(),0);
  await app.evaluate(()=>globalThis.slowOverview=true);await page.evaluate(()=>{void refreshOverview();});assert.equal(await page.locator('#today-overview').getAttribute('aria-busy'),'true');assert.match(await card('ACTIVE').innerText(),/조회 중/);await page.waitForFunction(()=>document.getElementById('today-overview').getAttribute('aria-busy')==='false');await app.evaluate(()=>globalThis.slowOverview=false);
  assert.equal(await page.locator('#overview-cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);assert.equal(await card('REGISTER').locator('strong').evaluate(el=>getComputedStyle(el).fontSize),'34px');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1060,720));await page.waitForFunction(()=>innerHeight===720);
  assert.equal(await page.locator('#overview-cards').evaluate(el=>new Set([...el.querySelectorAll('button small:last-child')].map(n=>Math.round(n.getBoundingClientRect().top))).size),1);
  const savedScroll=await page.evaluate(()=>{const el=document.getElementById('main-content');el.scrollTop=120;return el.scrollTop;});assert.ok(savedScroll>0);await page.evaluate(()=>{showRoute('settings');showRoute('today');});assert.equal(await page.locator('#main-content').evaluate(el=>el.scrollTop),savedScroll);await page.evaluate(()=>document.getElementById('main-content').scrollTop=0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1060,1100));await page.waitForFunction(()=>innerHeight===1100);
  const reads=await app.evaluate(()=>globalThis.overviewRegisterReads);
  await page.evaluate(()=>{showRoute('settings');showRoute('today');showRoute('settings');showRoute('today');});
  await page.waitForTimeout(100);
  assert.equal(await app.evaluate(()=>globalThis.overviewRegisterReads),reads,'rapid return reuses overview instead of fetching again');
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='오늘 화면 디자인 검증 · 가상 주문/금액 · 실제 업무 실행 없음';p.className='experience-test-banner';document.getElementById('today-overview').prepend(p);});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('[data-page=today]').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);await page.waitForTimeout(350);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(os.tmpdir(),`moaon-experience-${theme}.png`)});
  }
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));await page.setViewportSize({width:680,height:1000});assert.equal(await page.locator('#overview-cards').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(os.tmpdir(),'moaon-experience-narrow.png')});await page.setViewportSize(viewport);
  await page.evaluate(()=>document.querySelector('#overview-cards [data-scope=REGISTER]').click());await page.locator('[data-page="orders"]:visible').waitFor();
  assert.match(await page.locator('#order-result-count').innerText(),/0건/);
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('#today-overview').isVisible(),false);
  assert.equal(await page.locator('#overview-cards').innerText().then(x=>x.includes('1건')),false);
  assert.deepEqual(errors,[]);const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:true,focused:false});
  console.log(JSON.stringify({status:'PASS',packaged,scope:'overview numeric cards, loading, scroll restoration, cached return, reduced motion, light/dark/narrow, order navigation, logout'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
