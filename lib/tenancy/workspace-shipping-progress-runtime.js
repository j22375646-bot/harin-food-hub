'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceShippingProgressRequest,guardWorkspaceShippingProgressRequest}=require('./workspace-shipping-progress-request.js');
const {createShippingProgressReader}=require('../shipping/progress-reader.js');
function createWorkspaceShippingProgressRuntime({getDb}={}){
 if(typeof getDb!=='function')throw TypeError('Trusted database required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceShippingProgressRequest,createService:({database,identityDb,authAdmin})=>createWorkspaceShippingProgressRequest({resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})}),readProgress:(...args)=>createShippingProgressReader({db:getDb()})(...args)})});
}
module.exports={createWorkspaceShippingProgressRuntime};
