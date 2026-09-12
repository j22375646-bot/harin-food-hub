'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const runtime=process.env.MOAON_TRAY_RUNTIME||path.resolve(__dirname,'..');
 let closed=false;const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'tray-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtime,MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/tray-native-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>!!window.moaonHub);
  assert.equal(await app.evaluate(()=>!!globalThis.testTray),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  assert.deepEqual(await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {alive:!w.isDestroyed(),visible:w.isVisible()};}),{alive:true,visible:false});
  if(process.env.MOAON_TEST_NATIVE_NOTICE==='1')await app.evaluate(()=>globalThis.testAssignment=true);
  // Wait for the real Main timer, even with the renderer hidden and no input activity.
  await page.waitForFunction(()=>false,{},{timeout:17000}).catch(()=>{});
  if(process.env.MOAON_TEST_NATIVE_NOTICE==='1'){const notice=await app.evaluate(()=>globalThis.nativeNotice);assert.equal(notice,'SHOWN');}
  const calls=await app.evaluate(()=>globalThis.testCalls);assert.ok(calls.team>=1);assert.ok(calls.orders>=1);assert.ok(calls.cs>=1);
  await app.evaluate(()=>globalThis.testTray.menu.items[0].click());
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;document.querySelector('.preview-shell').hidden=false;document.querySelector('.preview-shell').inert=false;showRoute('settings');});
  assert.equal(await page.getByText('창을 닫아도 함께하는 모아온',{exact:true}).isVisible(),true);
  await page.getByText('창을 닫아도 함께하는 모아온',{exact:true}).locator('..').screenshot({path:'D:/GPT/tmp/tray-background-settings.png'});
  assert.deepEqual(errors,[]);
  const closing=app.waitForEvent('close');await app.evaluate(()=>{setTimeout(()=>globalThis.testTray.menu.items[3].click(),10);});await closing;closed=true;
  console.log(JSON.stringify({status:'PASS',runtime,trayHideRestoreQuit:true,nativeHiddenPoll:calls,realAccount:false}));
 }finally{if(!closed)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
