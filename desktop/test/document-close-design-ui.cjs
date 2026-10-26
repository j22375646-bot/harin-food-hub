'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const output='D:/GPT/Temp/moaon-document-close-214';fs.mkdirSync(output,{recursive:true});
 const app=await _electron.launch({executablePath:'D:/GPT/deps/moaon-desktop-runtime/node_modules/electron/dist/electron.exe',args:[path.join(__dirname,'read-budget-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync(path.join(output,'profile-')),MOAON_TEST_DISPLAY:'right',MOAON_TEST_HIDDEN:'0'}});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded',{timeout:120000});await page.evaluate(()=>window.moaonHub.refresh());await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{applyHubResult({status:'READY',scope:'ACTIVE',channel:'ALL',total:0,offset:0,checkedAt:new Date().toISOString(),orders:[]});showRoute('orders');const note=document.createElement('p');note.className='ops-note';note.textContent='자동 검증 · 격리 시험 자료 · 실제 출력 없음';document.querySelector('.orders-page').prepend(note);});
  const close=page.locator('#document-notice-close'),panel=page.locator('#registration-results');
  for(const theme of ['light','dark']){
   await page.evaluate(t=>{document.documentElement.dataset.theme=t;const p=document.querySelector('#registration-results');p.classList.add('document-notice');p.hidden=false;document.querySelector('#registration-status').textContent='선택 주문으로 출고 작업표 A4를 준비합니다.';document.querySelector('#document-notice-close').disabled=false;},theme);
   const shape=await close.evaluate(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect(),s=getComputedStyle(n);return {width:r.width,height:r.height,center:Math.abs(r.y+r.height/2-p.y-p.height/2),border:s.borderColor,icon:getComputedStyle(n,'::before').height};});assert.equal(shape.width,32);assert.equal(shape.height,32);assert.ok(shape.center<1);assert.match(shape.border,/rgba\(0, 0, 0, 0\)|transparent/);assert.equal(shape.icon,'1.5px');
   await panel.screenshot({path:path.join(output,theme+'-notice.png')});await close.focus();assert.equal(await close.evaluate(n=>getComputedStyle(n).outlineWidth),'2px');await close.press('Enter');assert.equal(await panel.isVisible(),false);
   await page.evaluate(()=>{document.querySelector('#registration-results').hidden=false;document.querySelector('#document-notice-close').disabled=true;});await close.evaluate(n=>n.click());assert.equal(await panel.isVisible(),true);
  }
  console.log(JSON.stringify({status:'PASS',themes:2,compact32px:true,centered:true,thinIcon:true,keyboardDismiss:true,disabledPreserved:true,realWrites:0}));
 }catch(e){console.error(e);throw e;}finally{const killer=setTimeout(()=>app.process().kill(),10000);try{await app.close();}finally{clearTimeout(killer);}}
})().catch(e=>{console.error(e);process.exitCode=1;});
