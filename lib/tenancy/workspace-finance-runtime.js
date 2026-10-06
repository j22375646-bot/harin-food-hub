'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createTenantControlStore}=require('./control-store.js');
const {createWorkspaceFinanceRequest,guardWorkspaceFinanceRequest}=require('./workspace-finance-request.js');
function createFinanceContextResolver({database,verifySession}){
 return input=>database.transaction(async client=>{
  // Keep all existing checks, but avoid five session-pooler reconnects per check.
  await client.query('SET TRANSACTION READ ONLY');
  // Identity verification is bounded at 10s; do not expire its lease at 5s.
  await client.query('SET LOCAL idle_in_transaction_session_timeout = 12000');
  const scoped={query:(...args)=>client.query(...args),transaction:()=>{throw Error('Nested finance transaction forbidden');}};
  return createTenantControlStore({database:scoped,verifySession}).resolveContext(input);
 });
}
function createWorkspaceFinanceRuntime({readFinance}={}){
 if(typeof readFinance!=='function')throw TypeError('Trusted finance reader required');
 return createBusinessListRuntime({
  guardRequest:guardWorkspaceFinanceRequest,
  createService:({database,identityDb,authAdmin})=>{
   const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
   return createWorkspaceFinanceRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readFinance});
  }
 });
}
module.exports={createWorkspaceFinanceRuntime,createFinanceContextResolver};
