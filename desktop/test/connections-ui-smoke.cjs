'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:process.env.MOAON_CONNECTIONS_RUNTIME||path.resolve(__dirname,'..'),MOAON_TEST_PROFILE:fs.mkdtempSync('D:/GPT/tmp/connection-ui-'),MOAON_TEST_HIDDEN:'0',MOAON_TEST_DISPLAY:'main'}});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({session})=>{globalThis.savedKeyInputs=[];globalThis.keyRevision=2;session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{
  if(url.endsWith('/api/moaon/connections')){const input=JSON.parse(options.body);const fields={COUPANG:['vendorId','accessKey','secretKey'],NAVER:['clientId','clientSecret','customerId','apiKey','secretKey'],CAFE24:['mallId','clientId','clientSecret'],EPOST:['customerNo','approvalNo','officeSerial','apiKey','securityKey','trackingApiKey']};
   if(input.action==='LIST')return Response.json({ok:true,cards:Object.entries(fields).map(([provider,names])=>({provider,name:({COUPANG:'쿠팡',NAVER:'네이버 커머스 · 광고',CAFE24:'카페24',EPOST:'우체국'})[provider],revision:globalThis.keyRevision,expiresAt:provider==='COUPANG'?'2027-03-12T01:54:00+09:00':null,fields:names,identity:[names[0]],editable:true}))});
   if(input.action==='REVEAL')return Response.json({ok:true,provider:input.provider,revision:globalThis.keyRevision,fields:Object.fromEntries(fields[input.provider].map(k=>[k,'SYNTHETIC-'+k]))});
   if(input.action==='SAVE'){globalThis.savedKeyInputs.push(input);globalThis.keyRevision++;return Response.json({ok:true,revision:globalThis.keyRevision,status:'SAVED_UNVERIFIED'});}
   return Response.json({ok:true,status:'QUEUED'});
  }
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };});
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.evaluate(()=>showRoute('settings'));
 await page.waitForFunction(()=>document.querySelectorAll('.key-card').length===4);
 assert.equal(await page.locator('.key-editor input').count(),0,'no secrets until explicit reveal');
 const card=page.locator('.key-card').first();await card.getByRole('button',{name:'저장된 키 확인 · 수정'}).click();
 await page.waitForFunction(()=>document.querySelector('.key-editor input[name=secretKey]'));
 assert.equal(await card.locator('[name=secretKey]').getAttribute('type'),'password');
 await card.getByRole('button',{name:'키 값 표시',exact:true}).click();assert.equal(await card.locator('[name=secretKey]').getAttribute('type'),'text');
 await card.locator('[name=secretKey]').fill('SYNTHETIC-ROTATED');
 page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'변경사항 저장'}).click();await page.waitForFunction(()=>document.querySelector('.key-badge').textContent.includes('저장됨'));
 assert.equal(await card.locator('.key-editor input').count(),0,'clear after save');
 assert.equal(await app.evaluate(()=>globalThis.savedKeyInputs[0].fields.secretKey),'SYNTHETIC-ROTATED');
 for(const theme of ['light','dark'])for(const width of [1040,1440]){await page.setViewportSize({width,height:1050});await page.evaluate(t=>{applyTheme(t);document.querySelector('.key-section-heading').scrollIntoView({block:'start'});},theme);await page.screenshot({path:'D:/GPT/tmp/p4137-connections-'+theme+'-'+width+'.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await card.getByRole('button',{name:'저장된 키 확인 · 수정'}).click();await page.waitForFunction(()=>document.querySelector('.key-editor input[name=secretKey]'));await page.evaluate(()=>showRoute('today'));await page.waitForTimeout(100);assert.equal(await page.locator('.key-editor input').count(),0,'clear on navigation');assert.deepEqual(errors,[]);
 console.log('PASS: synthetic credential reveal/mask/save/clear, light/dark and 1040/1440 layout. No real credentials used.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
