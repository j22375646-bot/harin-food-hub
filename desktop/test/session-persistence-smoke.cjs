'use strict';
// Uses a separate profile and a non-production cookie, never real credentials.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile is required');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-session-restart-'));
 const root=path.resolve(__dirname,'..');
 const launch=()=>_electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_PROFILE:profile,MOAON_TEST_RUNTIME_ROOT:process.argv.includes('--packaged')?path.join(root,'dist','win-unpacked','resources','app.asar'):root}});
 const read=app=>app.evaluate(async({session})=>(await session.fromPartition('persist:moaon-harin-readonly').cookies.get({url:'https://session-test.invalid'})).map(c=>({name:c.name,persistent:!c.session})));
 let app;
 try{
  app=await launch();await (await app.firstWindow()).waitForLoadState('domcontentloaded');
  await app.evaluate(async({session})=>session.fromPartition('persist:moaon-harin-readonly').cookies.set({url:'https://session-test.invalid',name:'moaon_persistence_probe',value:'synthetic-not-auth',httpOnly:true,secure:true,sameSite:'lax',expirationDate:Date.now()/1000+43200}));
  await app.close();app=null;
  app=await launch();const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  assert.deepEqual(await read(app),[{name:'moaon_persistence_probe',persistent:true}],'normal restart must retain persistent cookies');
  const result=await page.evaluate(()=>window.moaonHub.disconnect());assert.equal(result.status,'DISCONNECTED');
  assert.deepEqual(await read(app),[],'logout must clear stored cookies');
  await app.close();app=null;
  app=await launch();await (await app.firstWindow()).waitForLoadState('domcontentloaded');
  assert.deepEqual(await read(app),[],'logout must remain cleared after restart');
  console.log('PASS: persistent cookie survives app restart; explicit logout remains cleared after restart; isolated synthetic cookie only');
 }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
