'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {_electron} = require('playwright');
const tenant = '11111111-1111-4111-8111-111111111111';
async function main() {
 const installed=process.argv.includes('--installed-package');
 const visibleDemo=process.argv.includes('--visible-demo');
 const pause=()=>visibleDemo?new Promise(resolve=>setTimeout(resolve,650)):Promise.resolve();
 const runtimeRoot=installed?path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','resources','app.asar'):path.resolve(__dirname,'..');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-credential-ui-'));
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtimeRoot,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:visibleDemo?'0':'1',MOAON_TEST_DISPLAY:visibleDemo?'right':''},timeout:30000});
 try {
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>document.querySelector('#entry-status')?.textContent&&!document.querySelector('#entry-status').textContent.includes('확인하고 있습니다'));
  const errors=[];page.on('pageerror',()=>errors.push('RENDERER_ERROR'));
  await app.evaluate(({ipcMain},tenant)=>{
   globalThis.credentialUiTest={reads:0,saves:0,status:'SAVED_UNVERIFIED',hold:false};
   const handle=(channel,fn)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,fn);};
   handle('moaon-hub:list-businesses',()=>({status:'READY',businesses:[{tenantId:tenant,displayName:'시험 사업장',role:'OWNER'}]}));
   handle('moaon-hub:read-credential-metadata',async(_e,value)=>{
    const state=globalThis.credentialUiTest;state.reads++;if(state.hold)await new Promise(resolve=>state.release=resolve);
    return {tenantId:value.tenantId,provider:value.provider,revision:0,status:'NOT_SAVED'};
   });
   handle('moaon-hub:save-server-credential',async(_e,value)=>{
    const state=globalThis.credentialUiTest;state.saves++;state.identity={tenantId:value.tenantId,provider:value.provider,expectedRevision:value.expectedRevision};
    if(state.hold)await new Promise(resolve=>state.release=resolve);
    return state.status==='SAVED_UNVERIFIED'?{tenantId:value.tenantId,provider:value.provider,revision:value.expectedRevision+1,status:state.status}:{status:state.status};
   });
  },tenant);
  // Show only the settings DOM for this synthetic UI test; no authenticated claim.
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;document.querySelector('[data-page="settings"]').hidden=false;});
  if(visibleDemo){
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setTitle('모아온 · 자동 검증 · 시험 자료'));
   await page.evaluate(()=>{
    document.querySelectorAll('main [data-page]').forEach(el=>el.hidden=el.dataset.page!=='settings');
    const banner=document.createElement('div');banner.id='automatic-verification-banner';banner.textContent='자동 검증 중 · 시험 자료 / 가상 서버 응답 · 실제 API 키 저장 아님';
    Object.assign(banner.style,{position:'fixed',top:'0',left:'0',right:'0',zIndex:'99999',padding:'12px',background:'#172554',color:'#fff',font:'bold 15px sans-serif',textAlign:'center'});document.body.append(banner);
    document.getElementById('api-settings').scrollIntoView({block:'center'});
   });
  }
  const change=async(id,value)=>{await pause();return page.evaluate(({id,value})=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},{id,value});};
  const click=async id=>{await pause();if(visibleDemo)await page.evaluate(id=>document.getElementById(id).scrollIntoView({block:'center'}),id);return page.evaluate(id=>document.getElementById(id).click(),id);};
  const fill=async()=>page.evaluate(()=>document.querySelectorAll('#api-fields input').forEach(el=>{el.value='SYNTHETIC_NOT_A_KEY';el.dispatchEvent(new Event('input',{bubbles:true}));}));
  const status=async text=>page.waitForFunction(text=>document.getElementById('api-server-status').textContent.includes(text),text);
  await change('api-source','owned');await page.waitForFunction(()=>!document.getElementById('api-tenant').disabled);await change('api-tenant',tenant);
  assert.equal(await page.locator('#api-server-save').isDisabled(),true);
  await click('api-server-read');await status('저장된 설정 없음');await fill();await click('api-server-save');
  assert.equal(await page.locator('#api-server-confirm').getAttribute('hidden'),null);
  assert.doesNotMatch(await page.locator('#api-server-confirm').textContent(),/SYNTHETIC_NOT_A_KEY/);
  assert.equal(await page.locator('#api-draft-save').isDisabled(),true);
  assert.equal(await page.locator('#api-business-refresh').isDisabled(),true);
  await click('api-server-cancel');assert.equal(await app.evaluate(()=>globalThis.credentialUiTest.saves),0);
  await fill();await click('api-server-save');await change('api-provider','NAVER');
  assert.equal(await page.locator('#api-server-confirm').evaluate(el=>el.hidden),true);
  assert.equal(await page.locator('#api-server-save').isDisabled(),true);
  // Late metadata for a previous provider must not enable save.
  await app.evaluate(()=>globalThis.credentialUiTest.hold=true);await click('api-server-read');
  await page.waitForFunction(()=>document.getElementById('api-server-status').textContent.includes('조회 중'));
  await change('api-provider','COUPANG');await app.evaluate(()=>{globalThis.credentialUiTest.hold=false;globalThis.credentialUiTest.release();});
  await page.waitForFunction(()=>!document.getElementById('api-server-read').disabled);
  assert.equal(await page.locator('#api-server-save').isDisabled(),true);
  await click('api-server-read');await status('저장된 설정 없음');await fill();await click('api-server-save');
  await app.evaluate(()=>globalThis.credentialUiTest.hold=true);await click('api-server-confirm-save');await click('api-server-confirm-save');
  assert.equal(await app.evaluate(()=>globalThis.credentialUiTest.saves),1);
  await app.evaluate(()=>{globalThis.credentialUiTest.hold=false;globalThis.credentialUiTest.release();});await status('서버에 저장됨');
  assert.equal(await page.locator('[name="secretKey"]').inputValue(),'');
  assert.deepEqual(await app.evaluate(()=>globalThis.credentialUiTest.identity),{tenantId:tenant,provider:'COUPANG',expectedRevision:0});
  for(const [code,message] of [['RESULT_UNKNOWN','결과를 확인하지 못했습니다'],['CONFLICT','다른 곳에서'],['SETUP_REQUIRED','준비되지'],['ACCESS_DENIED','권한'],['RATE_LIMITED','잠시 후']]){
   await click('api-server-read');await status('저장된 설정 없음');await fill();await click('api-server-save');
   await app.evaluate((_electron,code)=>globalThis.credentialUiTest.status=code,code);await click('api-server-confirm-save');await status(message);
   assert.equal(await page.locator('[name="secretKey"]').inputValue(),'');assert.equal(await page.locator('#api-server-save').isDisabled(),true);
  }
  // A completed save for a previous selection cannot announce success on a new one.
  await app.evaluate(()=>{globalThis.credentialUiTest.status='SAVED_UNVERIFIED';});
  await click('api-server-read');await status('저장된 설정 없음');await fill();await click('api-server-save');
  await app.evaluate(()=>globalThis.credentialUiTest.hold=true);await click('api-server-confirm-save');
  await change('api-provider','NAVER');await app.evaluate(()=>{globalThis.credentialUiTest.hold=false;globalThis.credentialUiTest.release();});
  await page.waitForFunction(()=>!document.getElementById('api-server-read').disabled);
  assert.equal(await page.locator('#api-server-status').textContent(),'');
  await change('api-provider','COUPANG');
  await fill();await click('api-business-refresh');await page.waitForFunction(()=>!document.getElementById('api-tenant').disabled);
  assert.equal(await page.locator('[name="secretKey"]').inputValue(),'');await change('api-tenant',tenant);
  await click('api-server-read');await status('저장된 설정 없음');await fill();await click('api-server-save');
  await page.evaluate(()=>document.querySelector('[data-page="settings"]').hidden=true);
  await page.waitForFunction(()=>document.getElementById('api-server-confirm').hidden);
  assert.equal(await page.locator('[name="secretKey"]').inputValue(),'');
  // Existing local drafts still use the real Windows encryption in this isolated profile.
  await page.evaluate(()=>document.querySelector('[data-page="settings"]').hidden=false);
  await change('api-source','new');
  await page.evaluate(()=>document.getElementById('api-business').value='격리 시험 사업장');await fill();
  await page.evaluate(()=>document.getElementById('api-draft-form').requestSubmit());
  await page.waitForFunction(()=>document.getElementById('api-draft-status').textContent.includes('이 PC에 암호화 저장됨'));
  assert.equal(await page.locator('[name="secretKey"]').inputValue(),'');
  const drafts=await page.evaluate(()=>window.moaonHub.listApiDrafts());
  assert.equal(drafts.length,1);assert.doesNotMatch(JSON.stringify(drafts),/SYNTHETIC_NOT_A_KEY/);
  await page.evaluate(()=>window.moaonHub.removeApiDraft({business:'격리 시험 사업장',provider:'COUPANG'}));
  assert.deepEqual(await page.evaluate(()=>window.moaonHub.listApiDrafts()),[]);
  for(const width of [1040,1440]){await app.evaluate(({BrowserWindow,screen},{width,visibleDemo})=>{const win=BrowserWindow.getAllWindows()[0];const area=screen.getDisplayMatching(win.getBounds()).workArea;win.setSize(visibleDemo?Math.min(width,area.width-20):width,visibleDemo?Math.min(900,area.height-60):900);},{width,visibleDemo});assert.equal(await page.locator('#api-settings').evaluate(el=>el.scrollWidth<=el.clientWidth),true);}
  const version=JSON.parse(installed?require('@electron/asar').extractFile(runtimeRoot,'package.json').toString('utf8'):fs.readFileSync(path.join(runtimeRoot,'package.json'),'utf8')).version;
  assert.equal(version,'0.52.0');
  const windows=await app.evaluate(({BrowserWindow,screen})=>BrowserWindow.getAllWindows().map(w=>{const bounds=w.getBounds(),primary=screen.getPrimaryDisplay(),display=screen.getDisplayMatching(bounds);return {visible:w.isVisible(),focused:w.isFocused(),rightSecondary:display.id!==primary.id&&display.workArea.x>=primary.workArea.x+primary.workArea.width,contained:bounds.x>=display.workArea.x&&bounds.x+bounds.width<=display.workArea.x+display.workArea.width&&bounds.y>=display.workArea.y&&bounds.y+bounds.height<=display.workArea.y+display.workArea.height};}));
  assert.ok(windows.length);assert.ok(visibleDemo?windows.every(w=>w.visible&&!w.focused&&w.rightSecondary&&w.contained):windows.every(w=>!w.visible&&!w.focused));assert.deepEqual(errors,[]);
  if(visibleDemo){
   await page.evaluate(()=>{document.getElementById('automatic-verification-banner').textContent='자동 검증 통과 · 서버 설정 화면 14개 시나리오 · 실제 서버 인증은 별도';document.getElementById('api-settings').scrollIntoView({block:'center'});});
   await page.screenshot({path:path.join(os.tmpdir(),'moaon-visible-verification.png')});
   await new Promise(resolve=>setTimeout(resolve,8000));
  }
  console.log(JSON.stringify({status:'PASS',runtime:installed?'installed app.asar':'source',version,mode:visibleDemo?'visible automatic demo':'hidden',scope:'synthetic IPC UI; no real credentials or authenticated server save',cases:['lookup required','cancel','selection invalidation','late metadata','duplicate lock','saved unverified','unknown','conflict','setup','denied','rate limit','page cleanup','late save','local encrypted draft regression'],windows}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
