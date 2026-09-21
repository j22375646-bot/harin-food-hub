'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{_electron}=require('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_TEST_RUNTIME_ROOT||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/content-studio-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>returnToSample());await page.waitForTimeout(1000);
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;});
  await page.getByRole('button',{name:'마케팅 스튜디오',exact:true}).click();
  const root=page.locator('[data-page="content-studio"]');assert.equal(await root.isVisible(),true);assert.equal(await page.locator('#app-breadcrumb-page').innerText(),'마케팅 스튜디오');
  assert.equal(await root.getByRole('tab').count(),4);
  for(const name of ['블로그','유튜브','틱톡','인스타그램']){
   await root.getByRole('tab',{name:new RegExp(name)}).click();assert.equal(await root.getByRole('tabpanel').count(),1);
   const panel=root.getByRole('tabpanel');assert.match(await panel.innerText(),/자동 발행 꺼짐/);assert.match(await panel.innerText(),/구성 예시 · 실제 생성물 아님/);
   await panel.getByRole('button',{name:'연결 준비 가이드 보기'}).click();await page.waitForTimeout(50);assert.equal(await panel.locator('details').getAttribute('open'),'');assert.equal(await panel.locator('details li').count(),3);
   assert.ok((await panel.locator('details').innerText()).includes(name));
  }
  await root.getByRole('tab',{name:/인스타그램/}).focus();await page.keyboard.press('ArrowRight');assert.equal(await root.getByRole('tab',{name:/블로그/}).getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await root.getByRole('tab',{name:/인스타그램/}).getAttribute('aria-selected'),'true');
  for(const [width,theme] of [[1440,'light'],[1040,'dark'],[760,'light']]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   await page.evaluate(()=>document.getElementById('main-content').scrollTop=0);await page.screenshot({path:`D:/GPT/tmp/content-studio-${width}-${theme}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.getByRole('button',{name:'오늘',exact:true}).click();await page.getByRole('button',{name:'마케팅 스튜디오',exact:true}).click();assert.equal(await root.getByRole('tab',{name:/인스타그램/}).getAttribute('aria-selected'),'true');
  assert.deepEqual(errors,[]);console.log('PASS: four platform tabs, guides, keyboard navigation, route return, light/dark and responsive layout; isolated UI, no publishing');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
