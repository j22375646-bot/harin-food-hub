'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{_electron}=require('playwright');
(async()=>{
 const output=process.env.MOAON_DAYBOOK_OUTPUT||'D:/GPT/tmp/daybook-layout';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_DAYBOOK_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'daybook-layout-')),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
  await app.evaluate(({session,ipcMain})=>{
   const names=['국산 작두콩차 30티백, 3봉 세트','수제 쌀조청 500g','구수한 팥차 30티백','얼그레이 홍차 30티백','볶은 우엉차 20티백','도라지 조청 380g'];
   session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
    if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
    const scope=new URL(url).searchParams.get('stage'),orders=scope==='ACTIVE'?[]:names.map((productName,i)=>({hubOrderId:'HR-C24-'+String(i+1).padStart(8,'0'),productName,platform:['CAFE24','NAVER','COUPANG'][i%3],orderedAt:new Date(Date.now()-i*86400000).toISOString(),stage:'SHIPPING',quantity:i%2+1,amount:[32600,29000,22000,15000,24000,32000][i]}));
    return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
   };
   ipcMain.removeHandler('moaon-hub:read-today-calendar');ipcMain.handle('moaon-hub:read-today-calendar',()=>({status:'READY',date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),entries:[{time:'14:00',title:'시험 일정 · 차류 생산 확인',status:'OPEN'}]}));
  });
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.evaluate(()=>{showRoute('today');});await page.waitForFunction(()=>!document.querySelector('#overview-refresh').disabled);
  await page.evaluate(()=>{overviewScope='IN_TRANSIT';overviewScopeChosen=true;renderOverview();financeValue={month:todayDateKey().slice(0,7),generatedAt:new Date().toISOString(),metrics:{sales:{value:1264000,status:'READY'},profit:{value:324000,status:'READY'},balance:{value:null,status:'BLOCKED'}}};renderFinance();document.querySelector('#statusbar-data').textContent='디자인 검증 · 가상 주문과 금액 · 실제 업무 실행 없음';});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setMinimumSize(640,520));
  assert.equal(await page.locator('.moaon-logo').count(),3);
  assert.equal(await page.locator('.nav-button').count(),11);
  assert.equal(await page.locator('.brand-mark').count(),0);
  assert.equal(await page.locator('#business-name').count(),1);
  assert.equal(await page.locator('.daybook-order').count(),4);
  await page.evaluate(()=>document.querySelector('#overview-expand').click());assert.equal(await page.locator('.daybook-order').count(),6);await page.evaluate(()=>document.querySelector('#overview-expand').click());
  assert.equal(await page.locator('.daybook-chart-column').count(),7);
  assert.match(await page.locator('#app-breadcrumb-page').innerText(),/오늘/);
  const results=[];
  for(const width of [1440,1060,820,680])for(const theme of ['light','dark']){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);await page.evaluate(theme=>{applyTheme(theme);document.querySelector('#main-content').scrollTop=0;},theme);await page.waitForTimeout(450);
   for(const state of ['READY','UNAVAILABLE']){
    await page.evaluate(state=>{overviewValues.IN_TRANSIT.status=state;renderOverview();},state);
    const geometry=await page.evaluate(()=>{
     const rect=el=>el.getBoundingClientRect(),tabs=[...document.querySelectorAll('#overview-cards button')],main=document.querySelector('.page.is-visible');
     return {sidebarBottom:rect(document.querySelector('.sidebar')).bottom,viewport:innerHeight,bodyOverflow:document.body.scrollHeight>innerHeight+1,horizontal:main.scrollWidth>main.clientWidth+1,tabsHeight:tabs.map(el=>rect(el).height),countFont:tabs.map(el=>getComputedStyle(el.querySelector('strong')).fontSize),tabClipping:tabs.some(el=>el.scrollWidth>el.clientWidth+1),orderFont:document.querySelector('.daybook-order-info strong')?getComputedStyle(document.querySelector('.daybook-order-info strong')).fontSize:null};
    });
    assert.equal(geometry.bodyOverflow,false);assert.equal(geometry.horizontal,false);assert.equal(geometry.tabClipping,false);assert.equal(geometry.sidebarBottom,geometry.viewport);assert.ok(Math.max(...geometry.tabsHeight)-Math.min(...geometry.tabsHeight)<1);assert.ok(geometry.countFont.every(size=>parseFloat(size)>=13));if(state==='READY')assert.ok(parseFloat(geometry.orderFont)>=15);else assert.equal(geometry.orderFont,null);results.push({width,theme,state,...geometry});
    if(state==='READY')await page.screenshot({path:path.join(output,`today-${width}-${theme}.png`)});
   }
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1060,600));await page.waitForFunction(()=>innerHeight===600);await page.evaluate(()=>{document.querySelector('#main-content').scrollTop=1000;document.querySelector('.primary-nav').scrollTop=1000;});
  assert.ok(await page.locator('[data-route=settings]').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));assert.equal(await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().bottom),600);
  await page.evaluate(async()=>{applyHubResult(await window.moaonHub.viewChannel('NAVER'));overviewScope='IN_TRANSIT';await openOverviewOrders('HR-C24-00000001');});
  assert.equal(await page.evaluate(()=>selectedChannel),'ALL');assert.equal(await page.evaluate(()=>selectedOrderId),'HR-C24-00000001');
  await page.waitForTimeout(550);
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{applyTheme(theme);document.querySelector('#order-detail').scrollTop=180;},theme);
   assert.notEqual(await page.locator('#order-detail .detail-header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   await page.screenshot({path:path.join(output,`inspector-scrolled-${theme}.png`)});
  }
  for(const width of [1440,1060,820,680]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);
   await page.evaluate(()=>{applyTheme('light');document.querySelector('.studio-business').open=true;});
   if(width>1000)assert.ok(await page.locator('.business-card').evaluate(el=>el.getBoundingClientRect().right<=document.querySelector('.sidebar').getBoundingClientRect().right));
   for(const route of ['today','orders','settlement','insights','keywords','calendar','inventory','stock','cs','settings']){
    await page.evaluate(route=>showRoute(route),route);await page.waitForTimeout(100);
    const geometry=await page.evaluate(()=>({right:document.querySelector('.chrome-actions').getBoundingClientRect().right,limit:innerWidth-138,overflow:document.querySelector('#main-content').scrollWidth>document.querySelector('#main-content').clientWidth+1}));
    assert.ok(geometry.right<=geometry.limit,`${route}/${width} caption overlap`);assert.equal(geometry.overflow,false,`${route}/${width} overflow`);
    if(width===1060)await page.screenshot({path:path.join(output,`audit-${route}.png`)});
   }
  }
  await page.evaluate(()=>{showRoute('calendar');showRoute('settings');goBack();});assert.equal(await page.locator('.page.is-visible').getAttribute('data-page'),'calendar');
  assert.equal(await page.locator('.month-toolbar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.deepEqual(errors,[]);const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,focused:w.isFocused()};});assert.deepEqual(placement,{right:false,focused:false});
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('PASS Daybook 4 widths, 2 themes, ready/error typography and tab alignment, six orders, full-height rail, short window, no focus');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
