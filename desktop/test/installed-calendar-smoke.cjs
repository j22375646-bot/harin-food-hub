'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden||document.querySelector('#entry-status')?.textContent.includes('로그인이 필요합니다'),{},{timeout:30000});
  if(!await page.locator('#entry-screen').evaluate(el=>el.hidden)){console.log('BLOCKED LOGIN_REQUIRED');process.exitCode=2;return;}
  await page.evaluate(()=>showRoute('today'));
  await page.waitForFunction(()=>!calendarBusy&&calendarLastAttempt>0,{},{timeout:30000});
  const result=await page.evaluate(()=>({message:document.querySelector('#calendar-status').textContent,count:document.querySelectorAll('#calendar-list li').length}));
  assert.match(result.message,/한국 시간 기준/);
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.40.0');
  await page.screenshot({path:path.join(__dirname,'..','dist','p456-today.png')});
  console.log(JSON.stringify({status:'PASS',version:'0.40.0',...result,scope:'real calendar GET only; no writes'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
