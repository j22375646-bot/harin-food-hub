'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadWorkspaceCs}=require('../lib/dashboard/workspace-cs-loader.js');
function database(data={},failure=null){const operations=[];return {operations,from(table){const q={};for(const m of ['select','or','order','limit'])q[m]=(...args)=>{operations.push([table,m,...args]);return q;};q.then=(resolve,reject)=>Promise.resolve({data:data[table]||[],error:table===failure?{message:'PRIVATE_SQL'}:null}).then(resolve,reject);return q;}};}
test('CS worklist uses existing provider completion rules and excludes raw customer content',async()=>{
 const db=database({customer_service_items:[{source_key:'NAVER:INQUIRY:1',platform:'NAVER',kind:'INQUIRY',completed:false,occurred_at:'2026-09-10',content:'PRIVATE_CUSTOMER'},{source_key:'CAFE24:RETURN:2',platform:'CAFE24',kind:'RETURN',completed:true}],coupang_inquiries:[{inquiry_key:'ONLINE:3',answered:false},{inquiry_key:'ONLINE:4',answered:true}],coupang_returns:[{receipt_id:'5',status:'RECEIPT'},{receipt_id:'6',status:'RETURN_COMPLETED'}]});
 const result=await loadWorkspaceCs({db});assert.deepEqual(result.items.map(r=>r.id),['NAVER:INQUIRY:1','COUPANG:INQUIRY:ONLINE:3','COUPANG:RETURN:5']);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CUSTOMER|content/);assert.equal(result.truncated,false);
 assert.ok(db.operations.filter(o=>o[1]==='select').every(o=>!o[2].includes('*')&&!/raw_data|envelope/.test(o[2])));
});
test('CS read failures never become empty success, and bounded reads disclose truncation',async()=>{
 await assert.rejects(loadWorkspaceCs({db:database({},'coupang_inquiries')}),/CS unavailable/);
 const db=database({coupang_inquiries:Array.from({length:201},(_,i)=>({inquiry_key:String(i),answered:false}))});const result=await loadWorkspaceCs({db});assert.equal(result.items.length,200);assert.equal(result.truncated,true);assert.ok(db.operations.filter(o=>o[1]==='limit').every(o=>o[2]===201));
});
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',B='10000000-0000-4000-8000-000000000002';
const request=(id=A,query='')=>new Request(`https://hub.example/api/moaon/businesses/${id}/cs${query}`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const context=(id=A,role='OWNER',version=1)=>resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:id},{now:()=>new Date(),findMembership:async()=>({tenantId:id,userId:'user',role,status:'ACTIVE',version})});
const create=options=>require('../lib/tenancy/workspace-cs-request.js').createWorkspaceCsRequest(options);
test('CS requires the legacy workspace owner and rejects queries, missing auth and writes',async()=>{
 let reads=0;for(const [id,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']])assert.equal((await create({resolveContext:()=>context(id,role),readCs:async()=>{reads++;}})(request(id))).status,403);
 const handler=create({resolveContext:()=>{reads++;return context();},readCs:async()=>({})});for(const req of [request(A,'?tenant=other'),new Request(request().url),new Request(request(),{method:'POST'})])assert.notEqual((await handler(req)).status,200);assert.equal(reads,0);
});
test('CS rechecks owner membership after reading and redacts internal errors',async()=>{
 let calls=0;const result=await create({resolveContext:()=>context(A,'OWNER',++calls),readCs:async()=>({items:[{private:'PRIVATE'}]})})(request());assert.equal(result.status,409);assert.doesNotMatch(await result.text(),/PRIVATE/);
 const failed=await create({resolveContext:()=>context(),readCs:async()=>{throw Error('PRIVATE_SQL');}})(request());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE/);
 const response=await create({resolveContext:()=>context(),readCs:()=>loadWorkspaceCs({db:database()})})(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual((await response.json()).items,[]);
});
