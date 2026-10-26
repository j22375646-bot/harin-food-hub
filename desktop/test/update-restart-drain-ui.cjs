'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-update-restart-210';fs.mkdirSync(output,{recursive:true});const root=process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..');
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'update-restart-drain-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:root,MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>window.moaonHub.refresh());
  await app.evaluate(({ipcMain})=>globalThis.setupUpdateDrainFixture(ipcMain));
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',total:0,orders:[],checkedAt:new Date().toISOString()});showRoute('settings');});
  await page.waitForFunction(()=>document.querySelector('#app-update-accept').textContent==='저장 완료 · 재시작');
  await page.locator('#app-update-accept').click();await page.waitForFunction(()=>document.querySelector('#app-update-accept').textContent.includes('대기 중'));
  assert.equal(await page.locator('#app-update-dialog').isVisible(),true);assert.equal(await page.locator('#app-update-accept').isDisabled(),true);assert.equal(await app.evaluate(()=>globalThis.installs),0);
  await page.screenshot({path:path.join(output,'waiting.png')});
  await app.evaluate(async()=>{globalThis.endWork();await globalThis.work;});await page.waitForFunction(()=>document.querySelector('#app-update-status').textContent.includes('재시작합니다'));
  assert.equal(await app.evaluate(()=>globalThis.installs),1);assert.equal(await page.locator('#app-update-dialog').isVisible(),false);
  console.log(JSON.stringify({status:'PASS',realStateMachine:true,realGate:true,oneClickDrain:true,waitingVisible:true,duplicateBlocked:true,installerSpyCalls:1,realInstallerRuns:0}));
 }finally{await app.evaluate(()=>globalThis.updateDrain?.dispose()).catch(()=>{});const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
