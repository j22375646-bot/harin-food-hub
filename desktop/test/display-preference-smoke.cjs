'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),{_electron}=require('playwright');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-display-ui-'));
 for(const flags of [['--display-right'],[]]){
  const application=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'display-preference-bootstrap.cjs'),...flags],env:{...process.env,MOAON_TEST_PROFILE:profile}});
  try{
   const page=await application.firstWindow();await page.waitForLoadState('domcontentloaded');
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.waitForFunction(()=>document.querySelector('#entry-status')?.textContent&&!document.querySelector('#entry-status').textContent.includes('확인하고 있습니다'));
   await page.evaluate(()=>{const banner=document.createElement('p');banner.textContent='오른쪽 모니터 복원 검증 · 격리 개발 앱 · 실제 업데이트 설치 없음';Object.assign(banner.style,{position:'fixed',bottom:'20px',left:'20px',zIndex:'99999',background:'#172554',color:'white',padding:'12px'});document.body.append(banner);});
   const placement=()=>application.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds(),d=screen.getDisplayMatching(b),p=screen.getPrimaryDisplay();return {visible:w.isVisible(),focused:w.isFocused(),right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,contained:b.x>=d.workArea.x&&b.y>=d.workArea.y&&b.x+b.width<=d.workArea.x+d.workArea.width&&b.y+b.height<=d.workArea.y+d.workArea.height};});
   await new Promise(r=>setTimeout(r,700));
   assert.deepEqual(await placement(),{visible:true,focused:false,right:true,contained:true});
   await application.evaluate(({app})=>app.once('second-instance',()=>globalThis.displayRepeatReceived=true));
   const repeated=spawnSync(require('electron'),[path.join(__dirname,'display-preference-bootstrap.cjs')],{env:{...process.env,MOAON_TEST_PROFILE:profile},windowsHide:true,timeout:20000});
   assert.equal(repeated.status,0);
   assert.equal(await application.evaluate(()=>globalThis.displayRepeatReceived),true);
   assert.deepEqual(await placement(),{visible:true,focused:false,right:true,contained:true});
   assert.deepEqual(errors,[]);
   assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'display-preference.json'),'utf8')).display,'right');
   if(!flags.length)await page.screenshot({path:path.join(os.tmpdir(),'moaon-display-restored.png')});
   await new Promise(r=>setTimeout(r,2000));
  }finally{await application.close();}
 }
 console.log(JSON.stringify({status:'PASS',scope:'source app: explicit right launch, persisted relaunch without flag, actual second process launch; no native input or installer'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
