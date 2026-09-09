'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-update-ui-'));
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>document.querySelector('#entry-status')?.textContent&&!document.querySelector('#entry-status').textContent.includes('확인하고 있습니다'));
  const errors=[];page.on('pageerror',()=>errors.push('RENDERER_ERROR'));
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;document.querySelectorAll('main [data-page]').forEach(el=>el.hidden=el.dataset.page!=='settings');document.querySelector('.app-update-panel').scrollIntoView({block:'center'});const banner=document.createElement('p');banner.textContent='자동 업데이트 개발 검증 · 가상 배포 자료 · 실제 설치/재시작 없음';Object.assign(banner.style,{position:'fixed',bottom:'28px',left:'110px',zIndex:'99999',background:'#172554',color:'white',padding:'10px',borderRadius:'8px'});document.body.append(banner);});
  await page.waitForFunction(()=>document.getElementById('app-update-status').textContent.includes('배포 준비'));
  assert.equal(await page.locator('#app-update-check').isDisabled(),true);
  await app.evaluate(({ipcMain})=>{
   globalThis.updateUiFixture={value:{status:'IDLE'},downloads:0,restarts:0};
   const bind=(key,fn)=>{ipcMain.removeHandler('moaon-hub:'+key);ipcMain.handle('moaon-hub:'+key,fn);};
   bind('update-state',()=>globalThis.updateUiFixture.value);
   bind('update-check',()=>globalThis.updateUiFixture.value={status:'AVAILABLE',version:'0.53.0'});
   bind('update-download',async()=>{const f=globalThis.updateUiFixture;f.downloads++;f.value={status:'DOWNLOADING',version:'0.53.0',percent:42};await new Promise(resolve=>f.finish=resolve);return f.value={status:'READY',version:'0.53.0',percent:100};});
   bind('update-restart',()=>{globalThis.updateUiFixture.restarts++;return {status:'READY',version:'0.53.0',blocked:true};});
  });
  const click=id=>page.evaluate(id=>document.getElementById(id).click(),id);
  await page.waitForFunction(()=>!document.getElementById('app-update-check').disabled);
  await click('app-update-check');await page.waitForFunction(()=>!document.getElementById('app-update-download').hidden);
  await click('app-update-download');await click('app-update-download');
  await page.waitForFunction(()=>document.getElementById('app-update-progress').value===42);
  assert.equal(await app.evaluate(()=>globalThis.updateUiFixture.downloads),1);
  await app.evaluate(()=>globalThis.updateUiFixture.finish());await page.waitForFunction(()=>!document.getElementById('app-update-restart').hidden&&!document.getElementById('app-update-restart').disabled);
  assert.equal(await page.locator('#update-ready-open').isVisible(),true);
  await click('app-update-restart');await page.waitForFunction(()=>document.getElementById('app-update-status').textContent.includes('처리 중'));
  assert.equal(await app.evaluate(()=>globalThis.updateUiFixture.restarts),1);
  await new Promise(resolve=>setTimeout(resolve,300));
  const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(os.tmpdir(),'moaon-updates-ready.png'),Buffer.from(png,'base64'));
  await app.evaluate(()=>globalThis.updateUiFixture.value={status:'ERROR'});await page.waitForFunction(()=>document.getElementById('app-update-status').textContent.includes('다시 확인'));
  assert.equal(await page.locator('#app-update-restart').isVisible(),false);assert.equal(await page.locator('#update-ready-open').isVisible(),false);
  assert.deepEqual(errors,[]);
  const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds(),d=screen.getDisplayMatching(b),p=screen.getPrimaryDisplay();return {focused:w.isFocused(),right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width};});assert.deepEqual(placement,{focused:false,right:true});
  console.log(JSON.stringify({status:'PASS',scope:'source UI; simulated updater; no install or restart',states:['setup','available','progress','ready','busy','error'],placement}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
