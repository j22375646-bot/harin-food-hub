'use strict';
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createTenantControlStore}=require('./control-store.js');
const {createBusinessListRequest}=require('./business-list-request.js');

// Server composition only. database must be the restricted control adapter;
// identityDb/authAdmin remain server-owned and must never come from a request.
// This factory neither opens a connection nor enables the production route.
function createBusinessListService({database,identityDb,authAdmin,timeoutMs=10000}={}){
 if(typeof window!=='undefined'||typeof document!=='undefined')throw Error('Server runtime required');
 const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs});
 const store=createTenantControlStore({database,verifySession});
 return createBusinessListRequest({listBusinesses:input=>store.listBusinesses(input),timeoutMs});
}
module.exports={createBusinessListService};
