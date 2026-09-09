'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{_electron}=require('playwright');
const {loadWorkspaceInventory}=require('../../lib/dashboard/workspace-inventory-loader.js');
(async()=>{
 const {sources,database}=require('./fixtures/inventory.cjs');const db=database(sources());
 const payload={ok:true,...await loadWorkspaceInventory({db})};
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-inventory-ui-'));
 const runtimeRoot=process.env.MOAON_INVENTORY_TEST_RUNTIME||path.resolve(__dirname,'..');
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtimeRoot,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'right'}});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>document.querySelector('#entry-status')?.textContent&&!document.querySelector('#entry-status').textContent.includes('확인하고 있습니다'));
  await app.evaluate(({session},payload)=>{globalThis.inventoryFixture={reads:0,error:false,hold:false,payload};session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{const f=globalThis.inventoryFixture;if(!url.endsWith('/inventory'))return new Response('',{status:401});f.reads++;if(f.hold)await new Promise(r=>f.release=r);return f.error?new Response('',{status:503}):Response.json(f.payload);};},payload);
  await page.evaluate(()=>{displayMode='live';document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;showRoute('inventory');const banner=document.createElement('p');banner.textContent='재고·상품 자동 검증 · 가상 상품 자료 · 실제 재고 변경 없음';Object.assign(banner.style,{position:'fixed',bottom:'18px',left:'110px',background:'#172554',color:'white',padding:'12px',zIndex:'99999'});document.body.append(banner);});
  await page.waitForFunction(()=>document.querySelectorAll('.inventory-row').length===2);
  const change=(id,value)=>page.evaluate(({id,value})=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event(id==='inventory-search'?'input':'change',{bubbles:true}));},{id,value});
  await change('inventory-platform','NAVER');assert.equal(await page.locator('.inventory-row').count(),2);await change('inventory-state','OUT_OF_STOCK');assert.match(await page.locator('#inventory-list').innerText(),/깍두기/);await change('inventory-state','ALL');await change('inventory-platform','ALL');
  await change('inventory-search','깍두기');assert.equal(await page.locator('.inventory-row').count(),1);await change('inventory-search','');
  await page.evaluate(()=>document.querySelector('.inventory-row').click());assert.equal(await page.locator('#inventory-detail').isVisible(),true);assert.match(await page.locator('#inventory-detail').innerText(),/재고관리 안 함/);assert.equal(await app.evaluate(()=>globalThis.inventoryFixture.reads),1);
  assert.equal(await page.locator('.inventory-page').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.screenshot({path:path.join(os.tmpdir(),'moaon-inventory-worklist.png')});
  await app.evaluate(()=>globalThis.inventoryFixture.error=true);await page.evaluate(()=>document.getElementById('inventory-refresh').click());await page.waitForFunction(()=>document.getElementById('inventory-status').textContent.includes('실패'));assert.equal(await page.locator('.inventory-row').count(),0);assert.equal(await page.locator('#inventory-detail').isVisible(),false);assert.match(await page.locator('#inventory-count').innerText(),/확인 필요/);
  await app.evaluate(()=>{globalThis.inventoryFixture.error=false;globalThis.inventoryFixture.hold=true;});await page.evaluate(()=>{document.getElementById('inventory-refresh').click();document.getElementById('inventory-refresh').click();});await page.waitForTimeout(200);assert.equal(await app.evaluate(()=>globalThis.inventoryFixture.reads),3);
  await page.evaluate(()=>moaonInventory.clear());await app.evaluate(()=>globalThis.inventoryFixture.release());await page.waitForTimeout(200);assert.equal(await page.locator('.inventory-row').count(),0);
  const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getDisplayMatching(w.getBounds()),p=screen.getPrimaryDisplay();return {focused:w.isFocused(),right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width};});assert.deepEqual(placement,{focused:false,right:true});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',scope:'source loader to transport to IPC to UI; synthetic DB/network',cases:['three channels','platform filter','stock state filter','search','detail','no extra detail request','error clears data','duplicate suppression','late response cleared','right inactive'],placement}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
