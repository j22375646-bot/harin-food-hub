'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createLabelPreview}=require('../label-preview.cjs');
const target={hubOrderId:'HR-C24-1234ABCD',trackingNo:'1234567890123',validate:async()=>true,expectedReceiver:{name:'TEST',contact:'01012345678',postCode:'12345',address:'TEST ADDRESS'}};
function fixture({valid=true,answer=1}={}){
  const windows=[];let prints=0,menu;
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.dead=false;windows.push(this);this.webContents=Object.assign(new EventEmitter(),{id:55,getURL:()=>this.url,setWindowOpenHandler(){},insertCSS:async()=>{},executeJavaScript:async()=>valid?{count:1,id:target.hubOrderId,invoice:target.trackingNo,receiverValid:true,name:'TEST',contact:'01012345678',address:'(12345) TEST ADDRESS'}:{count:0},print:(options,callback)=>{assert.equal(options.silent,false);prints++;callback(true,'');}});}
    isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}show(){}setTitle(){}setMenu(value){menu=value;}
    async loadURL(url){this.url=url;}
  }
  const preview=createLabelPreview({BrowserWindow:Window,Menu:{buildFromTemplate:items=>({getMenuItemById:id=>items.find(item=>item.id===id)})},dialog:{showMessageBox:async()=>({response:answer})},getParent:()=>({isDestroyed:()=>false})});
  return {preview,windows,print:()=>menu.getMenuItemById('print').click(),prints:()=>prints};
}
test('verified label opens without printing; explicit menu confirmation uses non-silent print',async()=>{
  const f=fixture();assert.equal((await f.preview.open(target)).status,'PREVIEW_OPEN');assert.equal(f.prints(),0);
  assert.equal(f.windows[0].options.webPreferences.javascript,false);
  await f.print();assert.equal(f.prints(),1);
  f.preview.close();assert.equal(f.windows[0].isDestroyed(),true);assert.equal(f.preview.context().labelWebContentsId,null);
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
