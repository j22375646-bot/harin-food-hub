'use strict';
// Explicit read-only live acceptance; no credentials or returned business rows logged.
const path=require('node:path'),{_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe'),args:[]});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  let failures=0;
  for(let i=0;i<12;i++){
   if(process.argv.includes('--idle')&&i>0&&i%4===0)await new Promise(resolve=>setTimeout(resolve,15000));
   const result=await page.evaluate(async()=>{const start=performance.now();const result=await window.moaonHub.listBusinesses();return {status:result.status,ms:Math.round(performance.now()-start)};});
   console.log({attempt:i+1,...result});
   if(result.status!=='READY')failures++;
  }
  if(failures)throw Error('Business read acceptance failed');
 }finally{await app.close();}
})().catch(e=>{console.error(e.name);process.exitCode=1;});
