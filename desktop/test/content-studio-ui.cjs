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
   await panel.getByRole('button',{name:'연결 준비 가이드 보기'}).click();await page.waitForTimeout(50);assert.equal(await panel.locator('details').getAttribute('open'),'');assert.equal(await panel.locator('details li').count(),name==='블로그'?5:3);
   assert.ok((await panel.locator('details').innerText()).includes(name));
  }
  await root.getByRole('tab',{name:/인스타그램/}).focus();await page.keyboard.press('ArrowRight');assert.equal(await root.getByRole('tab',{name:/블로그/}).getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await root.getByRole('tab',{name:/인스타그램/}).getAttribute('aria-selected'),'true');
  await root.getByRole('tab',{name:/블로그/}).click();
  await page.locator('#blog-title').fill('작두콩차 이야기');await page.locator('#blog-body').fill('직접 확인한 제품 정보\n우리는 방법');
  assert.match(await root.locator('.blog-draft-preview').innerText(),/작두콩차 이야기/);
  await page.locator('#blog-address').fill('https://evil.test/test');await page.getByRole('button',{name:'공개 페이지 확인',exact:true}).click();await page.waitForTimeout(250);assert.match(await root.locator('.blog-connection:not(.blog-ai) .blog-status').innerText(),/처리하지 못했/);
  await page.getByRole('button',{name:'제목·본문 복사',exact:true}).click();await page.waitForTimeout(150);assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'작두콩차 이야기\n\n직접 확인한 제품 정보\n우리는 방법');
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:'D:/GPT/tmp/blog-ui-test.json'});dialog.showOpenDialog=async()=>({canceled:false,filePaths:['D:/GPT/tmp/blog-ui-test.json']});});
  await page.getByRole('button',{name:'초안 파일 저장',exact:true}).click();await page.waitForTimeout(200);assert.equal(JSON.parse(fs.readFileSync('D:/GPT/tmp/blog-ui-test.json','utf8')).title,'작두콩차 이야기');
  await page.evaluate(()=>document.dispatchEvent(new Event('moaon-session-changed')));await page.getByRole('button',{name:'초안 불러오기',exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.locator('#blog-title').inputValue(),'작두콩차 이야기');
  await root.locator('#content-guide-blog').evaluate(el=>el.open=false);
  for(const [width,theme] of [[1440,'light'],[1040,'dark'],[760,'light']]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await root.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   await page.evaluate(()=>document.getElementById('main-content').scrollTop=0);await page.screenshot({path:`D:/GPT/tmp/content-studio-${width}-${theme}.png`});
  }
  await root.locator('.blog-editor').scrollIntoViewIfNeeded();await page.screenshot({path:'D:/GPT/tmp/blog-editor.png'});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.getByRole('button',{name:'오늘',exact:true}).click();await page.getByRole('button',{name:'마케팅 스튜디오',exact:true}).click();assert.equal(await root.getByRole('tab',{name:/인스타그램/}).getAttribute('aria-selected'),'false');
  await page.evaluate(()=>document.dispatchEvent(new Event('moaon-session-changed')));assert.equal(await page.locator('#blog-body').inputValue(),'');
  if(process.env.MOAON_BLOG_TEST_ID){const result=await page.evaluate(value=>window.moaonHub.blogWorkspace({action:'probe',value}),process.env.MOAON_BLOG_TEST_ID);console.log('LIVE_PUBLIC_PROBE',JSON.stringify(result));assert.equal(result.ok,true);}
  assert.deepEqual(errors,[]);console.log('PASS: four platform tabs, guides, keyboard navigation, route return, light/dark and responsive layout; isolated UI, no publishing');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
