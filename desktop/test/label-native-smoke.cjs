'use strict';
const {app,BrowserWindow,Menu,dialog,session}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createLabelPreview}=require('../label-preview.cjs');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'moaon-label-native-')));
app.whenReady().then(async()=>{
 app.on('browser-window-created',(_event,win)=>{const run=win.webContents.executeJavaScript.bind(win.webContents);win.webContents.executeJavaScript=async(...args)=>{try{const value=await run(...args);console.error('inspection',JSON.stringify(value));return value;}catch(error){console.error(error);throw error;}};win.webContents.on('did-navigate',(_e,url,code)=>console.error('navigation',url,code));win.webContents.on('did-fail-load',(_e,code,description)=>console.error('load',code,description));});
 let preview,parent;
 try{
  const remote=session.fromPartition('persist:moaon-harin-readonly',{cache:false});
  remote.protocol.handle('https',()=>new Response('<html><body><script>globalThis.bad=true</script><article class="label"><div class="receiver"><h1>TEST</h1><strong>01012345678</strong><p>(12345) TEST ADDRESS</p></div><div class="barcode"><b>1234567890123</b></div><footer><span>HR-C24-1234ABCD</span></footer></article></body></html>',{headers:{'Content-Type':'text/html'}}));
  parent=new BrowserWindow({show:false});
  preview=createLabelPreview({BrowserWindow,Menu,dialog,getParent:()=>parent});
  const result=await preview.open({hubOrderId:'HR-C24-1234ABCD',trackingNo:'1234567890123',expectedReceiver:{name:'TEST',contact:'01012345678',postCode:'12345',address:'TEST ADDRESS'},validate:async()=>true});
  console.log(JSON.stringify(result));assert.equal(result.status,'PREVIEW_OPEN');
  const child=BrowserWindow.getAllWindows().find(win=>win!==parent);
  assert.equal(await child.webContents.executeJavaScript('globalThis.bad===true'),false);
  preview.close();parent.destroy();app.exit(0);
 }catch(error){console.error(error);preview?.close();parent?.destroy();app.exit(1);}
});
