'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const id='HR-C24-AAAAAAAA',at='2026-10-24T06:00:00.000Z',req='12345678-1234-4234-8234-123456789012';
const item=(status='RUNNING')=>({hubOrderId:id,platform:'CAFE24',phase:'REGISTER',status,requestId:req,createdAt:at,updatedAt:at,nextAttemptAt:null});
const feed=(items=[item()],scopeKey='a'.repeat(64))=>({status:'READY',value:{scopeKey,checkedAt:at,items}});
function host(read){let tick,now=Date.parse(at)+1000;const note={hidden:false,textContent:'',dataset:{},setAttribute(){}};const document={hidden:false,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},getElementById:()=>note};
 const window={moaonHub:{readShippingProgress:read,cancelShippingProgress:()=>{}},addEventListener(){}};
 const FakeDate=class extends Date{static now(){return now;}};const context=vm.createContext({window,document,Date:FakeDate,setInterval:fn=>{tick=fn;return 1;},clearInterval(){},setTimeout:()=>1,clearTimeout(){},Map,Set,Object,Number,Array});vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/shipping-progress.js'),'utf8'),context);
 return {api:window.moaonShippingProgress,note,advance:ms=>{now+=ms;tick?.();}};
}
test('fresh app restores a server badge without a local shipping job',async()=>{
 const h=host(async()=>feed());h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();const row=h.api.snapshot()[0];assert.equal(row.status,'RUNNING');assert.equal(row.changedAt,Date.parse(at));assert.equal(row.serverCheckedAt,at);
 h.advance(45000);assert.equal(h.api.snapshot()[0].stalled,true);await h.api.poll();assert.equal(h.api.snapshot()[0].changedAt,Date.parse(at),'Repeated polling cannot fake a phase change');
});
test('in-flight old server state cannot overwrite local progress or verified registration',async()=>{
 let release;const h=host(()=>new Promise(r=>release=r));h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);const pending=h.api.poll();h.api.start([{id,platform:'CAFE24'}],()=>{});h.api.update({hubOrderId:id,phase:'ISSUE',status:'RUNNING'});release(feed());await pending;assert.equal(h.api.snapshot()[0].phase,'ISSUE');
 h.api.finish({results:[{hubOrderId:id,phase:'REGISTER',status:'REGISTERED'}]});let end;const next=h.api.poll();end=release;end(feed());await next;assert.equal(h.api.snapshot()[0].status,'REGISTERED');
});
test('polls never overlap and timeout/error keeps prior state with a warning',async()=>{
 let calls=0,release;const h=host(()=>{calls++;return new Promise(r=>release=r);});h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);const p=h.api.poll(),q=h.api.poll();assert.equal(calls,1);release(feed());await Promise.all([p,q]);
 const bad=h.api.poll();release({status:'TIMEOUT'});await bad;assert.equal(h.api.snapshot()[0].status,'RUNNING');assert.equal(h.api.snapshot()[0].syncError,true);assert.match(h.note.textContent,/확인 필요/);
});
test('logout and changed scope discard cached badges and late data',async()=>{
 let response=feed();const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();response=feed([item()],'b'.repeat(64));await h.api.poll();assert.equal(h.api.snapshot().length,0);
 h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();h.api.reset();assert.equal(h.api.snapshot().length,0);
});
test('missing server record retains the prior badge but marks it unconfirmed',async()=>{
 let response=feed();const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();response=feed([{hubOrderId:id,platform:'CAFE24',phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null}]);await h.api.poll();assert.equal(h.api.snapshot()[0].status,'RUNNING');assert.equal(h.api.snapshot()[0].syncError,true);assert.match(h.note.textContent,/확인 필요/);
});
