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

test('registered history stays complete after route changes and a timed-out recheck',async()=>{
 let response=feed([item('REGISTERED')]);const h=host(async()=>response);
 h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();const before=h.api.snapshot()[0];
 h.api.watch([]);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);response={status:'TIMEOUT'};await h.api.poll();
 const row=h.api.snapshot()[0];assert.equal(row.status,'REGISTERED');assert.equal(row.changedAt,before.changedAt);assert.equal(row.syncError,true);assert.equal(row.presentation.tone,'complete');assert.match(row.presentation.label,/등록 완료/);
});

test('the same registered request cannot regress to a pending or missing result',async()=>{
 let response=feed([item('REGISTERED')]);const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();
 for(const status of ['PENDING','UNKNOWN']){response=feed([{...item(status),updatedAt:'2026-10-24T06:01:00.000Z'}]);await h.api.poll();const row=h.api.snapshot()[0];assert.equal(row.status,'REGISTERED');assert.equal(row.presentation.tone,'complete');}
});

test('local registration preserves the invoice identity used for completion',()=>{
 const h=host(async()=>feed());h.api.start([{id,platform:'CAFE24'}],()=>{});h.api.finish({results:[{hubOrderId:id,phase:'REGISTER',status:'REGISTERED',invoiceNumber:'6890176974040'}]});
 assert.equal(h.api.snapshot()[0].registeredInvoice,'6890176974040');
});
test('logout and changed scope discard cached badges and late data',async()=>{
 let response=feed();const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();response=feed([item()],'b'.repeat(64));await h.api.poll();assert.equal(h.api.snapshot().length,0);
 h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();h.api.reset();assert.equal(h.api.snapshot().length,0);
});
test('missing server record retains the prior badge but marks it unconfirmed',async()=>{
 let response=feed();const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();response=feed([{hubOrderId:id,platform:'CAFE24',phase:'QUEUE',status:'UNKNOWN',requestId:null,createdAt:null,updatedAt:null,nextAttemptAt:null}]);await h.api.poll();assert.equal(h.api.snapshot()[0].status,'RUNNING');assert.equal(h.api.snapshot()[0].syncError,true);assert.match(h.note.textContent,/확인 필요/);
});

test('scheduled retry counts down then becomes overdue without pretending to execute',async()=>{
 let response=feed([{...item('PENDING'),nextAttemptAt:'2026-10-24T06:00:11.000Z'}]);
 const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();
 assert.match(h.api.snapshot()[0].presentation.label,/자동 재시도 대기/);
 assert.match(h.api.snapshot()[0].presentation.retry,/10초 후/);
 h.advance(11000);assert.match(h.api.snapshot()[0].presentation.label,/재시도 실행 확인 필요/);
 assert.equal(h.api.snapshot()[0].status,'PENDING');assert.equal(h.api.snapshot()[0].presentation.tone,'attention');
 assert.doesNotMatch(h.api.snapshot()[0].presentation.label,/실패/);
});

test('stalled pending state and read timeout have distinct honest explanations and recover',async()=>{
 let response=feed([item('PENDING')]);const h=host(async()=>response);h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();h.advance(45000);
 assert.match(h.api.snapshot()[0].presentation.reason,/실패로 확정/);
 const changed=h.api.snapshot()[0].changedAt;response={status:'TIMEOUT'};await h.api.poll();
 assert.match(h.api.snapshot()[0].presentation.reason,/조회 응답 시간이/);
 assert.equal(h.api.snapshot()[0].changedAt,changed);
 response=feed([item('PENDING')]);await h.api.poll();assert.equal(h.api.snapshot()[0].syncError,false);assert.equal(h.api.snapshot()[0].changedAt,changed);
});

test('confirmed failure never invents cause or retry from a stale schedule',async()=>{
 const h=host(async()=>feed([{...item('FAILED'),nextAttemptAt:'2026-10-24T06:05:00.000Z'}]));h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();
 const p=h.api.snapshot()[0].presentation;assert.equal(p.tone,'error');assert.match(p.reason,/등록 단계.*실패 기록/);assert.match(p.reason,/세부 원인.*확인 필요/);assert.equal(p.retry,'예정된 자동 재시도 확인 안 됨');
 assert.match(p.next,/주문 상세/);assert.doesNotMatch(p.label,/재시도 대기/);
});

