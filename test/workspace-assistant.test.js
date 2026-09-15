'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',B='10000000-0000-4000-8000-000000000002';
const request=(id=A,query='')=>new Request('https://hub.example/api/moaon/businesses/'+id+'/assistant'+query,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const context=(id=A,role='OWNER',version=1)=>resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:id},{now:()=>new Date(),findMembership:async()=>({tenantId:id,userId:'user',role,status:'ACTIVE',version})});
const create=options=>require('../lib/tenancy/workspace-assistant-request.js').createWorkspaceAssistantRequest(options);
test('assistant rejects wrong owner and every query before loading',async()=>{
 let loads=0;for(const [id,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']]){
  const response=await create({resolveContext:()=>context(id,role),readAssistant:async()=>{loads++;return {reports:[]};}})(request(id));assert.equal(response.status,403);
 }
 const handle=create({resolveContext:()=>{loads++;return context();},readAssistant:async()=>({reports:[]})});
 for(const req of [request(A,'?days=7'),request(A,'?channel=COUPANG'),new Request(request().url),new Request(request(),{method:'POST'})])assert.notEqual((await handle(req)).status,200);
 assert.equal(loads,0);
});
test('assistant checks permission before and after reading and discards revoked data',async()=>{
 const order=[];const handle=create({resolveContext:()=>{order.push('auth');return context();},readAssistant:async()=>{order.push('read');return {reports:[]};}});
 const response=await handle(request());assert.equal(response.status,200);assert.deepEqual(order,['auth','read','auth']);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal((await response.json()).ok,true);
 for(const role of ['VIEWER','OWNER']){let count=0;const revoked=await create({resolveContext:()=>++count===1?context():context(A,role,2),readAssistant:async()=>({reports:[]})})(request());assert.equal(revoked.status,role==='OWNER'?409:403);}
});
test('assistant deadline prevents late read and internal failures never leak',async()=>{
 let release,loads=0;const response=await create({timeoutMs:5,resolveContext:()=>new Promise(resolve=>release=resolve),readAssistant:async()=>{loads++;return {reports:[]};}})(request());
 assert.equal(response.status,504);release(await context());await new Promise(setImmediate);assert.equal(loads,0);
 const failed=await create({resolveContext:()=>context(),readAssistant:async()=>{throw Error('PRIVATE_SQL');}})(request());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE_SQL/);
});
const {loadWorkspaceAssistant}=require('../lib/dashboard/workspace-assistant-loader.js');
const {projectAssistant}=require('../desktop/assistant-contract.cjs');
const calls=[];
function database({tasks=[],reports=[],fail}={}){return {from(table){const q={};for(const method of ['select','eq','is','lte','order','limit'])q[method]=(...args)=>{calls.push([table,method,...args]);return q;};q.then=(yes,no)=>Promise.resolve(table===fail?{error:{message:'SECRET_SQL'}}:{data:table==='moaon_tasks'?tasks:reports}).then(yes,no);return q;}};}
const channels=['NAVER','CAFE24','COUPANG'].map(platform=>({platform,status:'READY'}));
const options=()=>({db:database(),context:{tenantId:A,userId:'owner'},now:new Date('2026-09-15T15:01:00Z'),ordersReader:async()=>({orders:[],channels}),csReader:async()=>({status:'READY',items:[],truncated:false})});
test('assistant reads only own due tasks, Korea day, and returns no raw private fields',async()=>{
 calls.length=0;const o=options();o.db=database({tasks:[{due_date:'2026-09-16'},{due_date:'2026-09-15'}]});
 const data=await loadWorkspaceAssistant(o);assert.equal(data.status,'READY');assert.deepEqual(data.sources.tasks.counts,{dueToday:1,overdue:1});
 assert.ok(calls.some(c=>c[0]==='moaon_tasks'&&c[1]==='eq'&&c[2]==='assigned_to'&&c[3]==='owner'));assert.ok(calls.some(c=>c[2]==='tenant_id'&&c[3]===A));
 assert.ok(calls.some(c=>c[0]==='reports'&&c[2]==='platform'&&c[3]==='NAVER'));
 assert.doesNotMatch(JSON.stringify(data),/owner|receiver|address|summary_json/);assert.equal(projectAssistant({ok:true,...data}).status,'READY');
});
test('failed and truncated sources remain unknown, healthy channels survive',async()=>{
 const o=options();o.db=database({fail:'moaon_tasks'});o.ordersReader=async()=>({orders:[],channels:channels.map(c=>c.platform==='CAFE24'?{...c,status:'FAILED'}:c)});o.csReader=async()=>({status:'READY',items:[],truncated:true});
 const data=await loadWorkspaceAssistant(o);assert.equal(data.status,'PARTIAL');assert.equal(data.sources.tasks.status,'UNAVAILABLE');assert.equal(data.sources.orders.channels[1].counts,null);assert.equal(data.sources.orders.channels[0].counts.ACTIVE,0);assert.equal(data.sources.cs.channels[0].unanswered,null);assert.doesNotMatch(JSON.stringify(data),/SECRET_SQL/);projectAssistant({ok:true,...data});
 const t=options();t.db=database({tasks:Array.from({length:1001},()=>({due_date:'2026-09-16'}))});assert.equal((await loadWorkspaceAssistant(t)).sources.tasks.counts,null);
});
test('assistant excludes rocket growth and keeps channel units separate',async()=>{
 const o=options();o.ordersReader=async()=>({channels,orders:[{platform:'NAVER',stage:'PAID'},{platform:'CAFE24',stage:'PAID'},{platform:'COUPANG',stage:'PAID',fulfillment:'ROCKET_GROWTH'}]});
 const s=(await loadWorkspaceAssistant(o)).sources.orders;assert.equal(s.channels[0].counts.ACTIVE,1);assert.equal(s.channels[1].counts.ACTIVE,1);assert.equal(s.channels[2].counts.ACTIVE,0);
});
