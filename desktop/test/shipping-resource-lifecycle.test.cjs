'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function host(){
 const events=new Map(),timeouts=new Map(),intervals=new Map(),page={hidden:false},note={};let next=0,calls=0,items=[];
 const document={hidden:false,querySelectorAll:()=>[],querySelector:s=>s==='[data-page="orders"]'?page:null,getElementById:()=>note,addEventListener:(name,fn)=>events.set(name,fn)};
 const window={addEventListener(){},moaonHub:{cancelShippingProgress(){},async readShippingProgress(){calls++;return {status:'READY',value:{scopeKey:'a'.repeat(64),checkedAt:new Date().toISOString(),items}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/shipping-progress.js'),'utf8'),{window,document,Date,Map,Set,Object,Number,Array,setTimeout:(fn,delay)=>{const id=++next;timeouts.set(id,{fn,delay});return id;},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{const id=++next;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)});
 return {api:window.moaonShippingProgress,timeouts,intervals,setItems:value=>items=value,hide:()=>{page.hidden=true;events.get('moaon-route-changed')();},show:()=>{page.hidden=false;events.get('moaon-route-changed')();},calls:()=>calls};
}
const order=n=>({hubOrderId:'HR-C24-'+n.toString(16).toUpperCase().padStart(8,'0'),platform:'CAFE24'});
const item=(n,status)=>({...order(n),phase:'REGISTER',status,requestId:'test-'+n,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
test('idle hidden order view pauses reads and resumes when returned; pending work continues at reduced cadence',async()=>{
 const h=host();h.api.watch([order(1)]);h.setItems([item(1,'REGISTERED')]);await h.api.poll();const before=h.calls();h.hide();assert.equal(h.timeouts.size,0);await h.api.poll();assert.equal(h.calls(),before);
 h.show();assert.equal([...h.timeouts.values()][0].delay,0);h.setItems([item(2,'RUNNING')]);h.api.watch([order(2)]);await h.api.poll();assert.equal(h.intervals.size,1);
 h.hide();assert.equal(h.intervals.size,0);assert.equal([...h.timeouts.values()][0].delay,15000);const pendingCalls=h.calls();await h.api.poll();assert.equal(h.calls(),pendingCalls+1);assert.equal(h.api.snapshot().find(r=>r.id===order(2).hubOrderId).status,'RUNNING');
 h.setItems([item(2,'REGISTERED')]);await h.api.poll();assert.equal(h.timeouts.size,0);assert.equal(h.api.snapshot().find(r=>r.id===order(2).hubOrderId).status,'REGISTERED');h.show();assert.equal([...h.timeouts.values()][0].delay,0);
});
test('offline local progress is bounded even when no server merge succeeds; active batch survives eviction',()=>{
 const h=host();for(let page=0;page<60;page++){const orders=Array.from({length:20},(_,i)=>order(page*20+i+1));h.api.start(orders.map(o=>({id:o.hubOrderId,platform:o.platform})),()=>{});h.api.finish({results:orders.map(o=>({hubOrderId:o.hubOrderId,phase:'REGISTER',status:'REGISTERED'}))});h.api.watch(orders);assert.ok(h.api.resourceUsage().cachedRows<=200);}
 const live=order(99999);h.api.start([{id:live.hubOrderId,platform:live.platform}],()=>{});h.hide();h.api.update({hubOrderId:live.hubOrderId,phase:'ISSUE',status:'RUNNING'});for(let i=0;i<10;i++)h.api.watch([order(i+2000)]);assert.equal(h.api.snapshot().find(r=>r.id===live.hubOrderId).phase,'ISSUE');assert.equal(h.api.resourceUsage().active,true);h.api.finish({results:[{hubOrderId:live.hubOrderId,phase:'REGISTER',status:'REGISTERED'}]});assert.equal(h.api.snapshot().find(r=>r.id===live.hubOrderId).status,'REGISTERED');h.api.reset();assert.equal(h.api.resourceUsage().cachedRows,0);assert.equal(h.api.resourceUsage().lookupEntries,0);assert.equal(h.api.resourceUsage().invoiceEntries,0);assert.equal(h.intervals.size,0);assert.equal(h.timeouts.size,0);
});
