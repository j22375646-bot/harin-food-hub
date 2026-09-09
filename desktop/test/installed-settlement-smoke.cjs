'use strict';
const path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden||document.querySelector('#entry-status')?.textContent.includes('로그인이 필요합니다'),{},{timeout:30000});
  if(!await page.locator('#entry-screen').evaluate(el=>el.hidden)){console.log('BLOCKED LOGIN_REQUIRED');process.exitCode=2;return;}
  await page.locator('[data-route="settlement"]').click();await page.waitForFunction(()=>document.querySelector('#settlement-page').getAttribute('aria-busy')==='false',{},{timeout:45000});
  const cards=await page.locator('#settlement-channels article').count();console.log(JSON.stringify({version:await app.evaluate(({app})=>app.getVersion()),cards,status:cards===4?'PASS':'UNAVAILABLE',message:await page.locator('#settlement-status').innerText(),scope:'authenticated GET only; monetary values omitted'}));if(cards!==4)process.exitCode=2;
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