test('local invoice evidence survives finish while unconfirmed invoices stay unknown',()=>{
 const h=host(async()=>feed());h.api.start([{id,platform:'CAFE24'}],()=>{});
 assert.equal(h.api.snapshot()[0].presentation.invoice,'기존 송장 유무 확인 필요');
 h.api.update({hubOrderId:id,phase:'REGISTER',status:'RUNNING',invoiceNumber:'6890176974040'});
 h.api.finish({results:[{hubOrderId:id,phase:'REGISTER',status:'PENDING'}]});assert.match(h.api.snapshot()[0].presentation.invoice,/송장 있음/);
});

test('per-order recheck prioritizes a row beyond the automatic twenty without overlapping reads',async()=>{
 let calls=[];const h=host(async ids=>{calls.push([...ids]);return feed(ids.map(hubOrderId=>({...item(),hubOrderId})));});
 const orders=Array.from({length:21},(_,i)=>({hubOrderId:'HR-C24-'+(i+1).toString(16).toUpperCase().padStart(8,'0'),platform:'CAFE24'}));
 h.api.watch(orders);await h.api.poll();const last=orders[20].hubOrderId;await h.api.recheck(last);
 assert.equal(calls.at(-1)[0],last);assert.equal(calls.at(-1).length,20);assert.equal(new Set(calls.at(-1)).size,20);
 assert.ok(h.api.snapshot().some(row=>row.id===last));const before=calls.length;await h.api.recheck('invalid');assert.equal(calls.length,before);
});

test('cancelled or blocked continuation retains the previously verified operation state',async()=>{
 for(const status of ['REVIEW_CANCELLED','BUSY','ORDER_CHANGED','CHECK_REQUIRED','UNAVAILABLE']){
  const h=host(async()=>feed([item('REGISTERED')]));h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();const before=h.api.snapshot()[0];
  h.api.start([{id,platform:'CAFE24'}],()=>{},true);h.api.update({hubOrderId:id,phase:'CONFIRM',status:'WAIT_USER'});h.advance(3000);h.api.finish({status,results:[]});
  const after=h.api.snapshot()[0];assert.equal(after.status,'REGISTERED',status);assert.equal(after.phase,'REGISTER');assert.equal(after.changedAt,before.changedAt);
  assert.equal(after.syncError,!['REVIEW_CANCELLED','BUSY'].includes(status));
 }
});

test('logout clears a continuation baseline and a late finish cannot restore it',async()=>{
 const h=host(async()=>feed([item('PENDING')]));h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();h.api.start([{id,platform:'CAFE24'}],()=>{},true);h.api.reset();h.api.finish({status:'REVIEW_CANCELLED',results:[]});assert.equal(h.api.snapshot().length,0);
});

test('a rejected or malformed continuation response cannot erase the verified baseline',async()=>{
 for(const result of [undefined,{}, {status:'PARTIAL',results:[]},{status:'COMPLETED',results:[]},{status:'PARTIAL',results:[item('PENDING'),item('PENDING')]}]){
  const h=host(async()=>feed([item('REGISTERED')]));h.api.watch([{hubOrderId:id,platform:'CAFE24'}]);await h.api.poll();const before=h.api.snapshot()[0];h.api.start([{id,platform:'CAFE24'}],()=>{},true);h.api.finish(result);const after=h.api.snapshot()[0];assert.equal(after.status,'REGISTERED');assert.equal(after.phase,'REGISTER');assert.equal(after.changedAt,before.changedAt);assert.equal(after.syncError,true);
 }
});

test('mixed twenty local results stay bound to each order and a duplicate cannot borrow success',()=>{
 const h=host(async()=>feed()),orders=Array.from({length:20},(_,i)=>({id:'HR-'+(i%2?'CP':'C24')+'-'+(i+1).toString(16).toUpperCase().padStart(8,'0'),platform:i%2?'COUPANG':'CAFE24'}));let summary='';h.api.start(orders,text=>summary=text);
 const results=orders.map((o,i)=>({hubOrderId:o.id,phase:i%2?'ISSUE':'REGISTER',status:['REGISTERED','PENDING','FAILED','CHECK_REQUIRED'][i%4]}));for(const row of results)h.api.update({...row,status:'RUNNING'});h.api.finish({status:'PARTIAL',results:[...results,results[0]]});
 assert.equal(h.api.snapshot().length,20);for(const [i,row] of h.api.snapshot().entries())assert.equal(row.status,i===0?'CHECK_REQUIRED':results[i].status);assert.match(summary,/등록 완료 4건/);assert.match(summary,/대기 5건/);h.api.reset();assert.equal(h.api.snapshot().length,0);
});
