'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {BID_URL,sendBid}=require('../keyword-bids.cjs');
const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
test('bid POST is permitted only for a main-process scoped request',()=>{
 const request={url:BID_URL,method:'POST',webContentsId:-1};
 assert.equal(isAllowedRemoteRequest(request,{bidPermit:BID_URL}),true);
 for(const [r,c]of [[request,{}],[{...request,webContentsId:10},{bidPermit:BID_URL}],[{...request,method:'GET'},{bidPermit:BID_URL}],[{...request,url:BID_URL+'?tenant=other'},{bidPermit:BID_URL}]])assert.equal(isAllowedRemoteRequest(r,c),false);
});
test('bid transport rejects redirect, oversized and forged responses without leaking content',async()=>{
 const input={action:'EXECUTE',requestId:'00000000-0000-4000-8000-000000000001',confirm:true};
 for(const response of [new Response('x'.repeat(16385)),Response.json({ok:true,requestId:input.requestId,bid:'900',currentBid:1000,state:'VERIFIED',secret:'private'})]){const r=await sendBid(async()=>response,input);assert.deepEqual(r,{ok:false,code:'BID_RESULT_UNKNOWN'});}
 let called=false;assert.equal((await sendBid(async()=>{called=true;},{})).code,'INVALID_REQUEST');assert.equal(called,false);
 const c=new AbortController();c.abort();assert.equal((await sendBid(async()=>{called=true;},input,c.signal)).code,'BID_RESULT_UNKNOWN');assert.equal(called,false);
});
test('inline login view follows content bounds and cleans up sandboxed content exactly once',()=>{
 const parent=new EventEmitter(),children=[];parent.getContentSize=()=>[1440,960];parent.isDestroyed=()=>false;parent.contentView={addChildView:v=>children.push(v),removeChildView:v=>children.splice(children.indexOf(v),1)};
 let closed=0,prefs;class View{constructor(o){prefs=o.webPreferences;this.webContents=new EventEmitter();this.webContents.isDestroyed=()=>false;this.webContents.close=()=>closed++;}setBounds(b){this.bounds=b;}}
 const Host=require('../inline-login.cjs').createInlineLoginHost({WebContentsView:View}),h=new Host({parent,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
 assert.deepEqual(prefs,{sandbox:true,nodeIntegration:false,contextIsolation:true});assert.deepEqual(h.view.bounds,{x:0,y:48,width:1440,height:912});parent.getContentSize=()=>[1040,720];parent.emit('resize');assert.equal(h.view.bounds.height,672);h.destroy();h.destroy();assert.equal(children.length,0);assert.equal(closed,1);assert.equal(parent.listenerCount('resize'),0);
});
