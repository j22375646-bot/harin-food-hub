const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-page="today"] .connection-card').count(),0);
 assert.equal(await page.locator('[data-page="orders"] #server-shipping-history').count(),0);
 assert.equal(await page.locator('[data-page="settings"] #server-shipping-history').count(),1);
 await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>Response.json(url.endsWith('/api/moaon/businesses')?{ok:true,businesses:[]}:{ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
 assert.doesNotMatch(await page.locator('#business-detail').innerText(),/0.?0|송장/);
 assert.equal(await page.locator('[data-page="settings"] [data-action="hub-disconnect"]').count(),1);
 await page.keyboard.press('Alt+2');
 await page.locator('[data-page="orders"]').waitFor({state:'visible'});
 await page.screenshot({path:path.resolve(__dirname,'../dist/p460d-orders.png')});
 console.log('PASS main connection block removed, history kept in settings, connection has no order range');
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
