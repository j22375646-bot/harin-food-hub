'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadWorkspaceInventory}=require('../lib/dashboard/workspace-inventory-loader.js');
const {sources,database}=require('../desktop/test/fixtures/inventory.cjs');
test('inventory preserves separate providers, unknown options and oldest timestamps',async()=>{
 const db=database(sources());const result=await loadWorkspaceInventory({db});assert.equal(result.items.length,2);
 const c=result.items[0].channels;assert.equal(c[0].quantity,null);assert.equal(c[0].unmanaged,true);assert.equal(c[1].state,'REFERENCE');assert.equal(c[2].quantity,5);assert.equal(c[2].state,'LOW');assert.equal(c[2].stale,true);assert.equal(c[3].quantity,null);assert.equal(c[3].state,'UNKNOWN');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|raw_data/);assert.equal(result.items[1].channels[1].quantity,0);assert.equal(result.items[1].channels[1].state,'OUT_OF_STOCK');
 assert.ok(db.operations.filter(r=>r[1]==='select').every(r=>!r[2].includes('*')));
});
test('incomplete sets, DB errors and ambiguous mapping cannot yield stock success',async()=>{
 await assert.rejects(loadWorkspaceInventory({db:database({},'master_products')}));
 await assert.rejects(loadWorkspaceInventory({db:database({master_products:Array(201).fill({id:'x',name:'x'})})}));
 const data=sources();data.channel_products.push({...data.channel_products[0],id:'duplicate'});await assert.rejects(loadWorkspaceInventory({db:database(data)}),/Ambiguous/);
});
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',B='10000000-0000-4000-8000-000000000002';
const request=(id=A,query='')=>new Request(`https://hub.example/api/moaon/businesses/${id}/inventory${query}`,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const context=(id=A,role='OWNER',version=1)=>resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:id},{now:()=>new Date(),findMembership:async()=>({tenantId:id,userId:'user',role,status:'ACTIVE',version})});
const create=options=>require('../lib/tenancy/workspace-inventory-request.js').createWorkspaceInventoryRequest(options);
test('Inventory requires the legacy workspace owner and rejects queries, missing auth and writes',async()=>{
 let reads=0;for(const [id,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']])assert.equal((await create({resolveContext:()=>context(id,role),readInventory:async()=>{reads++;}})(request(id))).status,403);
 const handler=create({resolveContext:()=>{reads++;return context();},readInventory:async()=>({})});for(const req of [request(A,'?tenant=other'),new Request(request().url),new Request(request(),{method:'POST'})])assert.notEqual((await handler(req)).status,200);assert.equal(reads,0);
});
test('Inventory rechecks owner membership after reading and redacts internal errors',async()=>{
 let calls=0;const result=await create({resolveContext:()=>context(A,'OWNER',++calls),readInventory:async()=>({items:[{private:'PRIVATE'}]})})(request());assert.equal(result.status,409);assert.doesNotMatch(await result.text(),/PRIVATE/);
 const failed=await create({resolveContext:()=>context(),readInventory:async()=>{throw Error('PRIVATE_SQL');}})(request());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE/);
 const response=await create({resolveContext:()=>context(),readInventory:()=>loadWorkspaceInventory({db:database()})})(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual((await response.json()).items,[]);
});
