'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=process.argv.includes('--packaged');
 const app=await launchDesktop({root,executablePath:require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.equal(await page.locator('#business-list-refresh').count(),1,'business panel is present');
  await app.evaluate(({session})=>{
   globalThis.businessStatus=200;
   globalThis.orderUrls=[];
   globalThis.memberRole='OWNER';globalThis.orderStatus=200;
   const ses=session.fromPartition('persist:moaon-harin-readonly',{cache:false});
   ses.fetch=async(url)=>{if(!url.endsWith('/api/moaon/businesses'))globalThis.orderUrls.push(url);return url.endsWith('/api/moaon/businesses')
    ?Response.json(globalThis.businessStatus===200?{ok:true,businesses:[{tenantId:'a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',displayName:'시험 하린식품',role:globalThis.memberRole,membershipVersion:1},{tenantId:'10000000-0000-4000-8000-000000000001',displayName:'<img src=x> 시험 사업장',role:'OWNER',membershipVersion:1}]}:{ok:false},{status:globalThis.businessStatus})
    :Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false},{status:globalThis.orderStatus});};
  });
  await page.evaluate(()=>runHubAction('disconnect'));
  await page.evaluate(()=>runHubAction('refresh'));
  await page.keyboard.press('Alt+3');
  await page.waitForFunction(()=>document.querySelector('#business-list-status').textContent.includes('2개'));
  const requested=await app.evaluate(()=>globalThis.orderUrls);
  assert.ok(requested.length>0);
  assert.ok(requested.every(url=>url==='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=ACTIVE&platform=ALL'));
  assert.equal(await page.locator('#business-list img').count(),0,'names rendered as text');
  assert.ok((await page.locator('#business-list').innerText()).includes('<img src=x> 시험 사업장'));
  assert.equal(await page.locator('#business-list button:enabled').count(),1,'only bound owner workspace can open');
  assert.equal(await page.locator('#business-list button:disabled').count(),1,'unprepared business stays locked');
  assert.match(await page.locator('#business-list').innerText(),/독립된 주문·플랫폼 연결/);
  for(const theme of ['light','dark']){
   await page.evaluate(value=>applyTheme(value),theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const fs=require('node:fs');fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
   await page.locator('#business-list-title').scrollIntoViewIfNeeded();
   await page.locator('[aria-labelledby="business-list-title"]').screenshot({path:path.join(root,'artifacts',`business-panel-${theme}.png`)});
  }
  const beforeOpen=await app.evaluate(()=>globalThis.orderUrls.length);
  await page.locator('#business-list button:enabled').click();
  await page.locator('[data-page="orders"]:visible').waitFor();
  assert.equal(await app.evaluate(()=>globalThis.orderUrls.length),beforeOpen+1,'opening rechecks live server authorization');
  await page.keyboard.press('Alt+3');
  await app.evaluate(()=>{globalThis.memberRole='VIEWER';});
  await page.locator('#business-list-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#business-list').textContent.includes('소유자 권한이 필요'));
  assert.equal(await page.locator('#business-list button:enabled').count(),0);
  await app.evaluate(()=>{globalThis.businessStatus=504;});
  await page.locator('#business-list-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#business-list-status').textContent.includes('시간'));
  assert.equal(await page.locator('#business-list').innerText(),'');
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('#business-list').innerText(),'');
  console.log(JSON.stringify({status:'PASS',scope:'isolated Electron, synthetic GETs, auto-load, timeout, XSS text, logout',packaged}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
