'use strict';
// Diagnostic only: dedicated installed-app run. No queue insertion, carrier issue or platform writes.
const path=require('node:path');const {_electron}=require('playwright');
(async()=>{
 if(!process.argv.includes('--installed'))throw Error('Explicit installed flag required');
 const app=await _electron.launch({executablePath:path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe')});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#entry-screen')?.hidden,{},{timeout:30000});
  const result=await app.evaluate(async({session},probe)=>{
   const target='https://harin-cafe24-sync.vercel.app/api/epost/status';
   const remote=session.fromPartition('persist:moaon-harin-readonly');
   // During this diagnostic, reject every request except this fixed GET in Main.
   let requestUrl=target;
   remote.webRequest.onBeforeRequest({urls:['<all_urls>']},(d,done)=>done({cancel:!((d.url===requestUrl&&d.method==='GET'||probe&&d.url===target&&d.method==='POST')&&(!d.webContentsId||d.webContentsId<0))}));
   const options={credentials:'include',redirect:'error',cache:'no-store'};
   if(probe){
    const queued=await remote.fetch(target,{...options,method:'POST',headers:{Origin:'https://harin-cafe24-sync.vercel.app'},signal:AbortSignal.timeout(15000)});
    if(queued.status!==202)return {httpStatus:queued.status,status:'PROBE_QUEUE_FAILED'};
    const job=await queued.json(),id=job.request?.id;
    if(!/^[0-9a-f-]{36}$/i.test(id||''))return {status:'INVALID_REQUEST'};
    requestUrl=target+'?requestId='+id;
   }
   let response,body;
   for(let attempt=0;attempt<(probe?20:1);attempt++){
    response=await remote.fetch(requestUrl,{...options,method:'GET',signal:AbortSignal.timeout(15000)});
    if(![200,202].includes(response.status))return {httpStatus:response.status,status:'UNAVAILABLE'};
    body=await response.json();if(!['PENDING','RUNNING'].includes(body.status))break;
    if(probe)await new Promise(resolve=>setTimeout(resolve,1500));
   }
   if(response.status!==200)return {httpStatus:response.status,status:'UNAVAILABLE'};
   const epost=body.epost||{};
   return {httpStatus:response.status,status:body.status,checkedAt:epost.checkedAt||null,readyForLive:epost.readyForLive??null,readyForTest:epost.readyForTest??null,checks:Object.fromEntries(Object.entries(epost.checks||{}).map(([k,v])=>[k,v.ok===true]))};
  },process.argv.includes('--probe'));console.log(JSON.stringify({scope:'worker configuration only; not a live carrier call',...result}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
