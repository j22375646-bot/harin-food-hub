'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Use --isolated to avoid the real profile');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>typeof runHubAction==='function');
  await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>Response.json({ok:true,orders:[],businesses:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});});
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
  for(const width of [1040,1440]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,920),width);
   const sizes=await page.locator('.sidebar').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));
   assert.equal(sizes.width,84);assert.ok(sizes.scroll<=sizes.client,'sidebar must not overflow horizontally');
  }
  assert.equal(await page.locator('.topbar').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'drag');
  assert.equal(await page.locator('.topbar button').first().evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'no-drag');
  await page.locator('.studio-business summary').click();assert.equal(await page.locator('.business-card').isVisible(),true);
  await page.screenshot({path:path.resolve(__dirname,'../dist/window-shell.png'),animations:'disabled'});
  console.log('PASS: slim rail, no horizontal overflow, drag/buttons, connection disclosure');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
