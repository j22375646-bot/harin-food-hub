'use strict';
// Synthetic network only; real Main/preload/IPC/BrowserWindow. No print job.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-label-app-'));
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?profile:value);
const root=process.argv.includes('--packaged')?path.resolve(__dirname,'../dist/win-unpacked/resources/app.asar'):path.resolve(__dirname,'..');
require(path.join(root,'main.cjs'));
const timeout=setTimeout(()=>{console.error('TEST TIMEOUT');app.exit(1);},25000);
app.whenReady().then(async()=>{
 try{
  const remote=session.fromPartition('persist:moaon-harin-readonly',{cache:false});
  remote.protocol.handle('https',request=>{
   if(request.method!=='GET')throw Error('Unexpected write');
   if(request.url.includes('/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?'))return Response.json({ok:true,offset:0,total:1,nextOffset:null,snapshot:'a'.repeat(64),partial:false,orders:[{hubOrderId:'HR-C24-1234ABCD',externalOrderId:'TEST-1',platform:'CAFE24',fulfillment:'SELLER',stage:'SHIPPING',productName:'TEST',quantity:1,amount:30000,cancelled:false,cancellationRequested:false,invoiceNumber:'1234567890123',issuedInvoiceNumber:'1234567890123',invoice:{status:'REGISTERED',number:'1234567890123'},receiver:{name:'TEST',address:'TEST ADDRESS',postCode:'12345',contact:'01012345678'}}]});
   if(request.url==='https://harin-cafe24-sync.vercel.app/api/shipping/print?type=label&ids=HR-C24-1234ABCD')return new Response('<html><body><script>document.body.dataset.unsafe="ran"</script><article class="label"><section class="receiver"><h1>TEST</h1><strong>01012345678</strong><p>(12345) TEST ADDRESS</p></section><section class="barcode"><b>1234567890123</b></section><footer><span>HR-C24-1234ABCD</span></footer></article></body></html>',{headers:{'Content-Type':'text/html'}});
   return new Response('',{status:403});
  });
  const wait=async test=>{while(!test())await new Promise(resolve=>setTimeout(resolve,30));};
  await wait(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL()==='moaon://app/index.html'));
  const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='moaon://app/index.html');
  if(main.webContents.isLoading())await new Promise(resolve=>main.webContents.once('did-finish-load',resolve));
  const result=await main.webContents.executeJavaScript('(async()=>{await moaonHub.refresh();return moaonHub.previewLabel("HR-C24-1234ABCD");})()');
  assert.equal(result.status,'PREVIEW_OPEN');
  const child=BrowserWindow.getAllWindows().find(w=>w!==main);
  assert.equal(child.webContents.getLastWebPreferences().javascript,false);
  assert.equal(await child.webContents.executeJavaScriptInIsolatedWorld(999,[{code:'document.body.dataset.unsafe||null'}]),null);
  await main.webContents.executeJavaScript('moaonHub.disconnect()');
  assert.equal(child.isDestroyed(),true);
  console.log(JSON.stringify({status:'PASS',packaged:process.argv.includes('--packaged'),scope:'real Main/IPC preview, page scripts blocked, disconnect closes child; synthetic network; NO PRINT'}));
  clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
});
