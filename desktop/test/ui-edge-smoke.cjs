'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const runtime=process.env.MOAON_EDGE_RUNTIME||path.resolve(__dirname,'..'),profile=fs.mkdtempSync('D:/GPT/tmp/ui-edge-');
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:runtime,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>runHubAction('disconnect'));
 await app.evaluate(({session})=>{const me='10000000-0000-4000-8000-000000000001';session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(url.endsWith('/api/moaon/team'))return Response.json({ok:true,value:{me,members:[{id:me,name:'화면 검증 직원',title:'직원',color:'violet',notifications:false,revision:1}],tasks:Array.from({length:20},(_,i)=>({id:'20000000-0000-4000-8000-'+String(i).padStart(12,'0'),title:'화면 검증 업무 '+i,notes:'',due_date:'2026-09-13',assigned_to:me,created_by:me,checklist:[],status:i===1?'DONE':'OPEN',revision:1})),events:[]}});
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',stage:'PAID',productName:'HACCP 검증용 여주차 300g · 긴 상품명과 옵션 줄바꿈 확인',quantity:2,amount:11000}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('viewActive'));await page.waitForFunction(()=>document.querySelectorAll('#team-board .team-task').length===20);
 for(const theme of ['light','dark'])for(const width of [1040,1440]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>{applyTheme(t);showRoute('today');},theme);
  const order=page.locator('.daybook-order').first();await order.waitFor();await order.hover();await page.waitForTimeout(200);
  const hover=await order.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {radius:parseFloat(s.borderRadius),left:r.left-p.left,right:p.right-r.right,padding:parseFloat(s.paddingLeft)};});assert.ok(hover.radius>=10&&hover.left>=10&&hover.right>=10&&hover.padding>=10,JSON.stringify(hover));
  await page.screenshot({path:`D:/GPT/tmp/p4142-hover-${theme}-${width}.png`});await page.evaluate(()=>showRoute('calendar'));
  await page.locator('#team-board .team-complete').first().focus();
  const checks=await page.locator('#team-board .team-complete').evaluateAll(es=>es.map(e=>({after:getComputedStyle(e,'::after').content,before:getComputedStyle(e,'::before').content,radius:getComputedStyle(e).borderRadius})));
  assert.ok(checks.every(c=>c.after==='none'&&c.before==='""'&&c.radius==='8px'));
  const clearance=await page.locator('#team-board .team-complete').first().evaluate(e=>{const r=e.getBoundingClientRect(),list=e.closest('.team-list'),p=list.getBoundingClientRect();return {left:r.left-p.left,top:r.top-p.top,overflow:list.scrollWidth>list.clientWidth};});assert.ok(clearance.left>=6);assert.equal(clearance.overflow,false);
  await page.screenshot({path:`D:/GPT/tmp/p4142-calendar-${theme}-${width}.png`});
 }
 const links=await app.evaluate(async({app,shell},runtime)=>{
  const require=process.getBuiltinModule('module').createRequire(runtime+'/package.json');const fs=require('node:fs/promises'),path=require('node:path'),root=app.getPath('userData'),appData=path.join(root,'fake-roaming'),desktop=path.join(root,'fake-desktop'),menu=path.join(appData,'Microsoft','Windows','Start Menu','Programs');await fs.mkdir(menu,{recursive:true});await fs.mkdir(desktop,{recursive:true});
  const old=path.join(menu,'Moaon Preview.lnk');shell.writeShortcutLink(old,'create',{target:'D:\\removed\\MoaonPreview.exe',appUserModelId:'com.moaon.desktop.main'});
  const icon=path.join(root,'moaon-desktop-icon-v1.ico'),executable='D:\\current\\MoaonPreview.exe';const repaired=await require(path.join(runtime,'windows-shortcuts.cjs')).repairShortcuts({shell,fs,appData,desktop,executable,icon,appId:'com.moaon.desktop.main'});
  return repaired.map(p=>shell.readShortcutLink(p)).map(s=>({target:s.target,icon:s.icon,id:s.appUserModelId}));
 },runtime);assert.equal(links.length,3);assert.ok(links.every(s=>s.target==='D:\\current\\MoaonPreview.exe'&&s.icon.endsWith('moaon-desktop-icon-v1.ico')&&s.id==='com.moaon.desktop.main'));
 assert.deepEqual(errors,[]);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false);console.log('PASS hover insets/radius, single check glyph, scroll focus clearance, real Windows shortcut repair in isolated directories; no production changes');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
