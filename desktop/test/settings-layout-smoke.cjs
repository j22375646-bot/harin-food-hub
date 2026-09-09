const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>Response.json(url.endsWith('/api/moaon/businesses')?{ok:true,businesses:[]}:{ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.keyboard.press('Alt+3');
 for(const width of [1040,1440,2200]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,1000),width);
  const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {api:box('#api-settings').width,heading:box('#api-settings>header').height,history:box('.history-settings').height,connectionTop:box('.connection-setting').top,apiTop:box('#api-settings').top,overflow:document.querySelector('.settings-grid').scrollWidth>document.querySelector('.settings-grid').clientWidth,printer:!!document.querySelector('#printer-check')};});
  assert.ok(layout.heading<60,'API heading must not reserve a tall empty band');assert.ok(layout.history>=60,'closed history must be a usable card');assert.ok(layout.api<=1160,'settings must not stretch across ultra-wide screens');assert.ok(layout.connectionTop<layout.apiTop,'account precedes API');assert.equal(layout.overflow,false);assert.equal(layout.printer,false);
 }
 await page.locator('.history-settings>summary').click();assert.equal(await page.locator('#server-history-load').isVisible(),true);await page.locator('.history-settings>summary').click();
 await page.locator('#api-settings').scrollIntoViewIfNeeded();await page.screenshot({path:path.resolve(__dirname,'../dist/settings-layout.png')});
 console.log('PASS settings card density, order, widths, history and printer removal');
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
