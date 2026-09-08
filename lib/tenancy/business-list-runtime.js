'use strict';
const {createConfiguredControlDatabase}=require('./control-database-config.js');
const {createBusinessListService}=require('./business-list-service.js');
const {guardBusinessListRequest}=require('./business-list-request.js');
const dashboardAuth=require('../dashboard-auth.js');

const HEADERS={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff',vary:'Cookie'};
function failure(code){return new Response(JSON.stringify({ok:false,code}),{status:503,headers:HEADERS});}

function createBusinessListRuntime({
 env=process.env,
 createControlDatabase=createConfiguredControlDatabase,
 createIdentityClient=dashboardAuth.createAuthClient,
 createService=createBusinessListService,
 guardRequest=guardBusinessListRequest,
}={}){
 for(const dependency of [createControlDatabase,createIdentityClient,createService,guardRequest])if(typeof dependency!=='function')throw new TypeError('Invalid runtime dependency');
 let ready=null,pending=null,closed=false;
 async function compose(){
  let database;
  try{
   database=createControlDatabase(env);
   if(database===null)return {setupRequired:true};
   if(!database||typeof database.close!=='function')throw Error('Invalid control database');
   const identityClient=createIdentityClient();
   const identityDb=identityClient;
   const authAdmin=identityClient?.auth?.admin;
   if(!identityDb||typeof identityDb.from!=='function'||!authAdmin)throw Error('Invalid identity client');
   const handle=createService({database,identityDb,authAdmin});
   if(typeof handle!=='function')throw Error('Invalid business list service');
   return {database,handle};
  }catch(error){
   if(database&&typeof database.close==='function')try{await database.close();}catch{}
   throw error;
  }
 }
 async function initialize(){
  if(ready)return ready;
  if(!pending){
   pending=Promise.resolve().then(compose).then(value=>{if(!value.setupRequired)ready=value;return value;});
   pending.finally(()=>{pending=null;}).catch(()=>{});
  }
  return pending;
 }
 async function handle(request){
  const guarded=guardRequest(request);
  if(guarded.response)return guarded.response;
  if(closed)return failure('BUSINESS_LIST_UNAVAILABLE');
  try{
   const service=await initialize();
   return service.setupRequired?failure('SETUP_REQUIRED'):service.handle(request);
  }catch{return failure('BUSINESS_LIST_UNAVAILABLE');}
 }
 async function close(){
  closed=true;
  let current=ready;
  if(!current&&pending)try{current=await pending;}catch{}
  ready=null;
  if(current?.database)await current.database.close();
 }
 return Object.freeze({handle,close});
}
module.exports={createBusinessListRuntime};
