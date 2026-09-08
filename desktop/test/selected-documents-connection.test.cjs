'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHubConnection,registerConnectionIpc}=require('../hub-connection.cjs');
const {createSelectedDocuments}=require('../selected-documents.cjs');
const base={hubOrderId:'HR-C24-1234ABCD',platform:'CAFE24',externalOrderId:'TEST',fulfillment:'SELLER',stage:'SHIPPING',productName:'차',quantity:1,amount:null,cancelled:false,cancellationRequested:false,invoice:{status:'REGISTERED',number:'1234567890123'},receiver:{name:'TEST',address:'TEST ROAD',contact:'01012345678',postCode:'12345'}};
function setup({onDialog=async()=>({canceled:false,filePath:'fake.csv'}),read=()=>[base],timeoutMs=15000,labelPreview=null}={}){
 const writes=[],calls=[];
 const remote={setPermissionCheckHandler(){},setPermissionRequestHandler(){},on(){},webRequest:{onBeforeRequest(){}},async clearStorageData(){},async clearCache(){},async clearAuthCache(){},async fetch(url,options){calls.push({url,options});assert.equal(options.method,'GET');const orders=await read();return Response.json({ok:true,orders,total:orders.length,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});}};
 const documents=createSelectedDocuments({dialog:{showSaveDialog:onDialog},getParent:()=>({}),writeFile:async(...args)=>writes.push(args)});
 const connection=createHubConnection({BrowserWindow:class{},session:{fromPartition:()=>remote},getMainWindow:()=>({isDestroyed:()=>false}),selectedDocuments:documents,timeoutMs,labelPreview});
 return {connection,writes,calls};
}
test('selected CSV reads fresh current page then writes only chosen IDs through native service',async()=>{
 const f=setup();await f.connection.refresh();assert.equal((await f.connection.exportSelectedCsv([base.hubOrderId])).status,'CSV_SAVED');assert.equal(f.writes.length,1);assert.ok(f.calls.length>=3);
});
test('document initial reads settle and release busy on timeout/logout even if transport ignores abort',async()=>{
 for(const kind of ['exportSelectedCsv','previewLabels','previewLabel'])for(const mode of ['timeout','logout']){
  let stalled=false,finish,opens=0;
  const f=setup({timeoutMs:10,read:()=>stalled?new Promise(resolve=>{finish=resolve;}):[base],labelPreview:{close(){},open:async()=>{opens++;return {status:'PREVIEW_OPEN'};}}});
  await f.connection.refresh();stalled=true;
  const pending=f.connection[kind](kind==='previewLabel'?base.hubOrderId:[base.hubOrderId]);
  if(mode==='logout')await f.connection.disconnect();
  let timer;const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'HUNG'}),100);})]);clearTimeout(timer);
  assert.notEqual(result.status,'HUNG',kind+mode);stalled=false;await f.connection.refresh();
  assert.notEqual((await f.connection[kind](kind==='previewLabel'?base.hubOrderId:[base.hubOrderId])).status,'BUSY');
  const before=opens;finish?.([{...base,productName:'LATE'}]);await new Promise(resolve=>setImmediate(resolve));assert.equal(opens,before,'late read must not open an old document');
 }
});
test('missing malformed duplicate and empty selection never write',async()=>{
 const f=setup();await f.connection.refresh();
 for(const ids of [[],['HR-C24-1234ABCD','HR-C24-1234ABCD'],['bad'],Array(21).fill(base.hubOrderId)])await assert.rejects(()=>f.connection.exportSelectedCsv(ids));
 assert.equal((await f.connection.exportSelectedCsv(['HR-NV-ABCDEF12'])).status,'DOCUMENT_CHANGED');assert.equal(f.writes.length,0);
});
test('changed amount/order, logout or channel while native dialog is open never writes',async()=>{
 for(const mode of ['amount','receiver','logout','channel']){
  let row={...base},f;
  f=setup({read:()=>[row],onDialog:async()=>{
   if(mode==='amount')row={...row,amount:99};
   if(mode==='receiver')row={...row,receiver:{...row.receiver,address:'CHANGED'}};
   if(mode==='logout')await f.connection.disconnect();
   if(mode==='channel')await f.connection.viewChannel('CAFE24');
   return {canceled:false,filePath:'fake.csv'};
  }});await f.connection.refresh();
  assert.notEqual((await f.connection.exportSelectedCsv([base.hubOrderId])).status,'CSV_SAVED',mode);assert.equal(f.writes.length,0,mode);
 }
});
test('Naver export without invoice succeeds while labels reject Naver and duplicate registered invoice',async()=>{
 const nv={...base,hubOrderId:'HR-NV-ABCDEF12',platform:'NAVER',invoice:null};
 const f=setup({read:()=>[nv]});await f.connection.refresh();assert.equal((await f.connection.exportSelectedCsv([nv.hubOrderId])).status,'CSV_SAVED');await assert.rejects(()=>f.connection.previewLabels([nv.hubOrderId]));
 const g=setup({read:()=>[base,{...base,hubOrderId:'HR-CP-ABCDEF12',platform:'COUPANG'}]});await g.connection.refresh();assert.equal((await g.connection.previewLabels([base.hubOrderId,'HR-CP-ABCDEF12'])).status,'DOCUMENT_CHANGED');
});
