'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="calendar"]').count(),1);
 await app.evaluate(({session})=>{globalThis.monthReads=0;globalThis.monthFail=false;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(url.includes('/calendar/entries')){const q=new URL(url).searchParams,from=q.get('from'),to=q.get('to');if(from!==to)globalThis.monthReads++;return globalThis.monthFail?new Response('',{status:503}):Response.json({ok:true,range:{from,to},entries:[{id:'event',title:'월간 발주 확인',type:'EVENT',date:from,endDate:to,time:'10:00',status:'OPEN'}]});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.locator('[data-route="calendar"]').click();
 await page.waitForFunction(()=>document.querySelector('#month-entries').textContent.includes('월간 발주'));
 await page.locator('[data-calendar-day]').first().click();assert.equal(await app.evaluate(()=>globalThis.monthReads),1);
 await page.locator('#month-entries button').click();assert.match(await page.locator('#month-detail').innerText(),/10:00/);
 await page.locator('#month-next').click();await page.waitForFunction(()=>globalThis.moaonMonth!=null);await page.waitForFunction(()=>!document.querySelector('#month-next').disabled);assert.equal(await app.evaluate(()=>globalThis.monthReads),2);
 for(const width of [1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForTimeout(200);assert.equal(await page.locator('#month-page').evaluate(el=>el.scrollWidth<=el.clientWidth),true);}
 await page.screenshot({path:path.resolve(__dirname,'../dist/p460-calendar.png')});
 await app.evaluate(()=>globalThis.monthFail=true);await page.locator('#month-refresh').click();await page.waitForFunction(()=>document.querySelector('#month-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#month-page').innerText(),/월간 발주/);
 await page.evaluate(()=>runHubAction('disconnect'));assert.equal(await page.locator('#month-detail').innerText(),'');
 console.log('PASS monthly calendar navigation selection no extra GET error logout widths');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
