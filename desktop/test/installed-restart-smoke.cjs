'use strict';
// Explicit installed-app acceptance. Startup may read saved orders; no collection, issue or print.
// Reads current theme without changing the user's choice.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {_electron}=require('playwright');
async function main(){
 if(!process.argv.includes('--installed'))throw Error('Use --installed for explicit real-profile acceptance');
 const executablePath=path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe');
 const profile=path.join(process.env.APPDATA,'Moaon Preview','preview-user-data');
 if(fs.existsSync(path.join(profile,'session-cleanup-pending')))throw Error('Pending session cleanup; do not start acceptance');
 const results=[];
 const orderReads=[];
 for(let run=0;run<2;run++){
  const started=Date.now();const app=await _electron.launch({executablePath,args:[],timeout:30000});
  try{
   const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
   await page.locator('[data-app-version]').first().filter({hasText:'v0.26.1'}).waitFor();
   const errors=[];page.on('pageerror',error=>errors.push(error.name));
   const state=await app.evaluate(({app})=>({version:app.getVersion(),profile:app.getPath('userData')}));
   assert.equal(state.version,'0.26.1');assert.equal(path.resolve(state.profile),path.resolve(profile));
   const theme=await page.evaluate(()=>({visible:document.documentElement.dataset.theme,saved:localStorage.getItem('moaon-preview-theme')}));
   assert.equal(theme.visible,theme.saved);assert.ok(['light','dark'].includes(theme.visible));
   assert.equal(page.url(),'moaon://app/index.html');
   const localUiReadyMs=Date.now()-started;
   await page.waitForFunction(()=>document.querySelector('#entry-screen').hidden||document.querySelector('#entry-status').textContent!=='저장된 로그인 상태를 확인하고 있습니다.',{},{timeout:30000});
   const entryVisible=await page.locator('#entry-screen').isVisible();
   const entryReadyMs=Date.now()-started;
   if(process.argv.includes('--authenticated'))assert.equal(entryVisible,false,'Saved login must reach workspace');
   if(entryVisible){
    assert.equal(await page.locator('.preview-shell').isVisible(),false);
    assert.equal(await page.locator('.preview-shell').evaluate(el=>el.inert),true);
   }else{
    await page.getByRole('button',{name:'앱 설정',exact:true}).click();
    await page.locator('[data-page="settings"]:visible').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#business-list-refresh').disabled,{},{timeout:20000});
    assert.equal(await page.locator('#business-list-title').innerText(),'내 사업장');
    assert.ok(await page.locator('#business-list button:enabled').count()<=1);
    if(process.argv.includes('--authenticated')&&run===0){
     const workspaceOpen=page.getByRole('button',{name:'주문 업무 열기',exact:true});
     assert.equal(await workspaceOpen.count(),1,'Bound owner workspace has one entry button');
     await workspaceOpen.click();
     await page.locator('[data-page="orders"]:visible').waitFor({timeout:20000});
     const workspaceRead=await page.evaluate(()=>({status:connectionResult?.status,scope:connectionResult?.scope}));
     assert.ok(['READY','PARTIAL'].includes(workspaceRead.status));
     assert.equal(workspaceRead.scope,'ACTIVE');
     orderReads.push({...workspaceRead,action:'workspaceButton'});
     const originalRows=await page.locator('.order-row').count();
     await page.locator('.order-more-filters > summary').click();
     await page.getByLabel('현재 페이지 정렬').selectOption('AMOUNT_DESC');
     assert.equal(await page.locator('.order-row').count(),originalRows);
     await page.locator('.order-more-filters > summary').click();
     await page.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();
     assert.equal(await page.getByLabel('현재 페이지 채널').inputValue(),'ALL');
     assert.equal(await page.getByLabel('현재 페이지 정렬').inputValue(),'DEFAULT');
     assert.equal(await page.locator('.order-row').count(),originalRows);
     for(const [action,scope] of [['viewActive','ACTIVE'],['viewRegistered','REGISTER'],['viewInTransit','IN_TRANSIT'],['viewCompleted','COMPLETED']]){
      const startedRead=Date.now();
      const read=await page.evaluate(async action=>{
       await runHubAction(action);
       return {status:connectionResult?.status,scope:connectionResult?.scope,total:connectionResult?.total,offset:connectionResult?.offset,rows:document.querySelectorAll('#order-list .order-row').length};
      },action);
      assert.ok(['READY','PARTIAL'].includes(read.status),`Scope ${scope} must load`);assert.equal(read.scope,scope);assert.ok(read.rows<=20);assert.ok(read.total>=read.rows);
      orderReads.push({...read,durationMs:Date.now()-startedRead});
     }
     if(orderReads.at(-1).total>20){
      for(const [action,offset] of [['nextPage',20],['previousPage',0]]){
       const read=await page.evaluate(async action=>{await runHubAction(action);return {status:connectionResult?.status,scope:connectionResult?.scope,total:connectionResult?.total,offset:connectionResult?.offset,rows:document.querySelectorAll('#order-list .order-row').length};},action);
       assert.ok(['READY','PARTIAL'].includes(read.status));assert.equal(read.offset,offset);assert.equal(read.scope,'COMPLETED');assert.ok(read.rows>0&&read.rows<=20);orderReads.push({...read,action});
      }
     }
     await page.evaluate(()=>runHubAction('viewActive'));
    }
    await page.getByRole('button',{name:'오늘',exact:true}).click();
    if(process.argv.includes('--authenticated')&&run===0){
     await page.getByRole('button',{name:'전체 상태 조회',exact:true}).click();
     await page.waitForFunction(()=>!document.querySelector('#overview-refresh').disabled,{},{timeout:30000});
     for(const scope of ['ACTIVE','REGISTER','IN_TRANSIT','COMPLETED']){
      const card=page.locator(`#overview-cards [data-scope="${scope}"]`);
      assert.ok(['READY','PARTIAL'].includes(await card.getAttribute('data-state')));
     }
    }
   }
   assert.deepEqual(errors,[]);
   const sessionResult=entryVisible?await page.locator('#entry-status').innerText():'업무 화면 진입';
   const businessStatus=entryVisible?'로그인 필요':await page.locator('#business-list-status').innerText();
   results.push({version:state.version,theme:theme.saved,entryVisible,localUiReadyMs,entryReadyMs,runTotalMs:Date.now()-started,sessionResult,businessStatus});
  }finally{await app.close();}
 }
 assert.equal(results[0].theme,results[1].theme);
 console.log(JSON.stringify({status:'PASS',runs:results,orderReads,scope:process.argv.includes('--authenticated')?'installed EXE, saved authenticated session on two launches, four order scopes; no issue or print':'installed EXE, existing profile, local UI/version/theme and restart; not authentication acceptance'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
