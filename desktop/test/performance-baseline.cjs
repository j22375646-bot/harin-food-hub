'use strict';
const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {summarize,splitTiming}=require('./performance-metrics.cjs');
const output=path.resolve(process.env.MOAON_PERF_OUTPUT||'D:/GPT/Temp/moaon-performance-20261024');
if(!/^D:\\GPT\\/i.test(output))throw Error('Performance output must remain under D:\\GPT');
fs.mkdirSync(output,{recursive:true});
const runtime=process.env.MOAON_TEST_RUNTIME_ROOT||'D:/GPT/Apps/Moaon/releases/0.202.0/resources/app.asar';
const count=Number(process.env.MOAON_PERF_RUNS||10);
if(!Number.isInteger(count)||count<1||count>20)throw Error('Invalid run count');
async function run(index,networkDelay=0){
 const profile=fs.mkdtempSync(path.join(output,'profile-')),started=performance.now();let app,watchdog;
 const killTest=()=>{const child=app?.process();if(child&&child.exitCode===null&&child.signalCode===null)child.kill();};
 // Kill only this test Electron child on a stuck launch/close. Never the installed app.
 const launch=_electron.launch({executablePath:process.env.MOAON_TEST_ELECTRON||'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'performance-bootstrap.cjs')],timeout:60000,env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtime,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right',MOAON_PERF_NETWORK_DELAY:String(networkDelay)}});
 try{
  app=await launch;watchdog=setTimeout(killTest,90000);watchdog.unref();console.log(`run ${index}: attached`);
  const page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);await page.waitForLoadState('load');
  await page.waitForFunction(()=>typeof renderOrders==='function'&&Boolean(window.moaonHub));
  const shellReadyMs=performance.now()-started;console.log(`run ${index}: shell ready`);
  await app.evaluate(({BrowserWindow,screen})=>{const p=screen.getPrimaryDisplay(),d=screen.getAllDisplays().find(d=>d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width);if(!d)throw Error('RIGHT_DISPLAY_UNAVAILABLE');const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:d.workArea.x+10,y:d.workArea.y+30,width:Math.min(1060,d.workArea.width-20),height:Math.min(1000,d.workArea.height-60)});w.setFocusable(false);w.showInactive();});
  await page.evaluate(()=>{globalThis.perfLongTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())globalThis.perfLongTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});});
  const probeStartMs=performance.now()-started;
  const authStatus=await page.evaluate(async()=> (await window.moaonHub.viewActive()).status);
  const probeEndMs=performance.now()-started;
  const ui=index===count?await page.evaluate(async()=>{
   displayMode='sample';displayedOrders=Array.from({length:20},(_,i)=>({...sampleOrders[i%3],id:`PERF-${i}`}));selectedChannel='ALL';document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;renderOrders();showRoute('orders');if(!document.querySelector('[data-page="orders"]').classList.contains('is-visible')||!orderList.getClientRects().length)throw Error('Orders must be visible for UI measurement');
   const selection=[],routes=[],search=[],fullRender=[];
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));await frame();await frame();
   for(let i=0;i<100;i++){const t=performance.now();orderList.querySelectorAll('.order-select')[i%20].click();await frame();selection.push(performance.now()-t);}
   for(let i=0;i<20;i++){const t=performance.now();renderOrders();await frame();fullRender.push(performance.now()-t);}
   for(let i=0;i<20;i++){const t=performance.now();showRoute(i%2?'orders':'settings');await frame();routes.push(performance.now()-t);}
   for(let i=0;i<20;i++){const t=performance.now();orderSearch.value=i%2?'김':' ';orderSearch.dispatchEvent(new Event('input'));await frame();search.push(performance.now()-t);}
   orderSearch.value='';renderOrders();showRoute('orders');return {selection,routes,search,fullRender,rows:displayedOrders.length};
  }):null;
  const row={index,kind:networkDelay?'network-delay-control':index===1?'first-observed-launch':'repeat-launch',networkDelay,...splitTiming({shellReadyMs,probeStartMs,probeEndMs}),authStatus,ui,main:await app.evaluate(({app})=>({...globalThis.performanceBaseline,memory:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu,memory:p.memory}))})),renderer:await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(n=>({domMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd})),longTasks:globalThis.perfLongTasks}))};
  if(index===count)await page.screenshot({path:path.join(output,'installed-baseline.jpg')});
  fs.writeFileSync(path.join(output,`run-${index}.json`),JSON.stringify(row,null,2));console.log(JSON.stringify({index,shellReadyMs:Math.round(row.shellReadyMs),probeMs:Math.round(row.probeMs),authStatus}));return row;
 }finally{let closeTimer;try{if(app)await Promise.race([app.close(),new Promise(resolve=>{closeTimer=setTimeout(()=>{killTest();resolve();},5000);closeTimer.unref();})]);}finally{clearTimeout(closeTimer);clearTimeout(watchdog);}}
}
(async()=>{const rows=[];for(let i=1;i<=count;i++)rows.push(await run(i));const control=await run(count+1,10000);const report={runtime,scope:'Installed payload in isolated profiles; remote fetches mocked 401; sample20 rows for UI; updates disabled; no credentials or live writes; first launch is not OS cold-cache proof',runs:count,shell:summarize(rows.map(r=>r.shellReadyMs)),probe:summarize(rows.map(r=>r.probeMs)),networkControl:{shellReadyMs:control.shellReadyMs,probeMs:control.probeMs},ui:Object.fromEntries(['selection','routes','search','fullRender'].map(k=>[k,summarize(rows.at(-1).ui[k])]))};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
