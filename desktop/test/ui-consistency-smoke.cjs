'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 const titles=await page.locator('#today-title,#orders-title,#settings-title,#month-title,#insights-title,#settlement-title').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return [s.fontSize,s.lineHeight,s.fontWeight,s.marginTop,s.marginBottom]}));
 assert.equal(titles.length,6);for(const title of titles)assert.deepEqual(title,titles[0],'Page title scale and spacing must match');
 const buttons=await page.locator('#settlement-refresh,#insights-refresh,#month-refresh').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return [s.minHeight,s.borderRadius,s.fontSize]}));
 assert.equal(buttons.length,3);for(const button of buttons)assert.deepEqual(button,buttons[0],'Refresh controls must match');
 console.log('PASS six page titles and refresh controls share app UI scale');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
