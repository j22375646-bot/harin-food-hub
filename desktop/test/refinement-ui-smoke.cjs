'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_REFINEMENT_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/refinement-'),MOAON_TEST_DISPLAY:'main',MOAON_TEST_HIDDEN:'0'}});try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
 await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;document.querySelector('.preview-shell').hidden=false;document.querySelector('.preview-shell').inert=false;});
 const routes=await page.locator('.primary-nav [data-route]').evaluateAll(nodes=>nodes.map(n=>n.dataset.route));
 let checked=0;for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);for(const width of [1040,1440]){await page.setViewportSize({width,height:1000});for(const route of routes){await page.evaluate(route=>showRoute(route),route);await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' overflow');const mismatches=await page.locator('input[type=checkbox]').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).appearance!=='none').map(n=>n.id));assert.deepEqual(mismatches,[],route);checked++;} }
 await page.evaluate(()=>{showRoute('orders');const box=document.querySelector('input[type=checkbox]');box.disabled=false;box.checked=true;});
 assert.equal(await page.locator('input[type=checkbox]').first().evaluate(n=>getComputedStyle(n).borderRadius),'7px');
 if(theme==='dark')assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()),'#191c23');
 await page.evaluate(()=>showRoute('today'));await page.screenshot({path:'D:/GPT/tmp/p4136-today-'+theme+'.png'});
 await page.evaluate(()=>showRoute('settings'));await page.screenshot({path:'D:/GPT/tmp/p4136-settings-'+theme+'.png'});
 }
 assert.deepEqual(errors,[]);console.log('PASS '+checked+' route/theme/width states, shared checkbox style and evening tokens; empty disconnected fixtures');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
