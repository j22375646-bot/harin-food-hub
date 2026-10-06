'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  await app.evaluate(({session},diagnose)=>{const remote=session.fromPartition('persist:moaon-harin-readonly'),original=remote.fetch.bind(remote);globalThis.financeProbe=[];remote.fetch=async(url,options)=>{const start=Date.now();try{const response=await original(url,diagnose&&String(url).endsWith('/finance')?{...options,signal:AbortSignal.timeout(30000)}:options);if(String(url).endsWith('/finance')){let payload;try{payload=await response.clone().json();}catch{}globalThis.financeProbe.push({status:response.status,timing:response.headers.get('server-timing'),elapsed:Date.now()-start,code:payload?.code,keys:Object.keys(payload||{}),month:payload?.month,states:Object.fromEntries(Object.entries(payload?.metrics||{}).map(([key,value])=>[key,{status:value.status,type:value.value===null?'null':typeof value.value}]))});}return response;}catch(error){if(String(url).endsWith('/finance'))globalThis.financeProbe.push({error:error.name,elapsed:Date.now()-start});throw error;}finally{if(String(url).endsWith('/finance'))globalThis.financeProbeDone=true;}};},process.argv.includes('--diagnose-timeout'));
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden||document.querySelector('#entry-status')?.textContent.includes('로그인이 필요합니다'),{},{timeout:30000});
  if(!await page.locator('#entry-screen').evaluate(el=>el.hidden)){console.log('BLOCKED LOGIN_REQUIRED');process.exitCode=2;return;}
  await page.evaluate(()=>showRoute('today'));
  await page.waitForFunction(()=>!financeBusy&&financeLastAttempt>0,{},{timeout:45000});
  const result=await page.evaluate(()=>({message:document.querySelector('#finance-status').textContent,month:financeValue?.month,states:Object.fromEntries(Object.entries(financeValue?.metrics||{}).map(([key,value])=>[key,value.status]))}));
  if(process.argv.includes('--diagnose-timeout'))await app.evaluate(async()=>{const end=Date.now()+16000;while(!globalThis.financeProbeDone&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,100));});
  console.log(JSON.stringify({diagnostic:await app.evaluate(()=>globalThis.financeProbe),ui:result}));
  assert.match(result.month||'',/^\d{4}-\d{2}$/);
  assert.equal(await page.locator('#finance-cards article').count(),3);
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.41.1');
  await page.screenshot({path:path.join(__dirname,'..','dist','p457-today.png')});
  console.log(JSON.stringify({status:'PASS',version:'0.41.1',...result,scope:'real finance GET only; amounts omitted; no writes'}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
