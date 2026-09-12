'use strict';
// Isolated visual audit: synthetic reads only; never uses the installed user's session.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const out=process.env.MOAON_AUDIT_OUTPUT||'D:/GPT/tmp/ui-audit';fs.mkdirSync(out,{recursive:true});
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_AUDIT_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/ui-audit-profile-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
 const page=await app.firstWindow(),errors=[],report=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  if(url.endsWith('/api/moaon/connections'))return Response.json({ok:true,cards:[],services:[]});
  return Response.json({ok:true,orders:[{hubOrderId:'HR-C24-00000001',platform:'CAFE24',fulfillment:'SELLER',stage:'PAID',quantity:2,externalOrderId:'SYNTHETIC',shippingHistoryStatus:'READY',productName:'화면 검증용 작두콩차 · 긴 상품명과 옵션의 줄바꿈 확인',amount:36000,items:[{name:'검증용 작두콩차',option:'30T · 기본 옵션',quantity:2}]}],total:1,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
 const routes=await page.locator('[data-page]').evaluateAll(es=>es.map(e=>e.dataset.page));
 for(const theme of ['light','dark'])for(const width of [1040,1440]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>applyTheme(t),theme);
  for(const route of routes){
   await page.evaluate(r=>{showRoute(r);document.getElementById('main-content').scrollTop=0;},route);await page.waitForTimeout(280);
   const state=await page.evaluate(()=>{
    const root=document.querySelector('.page.is-visible'),visible=e=>!!e.getClientRects().length,css=e=>getComputedStyle(e);
    return {title:[...root.querySelectorAll('h1')].map(e=>({text:e.textContent,size:css(e).fontSize,spacing:css(e).letterSpacing})),overflow:root.scrollWidth>root.clientWidth+1,buttons:[...root.querySelectorAll('button')].filter(visible).map(e=>({id:e.id,cls:e.className,text:e.textContent.trim().slice(0,36),font:css(e).fontSize,height:Math.round(e.getBoundingClientRect().height),bg:css(e).backgroundColor,color:css(e).color})),small:[...root.querySelectorAll('p,label,small,th,td,button')].filter(visible).filter(e=>parseFloat(css(e).fontSize)<13).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,40),size:css(e).fontSize}))};
   });report.push({theme,width,route,...state});
   if(process.env.MOAON_AUDIT_REPORT_ONLY!=='1')assert.equal(state.overflow,false,`${theme}/${width}/${route}: page overflow`);
   if(process.env.MOAON_AUDIT_REPORT_ONLY!=='1')assert.deepEqual(state.small,[],`${theme}/${width}/${route}: unreadably small copy`);
   const groups=await page.locator('.page.is-visible :is(.settlement-periods,.team-tabs,.stock-tabs,.marketing-switch,.month-filters)').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {border:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],buttons:[...e.querySelectorAll(':scope > button')].filter(b=>b.getClientRects().length).map(b=>{const q=b.getBoundingClientRect();return {height:q.height,contained:q.left>=r.left+1&&q.right<=r.right-1,font:parseFloat(getComputedStyle(b).fontSize)};})};}));
   for(const group of groups){assert.deepEqual(group.border,['1px','1px','1px','1px'],'selection group has a balanced enclosing border');for(const button of group.buttons){assert.ok(button.height>=44,'selection control touch target');assert.equal(button.contained,true,'selection stays inside its box');assert.ok(button.font>=14,'selection label readability');}}
   await page.screenshot({path:path.join(out,`${theme}-${width}-${route}.png`),animations:'disabled'});
  }
  for(const id of ['theme-title','app-update-title','settings-connection-title','business-list-title','api-title','settings-history-title']){
   await page.evaluate(id=>{showRoute('settings');moaonSettings.open(id);document.getElementById('main-content').scrollTop=0;},id);await page.waitForTimeout(100);
   await page.screenshot({path:path.join(out,`${theme}-${width}-${id}.png`),animations:'disabled'});
  }
 }
 // Contrast of enabled tab states, plus common refresh control geometry.
 await page.evaluate(()=>{showRoute('stock');applyTheme('dark');});
 const contrast=await page.evaluate(()=>{
  const luminance=s=>{const rgb=s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
  return [...document.querySelectorAll('.stock-tabs button')].map(e=>{const s=getComputedStyle(e),a=luminance(s.color),b=luminance(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 });assert.ok(contrast.every(n=>n>=4.5),'dark stock tabs meet normal-text contrast');
 const refresh=await page.locator('#month-refresh,#settlement-refresh,#insights-refresh,#keyword-refresh,#inventory-refresh,#cs-refresh,#stock-refresh').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return [s.minHeight,s.fontSize,s.color,s.backgroundColor,s.borderRadius];}));for(const style of refresh)assert.deepEqual(style,refresh[0],'refresh controls share one visual role');
 await page.evaluate(()=>showRoute('today'));const expanded=await page.locator('#main-content').evaluate(e=>e.clientWidth);
 await page.locator('#sidebar-toggle').click();assert.ok(await page.locator('#main-content').evaluate(e=>e.clientWidth)>expanded,'collapsing sidebar expands content');
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{showRoute('settings');moaonSettings.open('theme-title');});
 assert.equal(await page.locator('.settings-tab-panel:not([hidden])').evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false,'never steal native focus');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,contrast,report},null,2));assert.deepEqual(errors,[]);
 console.log(`Audited ${report.length} route/theme/width states and 24 settings states; report: ${out}`);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
