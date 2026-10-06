'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createFinanceContextResolver}=require('../lib/tenancy/workspace-finance-runtime.js');
const tenantId='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',userId='20000000-0000-4000-8000-000000000001';
function fixture(){
 let leases=0,checks=0,active=true;const sql=[];
 const database={query:()=>{throw Error('Unscoped connection');},transaction:async callback=>{leases++;return callback({query:async text=>{sql.push(text);if(text.startsWith('SET '))return {rows:[]};if(text.includes('clock_timestamp'))return {rows:[{database_now:new Date()}]};if(text.includes('from moaon_control.memberships'))return {rows:active?[{tenant_id:tenantId,user_id:userId,role:'OWNER',status:'ACTIVE',version:1}]:[]};throw Error('Unexpected query');}});}};
 const verifySession=async()=>{checks++;return {id:'30000000-0000-4000-8000-000000000001',userId,expiresAt:'2099-01-01T00:00:00Z'};};
 return {database,verifySession,sql,stats:()=>({leases,checks}),revoke:()=>{active=false;}};
}
test('finance keeps all clock and membership checks on one read-only lease per authorization',async()=>{
 const f=fixture(),resolve=createFinanceContextResolver(f);
 assert.equal((await resolve({tenantId,sessionCredential:'opaque'})).role,'OWNER');
 assert.deepEqual(f.stats(),{leases:1,checks:1});
 assert.deepEqual(f.sql.slice(0,2),['SET TRANSACTION READ ONLY','SET LOCAL idle_in_transaction_session_timeout = 12000']);
 assert.equal(f.sql.filter(sql=>sql.includes('clock_timestamp')).length,4);
 f.revoke();await assert.rejects(()=>resolve({tenantId,sessionCredential:'opaque'}),{code:'TENANT_ACCESS_DENIED'});
 assert.deepEqual(f.stats(),{leases:2,checks:2});
});
test('finance refuses a context when lease commit/cleanup fails',async()=>{
 const f=fixture(),transaction=f.database.transaction;
 f.database.transaction=async work=>{await transaction(work);throw Error('cleanup failed');};
 await assert.rejects(()=>createFinanceContextResolver(f)({tenantId,sessionCredential:'opaque'}));
});
