'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createLabelPreview}=require('../label-preview.cjs');
const target={hubOrderId:'HR-C24-1234ABCD',trackingNo:'1234567890123',goodsName:'시험 상품',quantity:1,validate:async()=>true,expectedReceiver:{name:'TEST',contact:'01012345678',postCode:'12345',address:'TEST ADDRESS'}};
function fixture({valid=true,answer=1,printer=null}={}){
  const windows=[],dialogs=[];let prints=0,menu;
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.dead=false;windows.push(this);this.webContents=Object.assign(new EventEmitter(),{id:55,getURL:()=>this.url,setWindowOpenHandler(){},insertCSS:async()=>{},executeJavaScriptInIsolatedWorld:async()=>valid?{ok:true,count:1,id:target.hubOrderId,invoice:target.trackingNo,receiverValid:true,name:'TEST',contact:'01012345678',address:'(12345) TEST ADDRESS'}:{count:0},print:(options,callback)=>{assert.equal(options.silent,false);prints++;if(printer)printer(callback);else callback(true,'');}});}
    isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}show(){}setTitle(value){this.title=value;}setMenu(value){menu=value;}
    async loadURL(url){this.url=url;}
  }
  const preview=createLabelPreview({BrowserWindow:Window,Menu:{buildFromTemplate:items=>({getMenuItemById:id=>items.find(item=>item.id===id)})},dialog:{showMessageBox:async(_win,options)=>{dialogs.push(options);return {response:answer};}},getParent:()=>({isDestroyed:()=>false})});
  return {preview,windows,dialogs,print:()=>menu.getMenuItemById('print').click(),enabled:()=>menu.getMenuItemById('print').enabled,prints:()=>prints};
}
test('verified label opens without printing; explicit menu confirmation uses non-silent print',async()=>{
  const f=fixture();assert.equal((await f.preview.open(target)).status,'PREVIEW_OPEN');assert.equal(f.prints(),0);
  assert.equal(f.windows[0].options.webPreferences.javascript,false);
  assert.equal(f.windows[0].url,'about:blank');
  assert.equal(f.windows[0].options.webPreferences.partition.startsWith('persist:'),false);
  await f.print();assert.equal(f.prints(),1);
  f.preview.close();assert.equal(f.windows[0].isDestroyed(),true);assert.equal(f.preview.context().labelWebContentsId,null);
});
test('pending print disables menu and repeated clicks never duplicate request',async()=>{
 let done;const f=fixture({printer:callback=>{done=callback;}});await f.preview.open(target);
 const pending=f.print();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.enabled(),false);await f.print();assert.equal(f.prints(),1);
 done(true);await pending;assert.equal(f.enabled(),true);f.preview.close();
});
test('printer cancellation is visible and another attempt warns about duplicate output',async()=>{
 const f=fixture({printer:callback=>callback(false,'Print job canceled')});await f.preview.open(target);await f.print();
 assert.match(f.windows[0].title,/인쇄 취소/);await f.print();assert.match(f.dialogs[1].detail,/중복/);f.preview.close();
});
test('confirm cancellation visibly returns without printing',async()=>{
 const f=fixture({answer:0});await f.preview.open(target);await f.print();
 assert.equal(f.prints(),0);assert.match(f.windows[0].title,/인쇄 취소/);f.preview.close();
});
test('accepted print only reports delivery of request, not physical completion',async()=>{
 const f=fixture();await f.preview.open(target);await f.print();
 assert.match(f.windows[0].title,/실제 출력 확인 필요/);f.preview.close();
});
test('printer failure directs user to printer and queue without automatic retry',async()=>{
 const f=fixture({printer:callback=>callback(false,'Failed')});await f.preview.open(target);await f.print();
 assert.match(f.windows[0].title,/인쇄 실패.*대기열/);assert.equal(f.prints(),1);f.preview.close();
});
test('wrong document and cancelled print do not send a print job',async()=>{
  const bad=fixture({valid:false});assert.equal((await bad.preview.open(target)).status,'PRINT_UNAVAILABLE');assert.equal(bad.prints(),0);
  const cancelled=fixture({answer:0});await cancelled.preview.open(target);await cancelled.print();assert.equal(cancelled.prints(),0);cancelled.preview.close();
});
test('missing expected recipient fails closed',async()=>{
 const f=fixture();assert.equal((await f.preview.open({...target,expectedReceiver:null})).status,'PRINT_UNAVAILABLE');
});
test('different recipient and empty address cannot open a label',async()=>{
 for(const receiver of [{...target.expectedReceiver,name:'OTHER'},{...target.expectedReceiver,address:''}]){
  const f=fixture();assert.equal((await f.preview.open({...target,expectedReceiver:receiver})).status,'PRINT_UNAVAILABLE');assert.equal(f.prints(),0);
 }
});
