'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {launchDesktop}=require('./launch.cjs');const root=path.resolve(__dirname,'..');
async function main(){
 const packaged=process.argv.includes('--packaged');const app=await launchDesktop({root,executablePath:require('electron'),packaged,override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session})=>{globalThis.overviewRegisterReads=0;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
   const scope=new URL(url).searchParams.get('stage');
   if(scope==='REGISTER')globalThis.overviewRegisterReads++;
   if(scope==='IN_TRANSIT')return new Response('',{status:503});
   const total=scope==='REGISTER'?0:1;
   return Response.json({ok:true,orders:total?[{hubOrderId:'HR-C24-00000001',productName:'가명 상품',platform:'CAFE24',stage:'PAID'}]:[],total,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:scope==='COMPLETED'});
  };});
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
  const card=scope=>page.locator(`#overview-cards [data-scope="${scope}"]`);
  await page.waitForTimeout(200);
  assert.match(await card('REGISTER').innerText(),/0건/,'today must load all scopes without pressing refresh');
  await page.waitForFunction(()=>!document.querySelector('#overview-refresh').disabled);
  assert.match(await card('REGISTER').innerText(),/0건/);assert.match(await card('IN_TRANSIT').innerText(),/확인 필요/);
  assert.match(await card('COMPLETED').innerText(),/부분 확인/);
  assert.match(await page.locator('#overview-priority').textContent(),/확인이 필요/);
  const reads=await app.evaluate(()=>globalThis.overviewRegisterReads);
  await page.evaluate(()=>{showRoute('settings');showRoute('today');showRoute('settings');showRoute('today');});
  await page.waitForTimeout(100);
  assert.equal(await app.evaluate(()=>globalThis.overviewRegisterReads),reads,'rapid return reuses overview instead of fetching again');
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(root,'artifacts',`overview-${theme}.png`)});
  }
  await card('REGISTER').click();await page.locator('[data-page="orders"]:visible').waitFor();
  assert.match(await page.locator('#order-result-count').innerText(),/0건/);
  await page.evaluate(()=>runHubAction('disconnect'));
  assert.equal(await page.locator('#today-overview').isVisible(),false);
  assert.equal(await page.locator('#overview-cards').innerText().then(x=>x.includes('1건')),false);
  console.log(JSON.stringify({status:'PASS',packaged,scope:'overview counts, unknown vs zero, partial, theme, shortcut, logout'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
