'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:read-today-calendar');ipcMain.handle('moaon-hub:read-today-calendar',()=>({status:'READY',date:'2026-09-09',entries:[{id:'1',title:'<img src=x onerror=alert(1)>',time:'09:30',status:'DONE',type:'SCHEDULE'}]}));});
  await page.evaluate(()=>{displayMode='live';void refreshTodayCalendar();});
  await page.waitForFunction(()=>document.querySelector('#calendar-status')?.textContent.includes('1건'));
  assert.match(await page.locator('#calendar-list').innerText(),/09:30[\s\S]*완료/);
  assert.equal(await page.locator('#calendar-list img').count(),0);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('moaon-hub:read-today-calendar');ipcMain.handle('moaon-hub:read-today-calendar',()=>({status:'UNAVAILABLE',entries:[]}));});
  await page.evaluate(()=>refreshTodayCalendar());assert.match(await page.locator('#calendar-status').innerText(),/확인하지 못/);
  assert.equal(await page.locator('#calendar-list li').count(),0);
  await page.evaluate(()=>clearOverview());assert.equal(await page.locator('#calendar-list li').count(),0);
  console.log('PASS today calendar UI: time, completion, text-only title, failure and clearing');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
