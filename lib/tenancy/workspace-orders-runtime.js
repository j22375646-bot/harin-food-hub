'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createTenantControlStore}=require('./control-store.js');
const {createWorkspaceOrdersRequest,guardWorkspaceOrdersRequest}=require('./workspace-orders-request.js');
function createWorkspaceOrdersRuntime({readOrders}={}){
 if(typeof readOrders!=='function')throw TypeError('Trusted order reader required');
 return createBusinessListRuntime({
  guardRequest:guardWorkspaceOrdersRequest,
  createService:({database,identityDb,authAdmin})=>{
   const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
   const store=createTenantControlStore({database,verifySession});
   return createWorkspaceOrdersRequest({resolveContext:input=>store.resolveContext(input),readOrders});
  },
 });
}
module.exports={createWorkspaceOrdersRuntime};
