'use strict';
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createTenantControlStore}=require('./control-store.js');
const {createBusinessListRequest}=require('./business-list-request.js');

// Server composition only. database must be the restricted control adapter;
// identityDb/authAdmin remain server-owned and must never come from a request.
// This factory neither opens a connection nor enables the production route.
function createBusinessListService({database,identityDb,authAdmin,timeoutMs=10000,
 diagnostic=event=>console.info('[BUSINESS_LIST_TIMING]',event)}={}){
 if(typeof window!=='undefined'||typeof document!=='undefined')throw Error('Server runtime required');
 if(typeof diagnostic!=='function')throw TypeError('Invalid diagnostic');
 async function measured(stage,work){
  const started=performance.now();let outcome='failed';
  try{const result=await work();outcome='ok';return result;}
  finally{
   // Fixed categories only: never log SQL, credentials, rows or provider errors.
   try{diagnostic({stage,outcome,durationMs:Math.round(performance.now()-started)});}catch{}
  }
 }
 const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs});
 if(!database||typeof database.query!=='function'||typeof database.transaction!=='function')throw TypeError('Invalid database');
 const store=createTenantControlStore({database:{
  query:(...args)=>measured('control-query',()=>database.query(...args)),
  transaction:callback=>database.transaction(callback),
 },verifySession:credential=>measured('identity',()=>verifySession(credential))});
 return createBusinessListRequest({listBusinesses:input=>store.listBusinesses(input),timeoutMs});
}
module.exports={createBusinessListService};
